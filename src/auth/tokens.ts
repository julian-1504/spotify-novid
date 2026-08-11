/**
 * Token storage and refresh.
 *
 * Three things here are load-bearing for "the kids never see a login screen":
 *
 * 1. The refresh token is persisted to localStorage, so it survives the app
 *    being closed and the phone being rebooted.
 * 2. Spotify's PKCE refresh tokens are SINGLE USE — each refresh returns a new
 *    one and invalidates the old. It must be written to storage before the new
 *    access token is handed out. Losing it logs the user out on next launch.
 * 3. Concurrent refreshes must be prevented. Two requests expiring at once
 *    would otherwise both spend the same single-use token; the loser gets its
 *    grant revoked and the user is forced through a full re-login.
 */

import { CLIENT_ID } from '../config';

const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const STORAGE_KEY = 'novid.auth.v1';
const LOCK_NAME = 'novid.token.refresh';

/** Refresh this far before actual expiry, so in-flight requests don't 401. */
const EXPIRY_MARGIN_MS = 60_000;

interface StoredAuth {
  refreshToken: string;
  accessToken: string;
  /** Epoch ms at which the access token stops being valid. */
  expiresAt: number;
  /**
   * Epoch ms of the original authorization. Spotify expires refresh tokens six
   * months from this moment and refreshing does NOT reset the clock, so this is
   * only useful for warning ahead of time — never for deciding validity.
   */
  authorizedAt: number;
}

/** Thrown when the grant is gone for good and the user must re-authorize. */
export class AuthExpiredError extends Error {
  constructor() {
    super('Spotify authorization expired or was revoked');
    this.name = 'AuthExpiredError';
  }
}

export function readStored(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

function writeStored(auth: StoredAuth): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

export function clearStored(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasSession(): boolean {
  return readStored() !== null;
}

/** Epoch ms at which the refresh token dies regardless of activity. */
export function grantExpiresAt(): number | null {
  const stored = readStored();
  if (!stored) return null;
  const SIX_MONTHS_MS = 182 * 24 * 60 * 60 * 1000;
  return stored.authorizedAt + SIX_MONTHS_MS;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

function persistTokenResponse(
  body: TokenResponse,
  previous: StoredAuth | null,
): StoredAuth {
  const next: StoredAuth = {
    // Spotify usually rotates the refresh token, but documents that when one is
    // not returned the existing token stays valid. Handle both.
    refreshToken: body.refresh_token ?? previous?.refreshToken ?? '',
    accessToken: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
    authorizedAt: previous?.authorizedAt ?? Date.now(),
  };
  writeStored(next);
  return next;
}

/** Exchanges the authorization code from the OAuth callback for tokens. */
export async function exchangeCode(
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<void> {
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

  // Fresh authorization, so authorizedAt starts now.
  persistTokenResponse((await res.json()) as TokenResponse, null);
}

let inFlight: Promise<string> | null = null;

/**
 * Returns a valid access token, refreshing if necessary. Safe to call from
 * anywhere concurrently — refreshes are collapsed into one request.
 */
export async function getAccessToken(): Promise<string> {
  const stored = readStored();
  if (!stored) throw new AuthExpiredError();

  if (stored.accessToken && Date.now() < stored.expiresAt - EXPIRY_MARGIN_MS) {
    return stored.accessToken;
  }
  return refreshAccessToken();
}

/** Forces a refresh, e.g. after an unexpected 401. */
export function refreshAccessToken(): Promise<string> {
  // Collapse concurrent callers within this tab.
  inFlight ??= runRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runRefresh(): Promise<string> {
  // Web Locks serialises across tabs of the same origin; without it, two open
  // tabs could each spend the single-use refresh token.
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(LOCK_NAME, refreshUnderLock);
  }
  return refreshUnderLock();
}

async function refreshUnderLock(): Promise<string> {
  const stored = readStored();
  if (!stored?.refreshToken) throw new AuthExpiredError();

  // Another tab may have refreshed while we waited for the lock. Re-read first
  // so we don't spend an already-superseded refresh token.
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
    // the only cure is a fresh authorization.
    const body = await res.text();
    if (res.status === 400 && body.includes('invalid_grant')) {
      clearStored();
      throw new AuthExpiredError();
    }
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }

  return persistTokenResponse((await res.json()) as TokenResponse, stored)
    .accessToken;
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
