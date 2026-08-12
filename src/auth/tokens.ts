/**
 * Token storage and refresh, across several signed-in accounts.
 *
 * Four things here are load-bearing for "the kids never see a login screen":
 *
 * 1. Refresh tokens are persisted to localStorage, so they survive the app
 *    being closed and the phone being rebooted.
 * 2. Spotify's PKCE refresh tokens are SINGLE USE — each refresh returns a new
 *    one and invalidates the old. It must be written to storage before the new
 *    access token is handed out. Losing it logs that account out on next launch.
 * 3. Concurrent refreshes must be prevented. Two requests expiring at once
 *    would otherwise both spend the same single-use token; the loser gets its
 *    grant revoked and the user is forced through a full re-login.
 * 4. A refresh writes back to the account id it STARTED with, never to whoever
 *    is active by the time it lands. Switching accounts mid-refresh would
 *    otherwise drop one account's single-use token onto another's row and burn
 *    both grants at once.
 *
 * The store shape itself lives in accounts.ts, as pure transforms; this module
 * is the part that talks to localStorage and to Spotify.
 */

import { CLIENT_ID } from '../config';
import {
  EMPTY_STORE,
  getActive,
  markNeedsReauth,
  migrateV1,
  newPendingId,
  setActive,
  updateTokens,
  upsertAccount,
  type Account,
  type AuthStore,
  type StoredAuthV1,
} from './accounts';

const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
/** Exported so the cross-tab listener watches the same key this module writes. */
export const STORAGE_KEY = 'novid.auth.v2';
/** The pre-multi-account key. Read once, migrated, then removed. */
const LEGACY_KEY = 'novid.auth.v1';
const LOCK_NAME = 'novid.token.refresh';

/** Refresh this far before actual expiry, so in-flight requests don't 401. */
const EXPIRY_MARGIN_MS = 60_000;

/** Thrown when the grant is gone for good and the user must re-authorize. */
export class AuthExpiredError extends Error {
  constructor() {
    super('Spotify authorization expired or was revoked');
    this.name = 'AuthExpiredError';
  }
}

/**
 * Reads the store, lifting a v1 session into it on the way if one is still
 * there. The migration writes immediately and drops the old key, so it runs
 * exactly once — leaving v1 in place would let a stale token resurface later.
 */
export function readStore(): AuthStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AuthStore;

    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = migrateV1(JSON.parse(legacy) as StoredAuthV1);
      writeStore(migrated);
      localStorage.removeItem(LEGACY_KEY);
      return migrated;
    }
  } catch {
    // Corrupt JSON is indistinguishable from no session; either way the only
    // way forward is a fresh authorization.
  }
  return EMPTY_STORE;
}

export function writeStore(store: AuthStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/** Applies a pure transform from accounts.ts to what is on disk. */
export function updateStore(fn: (store: AuthStore) => AuthStore): AuthStore {
  const next = fn(readStore());
  writeStore(next);
  return next;
}

export function activeAccount(): Account | null {
  return getActive(readStore());
}

/** True when any account at all is stored, usable or not. */
export function hasSession(): boolean {
  return readStore().accounts.length > 0;
}

export function clearStored(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_KEY);
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

/** Exchanges the authorization code from the OAuth callback for tokens. */
export async function exchangeCode(
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  }

  // Returned rather than persisted: the caller has to ask Spotify who this is
  // before it knows which account row the tokens belong to.
  return (await res.json()) as TokenResponse;
}

/**
 * Files a freshly authorized set of tokens under an account and makes it
 * active. `id` empty means the profile lookup failed, so the row goes in
 * pending and the startup backfill re-keys it — the tokens are never dropped
 * just because `/me` was unreachable.
 */
export function storeNewGrant(identity: {
  id: string;
  name: string;
  images?: Account['images'];
  tokens: TokenResponse;
}): Account {
  const id = identity.id || newPendingId();
  const account: Account = {
    id,
    name: identity.name,
    images: identity.images,
    refreshToken: identity.tokens.refresh_token ?? '',
    accessToken: identity.tokens.access_token,
    expiresAt: Date.now() + identity.tokens.expires_in * 1000,
    // Fresh authorization, so this account's six-month clock starts now.
    authorizedAt: Date.now(),
  };

  updateStore((store) => setActive(upsertAccount(store, account), id));
  return account;
}

/**
 * In-flight refreshes, keyed by account. Keyed rather than global so switching
 * accounts cannot make one account's caller await the other's request.
 */
const inFlight = new Map<string, Promise<string>>();

/** Forgets a pending refresh, e.g. once its account is gone. */
export function forgetInFlight(accountId: string): void {
  inFlight.delete(accountId);
}

/**
 * Returns a valid access token for the active account, refreshing if necessary.
 * Safe to call from anywhere concurrently — refreshes are collapsed into one
 * request per account.
 */
export async function getAccessToken(): Promise<string> {
  const account = activeAccount();
  if (!account || account.needsReauth) throw new AuthExpiredError();

  if (account.accessToken && Date.now() < account.expiresAt - EXPIRY_MARGIN_MS) {
    return account.accessToken;
  }
  return refreshAccessToken();
}

/** Forces a refresh of the active account, e.g. after an unexpected 401. */
export function refreshAccessToken(): Promise<string> {
  const account = activeAccount();
  if (!account) return Promise.reject(new AuthExpiredError());

  // Collapse concurrent callers for this account within this tab.
  const id = account.id;
  let pending = inFlight.get(id);
  if (!pending) {
    pending = runRefresh(id).finally(() => inFlight.delete(id));
    inFlight.set(id, pending);
  }
  return pending;
}

async function runRefresh(accountId: string): Promise<string> {
  // Web Locks serialises across tabs of the same origin; without it, two open
  // tabs could each spend the same single-use refresh token. One lock for the
  // whole store, because it guards the read-modify-write of a single blob.
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(LOCK_NAME, () => refreshUnderLock(accountId));
  }
  return refreshUnderLock(accountId);
}

async function refreshUnderLock(accountId: string): Promise<string> {
  // Re-read inside the lock: another tab may have refreshed while we waited, so
  // the token we captured before the lock could already be superseded.
  const stored = readStore().accounts.find((a) => a.id === accountId);
  if (!stored?.refreshToken) throw new AuthExpiredError();

  if (stored.accessToken && Date.now() < stored.expiresAt - EXPIRY_MARGIN_MS) {
    return stored.accessToken;
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: stored.refreshToken,
    }),
  });

  if (!res.ok) {
    // 400 invalid_grant means expired (six-month cap) or revoked. Do not retry:
    // the only cure is a fresh authorization. Only THIS account is affected —
    // every other grant runs on its own clock and stays usable.
    const body = await res.text();
    if (res.status === 400 && body.includes('invalid_grant')) {
      updateStore((store) => markNeedsReauth(store, accountId));
      throw new AuthExpiredError();
    }
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }

  const body = (await res.json()) as TokenResponse;

  // Write back by the id this refresh started with, never to whoever is active
  // now: the user may have switched accounts while the request was in flight.
  const next = updateStore((store) =>
    updateTokens(store, accountId, {
      // Spotify usually rotates the refresh token, but documents that when one
      // is not returned the existing token stays valid. Handle both.
      refreshToken: body.refresh_token ?? stored.refreshToken,
      accessToken: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1000,
    }),
  );

  return (
    next.accounts.find((a) => a.id === accountId)?.accessToken ??
    body.access_token
  );
}

/**
 * Asks Android not to evict our localStorage under storage pressure. Installed
 * PWAs are normally granted this. Still defeated by clearing browsing data.
 */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Best effort only — never block startup on this.
  }
}
