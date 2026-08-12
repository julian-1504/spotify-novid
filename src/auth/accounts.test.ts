import { describe, expect, it } from 'vitest';
import {
  EMPTY_STORE,
  getActive,
  isPending,
  markNeedsReauth,
  migrateV1,
  removeAccount,
  resolvePending,
  setActive,
  updateTokens,
  upsertAccount,
  type Account,
  type AuthStore,
} from './accounts';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'anna',
    name: 'Anna',
    refreshToken: 'r-anna',
    accessToken: 'a-anna',
    expiresAt: 1_000,
    authorizedAt: 500,
    ...overrides,
  };
}

function storeWith(...accounts: Account[]): AuthStore {
  return { version: 2, activeId: accounts[0]?.id ?? null, accounts };
}

describe('v1 migration', () => {
  const v1 = {
    refreshToken: 'r-old',
    accessToken: 'a-old',
    expiresAt: 9_000,
    authorizedAt: 42,
  };

  // The one that matters: every existing user is mid-session when this ships,
  // and losing their tokens means a kid facing a password they do not have.
  it('carries the session over intact and leaves it active', () => {
    const store = migrateV1(v1, 1234);
    const active = getActive(store);

    expect(store.accounts).toHaveLength(1);
    expect(active).toMatchObject({
      refreshToken: 'r-old',
      accessToken: 'a-old',
      expiresAt: 9_000,
      // Not reset to now: the six-month clock started at the original sign-in.
      authorizedAt: 42,
    });
  });

  it('parks the account under a pending id, since v1 stored no identity', () => {
    const store = migrateV1(v1, 1234);
    expect(isPending(store.accounts[0].id)).toBe(true);
    expect(store.activeId).toBe(store.accounts[0].id);
  });
});

describe('upsertAccount', () => {
  it('adds an account that is not stored yet', () => {
    const store = upsertAccount(EMPTY_STORE, account());
    expect(store.accounts).toHaveLength(1);
  });

  // Signing in again as someone already stored is a re-authorization, not a
  // second person.
  it('replaces by Spotify id instead of duplicating', () => {
    const first = upsertAccount(EMPTY_STORE, account({ refreshToken: 'r-1' }));
    const second = upsertAccount(first, account({ refreshToken: 'r-2' }));

    expect(second.accounts).toHaveLength(1);
    expect(second.accounts[0].refreshToken).toBe('r-2');
  });

  it('keeps list position on replace, so the switcher does not reshuffle', () => {
    const store = storeWith(
      account({ id: 'anna' }),
      account({ id: 'ben', name: 'Ben' }),
      account({ id: 'mama', name: 'Mama' }),
    );
    const updated = upsertAccount(store, account({ id: 'ben', name: 'Ben B.' }));

    expect(updated.accounts.map((a) => a.id)).toEqual(['anna', 'ben', 'mama']);
    expect(updated.accounts[1].name).toBe('Ben B.');
  });
});

describe('resolvePending', () => {
  it('re-keys a pending row and follows it with activeId', () => {
    const store = migrateV1(
      { refreshToken: 'r', accessToken: 'a', expiresAt: 1, authorizedAt: 2 },
      7,
    );
    const pendingId = store.accounts[0].id;
    const resolved = resolvePending(store, pendingId, {
      id: 'anna',
      name: 'Anna',
    });

    expect(resolved.accounts[0].id).toBe('anna');
    expect(resolved.accounts[0].name).toBe('Anna');
    expect(resolved.activeId).toBe('anna');
    // Tokens must survive the re-key.
    expect(resolved.accounts[0].refreshToken).toBe('r');
  });

  it('drops the pending row when that account is already stored', () => {
    const store: AuthStore = {
      version: 2,
      activeId: 'pending:7',
      accounts: [
        account({ id: 'anna' }),
        account({ id: 'pending:7', name: '' }),
      ],
    };
    const resolved = resolvePending(store, 'pending:7', {
      id: 'anna',
      name: 'Anna',
    });

    expect(resolved.accounts.map((a) => a.id)).toEqual(['anna']);
    expect(resolved.activeId).toBe('anna');
  });
});

describe('updateTokens', () => {
  // The corruption this guards against: a refresh in flight when the user
  // switches accounts must not land the first account's single-use refresh
  // token on the second one.
  it('writes only to the named account', () => {
    const store = storeWith(
      account({ id: 'anna' }),
      account({ id: 'ben', name: 'Ben', refreshToken: 'r-ben' }),
    );
    const updated = updateTokens(store, 'anna', {
      refreshToken: 'r-new',
      accessToken: 'a-new',
      expiresAt: 5_000,
    });

    expect(updated.accounts[0].refreshToken).toBe('r-new');
    expect(updated.accounts[1].refreshToken).toBe('r-ben');
  });

  it('clears a stale needsReauth flag when tokens come back', () => {
    const store = markNeedsReauth(storeWith(account()), 'anna');
    const updated = updateTokens(store, 'anna', {
      refreshToken: 'r',
      accessToken: 'a',
      expiresAt: 1,
    });

    expect(updated.accounts[0].needsReauth).toBe(false);
  });
});

describe('markNeedsReauth', () => {
  it('drops the dead tokens but keeps the row and the other accounts', () => {
    const store = storeWith(
      account({ id: 'anna' }),
      account({ id: 'ben', name: 'Ben', refreshToken: 'r-ben' }),
    );
    const marked = markNeedsReauth(store, 'anna');

    expect(marked.accounts[0]).toMatchObject({
      name: 'Anna',
      refreshToken: '',
      needsReauth: true,
    });
    // Each grant runs on its own six-month clock; one dying says nothing about
    // the other.
    expect(marked.accounts[1].refreshToken).toBe('r-ben');
  });
});

describe('removeAccount', () => {
  it('promotes another account when the active one is removed', () => {
    const store = storeWith(
      account({ id: 'anna' }),
      account({ id: 'ben', name: 'Ben' }),
    );
    const removed = removeAccount(store, 'anna');

    expect(removed.activeId).toBe('ben');
    expect(removed.accounts).toHaveLength(1);
  });

  it('prefers a usable account over one needing re-authorization', () => {
    const store = markNeedsReauth(
      storeWith(
        account({ id: 'anna' }),
        account({ id: 'ben', name: 'Ben' }),
        account({ id: 'mama', name: 'Mama' }),
      ),
      'ben',
    );
    expect(removeAccount(store, 'anna').activeId).toBe('mama');
  });

  it('leaves no active account when the last one goes', () => {
    const removed = removeAccount(storeWith(account()), 'anna');
    expect(removed.accounts).toEqual([]);
    expect(removed.activeId).toBeNull();
  });

  it('does not disturb the active account when removing another', () => {
    const store = storeWith(
      account({ id: 'anna' }),
      account({ id: 'ben', name: 'Ben' }),
    );
    expect(removeAccount(store, 'ben').activeId).toBe('anna');
  });
});

describe('setActive', () => {
  it('ignores an id that is not stored', () => {
    const store = storeWith(account());
    expect(setActive(store, 'nobody').activeId).toBe('anna');
  });
});
