/**
 * The shape of the multi-account store, as pure transforms.
 *
 * Nothing here touches localStorage or the network — that is tokens.ts's job.
 * Keeping the shape logic separate is what makes it testable: vitest runs in the
 * node environment, so a module that reached for `localStorage` could not be
 * unit tested at all. Same split as devices/allowlist.ts.
 *
 * Every function returns a new store rather than mutating, so a caller can never
 * half-apply a change to the object it is about to write to storage.
 */

import type { Image } from '../api/types';

export interface Account {
  /**
   * The Spotify user id. This is the key everything else hangs off, which is
   * what stops signing in twice as the same person creating two rows.
   */
  id: string;
  /** `display_name` if Spotify has one, else the id. Shown in the switcher. */
  name: string;
  images?: Image[];
  refreshToken: string;
  accessToken: string;
  /** Epoch ms at which the access token stops being valid. */
  expiresAt: number;
  /**
   * Epoch ms of this account's original authorization. Spotify expires refresh
   * tokens six months from this moment and refreshing does NOT reset the clock.
   * Per account: each grant runs on its own timer, so one account expiring says
   * nothing about the others.
   */
  authorizedAt: number;
  /**
   * The grant is gone and only a fresh authorization can bring it back. The row
   * is kept anyway, so the account screen can offer a re-login by name instead
   * of the account silently vanishing.
   */
  needsReauth?: boolean;
}

export interface AuthStore {
  version: 2;
  activeId: string | null;
  accounts: Account[];
}

export const EMPTY_STORE: AuthStore = {
  version: 2,
  activeId: null,
  accounts: [],
};

/**
 * The single-session shape this app stored before multi-account existed.
 * Retained only so migrateV1 has something to describe.
 */
export interface StoredAuthV1 {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  authorizedAt: number;
}

/**
 * Placeholder id for an account whose Spotify identity is not known yet —
 * either migrated from v1, or signed in while `/me` was unreachable. The prefix
 * is what marks it: the startup backfill looks for it and re-keys the row once
 * it learns the real id.
 */
export const PENDING_PREFIX = 'pending:';

export const isPending = (id: string): boolean => id.startsWith(PENDING_PREFIX);

export const newPendingId = (now = Date.now()): string =>
  `${PENDING_PREFIX}${now}`;

/**
 * Lifts a v1 single session into a one-account store.
 *
 * The identity is unknown at this point — v1 never stored one — so the row goes
 * in pending and the startup `/me` call re-keys it. Losing this migration would
 * log every existing user out, which for this app means a kid staring at a login
 * screen for a password they do not have.
 */
export function migrateV1(v1: StoredAuthV1, now = Date.now()): AuthStore {
  const id = newPendingId(now);
  return {
    version: 2,
    activeId: id,
    accounts: [{ ...v1, id, name: '' }],
  };
}

export function getActive(store: AuthStore): Account | null {
  return store.accounts.find((a) => a.id === store.activeId) ?? null;
}

export function findAccount(store: AuthStore, id: string): Account | null {
  return store.accounts.find((a) => a.id === id) ?? null;
}

/**
 * Adds an account, or replaces the tokens and identity of one already stored
 * under the same Spotify id. Position in the list is preserved on replace, so
 * re-authorizing does not shuffle the switcher under the user's finger.
 */
export function upsertAccount(store: AuthStore, account: Account): AuthStore {
  const index = store.accounts.findIndex((a) => a.id === account.id);
  const accounts =
    index === -1
      ? [...store.accounts, account]
      : store.accounts.map((a, i) => (i === index ? account : a));
  return { ...store, accounts };
}

/**
 * Re-keys a pending row once its real Spotify id is known.
 *
 * If that id is already stored — the same person was signed in twice, once
 * before the identity was known — the pending row is dropped in favour of the
 * established one rather than leaving a duplicate in the switcher.
 */
export function resolvePending(
  store: AuthStore,
  pendingId: string,
  identity: { id: string; name: string; images?: Image[] },
): AuthStore {
  const pending = findAccount(store, pendingId);
  if (!pending) return store;

  const duplicate = store.accounts.some(
    (a) => a.id === identity.id && a.id !== pendingId,
  );
  const accounts = duplicate
    ? store.accounts.filter((a) => a.id !== pendingId)
    : store.accounts.map((a) =>
        a.id === pendingId ? { ...a, ...identity } : a,
      );

  return {
    ...store,
    accounts,
    activeId: store.activeId === pendingId ? identity.id : store.activeId,
  };
}

/** Refreshes the display name and avatar without touching tokens. */
export function updateIdentity(
  store: AuthStore,
  id: string,
  identity: { name: string; images?: Image[] },
): AuthStore {
  return {
    ...store,
    accounts: store.accounts.map((a) =>
      a.id === id ? { ...a, ...identity } : a,
    ),
  };
}

/**
 * Writes rotated tokens to one specific account.
 *
 * Always by explicit id, never "whichever is active": a refresh that was in
 * flight when the user switched accounts would otherwise land the first
 * account's single-use refresh token on the second one, killing both grants.
 */
export function updateTokens(
  store: AuthStore,
  id: string,
  tokens: Pick<Account, 'refreshToken' | 'accessToken' | 'expiresAt'>,
): AuthStore {
  return {
    ...store,
    accounts: store.accounts.map((a) =>
      a.id === id ? { ...a, ...tokens, needsReauth: false } : a,
    ),
  };
}

/**
 * Marks a grant as dead: the tokens are worthless, so they are dropped, but the
 * row survives so the account screen can offer a re-login by name.
 */
export function markNeedsReauth(store: AuthStore, id: string): AuthStore {
  return {
    ...store,
    accounts: store.accounts.map((a) =>
      a.id === id
        ? { ...a, refreshToken: '', accessToken: '', expiresAt: 0, needsReauth: true }
        : a,
    ),
  };
}

export function setActive(store: AuthStore, id: string): AuthStore {
  if (!store.accounts.some((a) => a.id === id)) return store;
  return { ...store, activeId: id };
}

/**
 * Drops an account. If it was the active one, the first remaining usable
 * account takes over so the app lands somewhere sensible instead of on the
 * login screen with working accounts still stored.
 */
export function removeAccount(store: AuthStore, id: string): AuthStore {
  const accounts = store.accounts.filter((a) => a.id !== id);
  if (store.activeId !== id) return { ...store, accounts };

  const next = accounts.find((a) => !a.needsReauth) ?? accounts[0];
  return { ...store, accounts, activeId: next?.id ?? null };
}

/** Epoch ms at which an account's grant dies regardless of activity. */
export function grantExpiresAt(account: Account): number {
  const SIX_MONTHS_MS = 182 * 24 * 60 * 60 * 1000;
  return account.authorizedAt + SIX_MONTHS_MS;
}
