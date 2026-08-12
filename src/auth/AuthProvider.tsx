import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchProfile, profileName } from '../api/me';
import {
  AuthExpiredError,
  activeAccount,
  clearStored,
  forgetInFlight,
  getAccessToken,
  hasSession,
  readStore,
  requestPersistentStorage,
  updateStore,
} from './tokens';
import {
  isPending,
  markNeedsReauth,
  removeAccount as removeFromStore,
  resolvePending,
  setActive,
  updateIdentity,
  type Account,
} from './accounts';
import { beginLogin } from './flow';

type AuthStatus = 'checking' | 'signed-in' | 'signed-out' | 'expired';

interface AuthValue {
  status: AuthStatus;
  /** Every account with stored tokens, including ones needing re-authorization. */
  accounts: Account[];
  activeAccount: Account | null;
  signIn: () => Promise<void>;
  /** Starts the Spotify flow to add another account, or re-authorize a dead one. */
  addAccount: () => Promise<void>;
  /** Instant and offline: no redirect, no password, no token exchange. */
  switchAccount: (id: string) => void;
  removeAccount: (id: string) => void;
  /** Called by the API client when the active account's grant turns out dead. */
  markExpired: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  /** Pulls React state back in line with what is on disk. */
  const syncFromStore = useCallback(() => {
    const store = readStore();
    setAccounts(store.accounts);
    setActiveId(store.activeId);
    return store;
  }, []);

  useEffect(() => {
    let cancelled = false;

    void requestPersistentStorage();

    // On launch, prove the stored session actually works by getting a token.
    // This is what makes reopening the app skip the login screen entirely.
    (async () => {
      if (!hasSession()) {
        if (!cancelled) setStatus('signed-out');
        return;
      }
      syncFromStore();
      try {
        const token = await getAccessToken();
        if (cancelled) return;
        setStatus('signed-in');
        await backfillIdentity(token);
        if (!cancelled) syncFromStore();
      } catch (err) {
        if (cancelled) return;
        syncFromStore();
        setStatus(err instanceof AuthExpiredError ? 'expired' : 'signed-in');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [syncFromStore]);

  // Another tab may have switched accounts, added one, or lost a grant. Follow
  // it rather than sitting on a UI that no longer matches what is stored.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'novid.auth.v2') return;
      const store = syncFromStore();
      if (store.accounts.length === 0) {
        setStatus('expired');
        return;
      }
      const active = store.accounts.find((a) => a.id === store.activeId);
      if (!active || active.needsReauth) {
        setStatus('expired');
        return;
      }
      queryClient.clear();
      setStatus('signed-in');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [queryClient, syncFromStore]);

  /**
   * Switching is a local operation: the tokens for every account are already on
   * disk, so this is a pointer move plus a cache wipe. The cache has to go —
   * library and playlist data is scoped to whoever was signed in, and leaving it
   * would show the previous account's things for a beat.
   */
  const switchAccount = useCallback(
    (id: string) => {
      const store = updateStore((s) => setActive(s, id));
      queryClient.clear();
      setAccounts(store.accounts);
      setActiveId(store.activeId);
      const next = store.accounts.find((a) => a.id === id);
      setStatus(next?.needsReauth ? 'expired' : 'signed-in');
    },
    [queryClient],
  );

  /**
   * Removal is local only. Spotify has no revoke endpoint for PKCE grants, so
   * the authorization lives on server-side until its six months are up — which
   * is why adding the account back costs no password while Spotify's own cookie
   * is still around.
   */
  const removeAccount = useCallback(
    (id: string) => {
      forgetInFlight(id);
      const store = updateStore((s) => removeFromStore(s, id));
      queryClient.clear();
      setAccounts(store.accounts);
      setActiveId(store.activeId);

      if (store.accounts.length === 0) {
        clearStored();
        setStatus('signed-out');
        return;
      }
      const next = store.accounts.find((a) => a.id === store.activeId);
      setStatus(next && !next.needsReauth ? 'signed-in' : 'expired');
    },
    [queryClient],
  );

  /**
   * The active account's grant is dead. Only that account is torn down — every
   * other one runs on its own six-month clock and stays perfectly usable.
   */
  const markExpired = useCallback(() => {
    const current = activeAccount();
    const store = current
      ? updateStore((s) => markNeedsReauth(s, current.id))
      : readStore();
    queryClient.clear();
    setAccounts(store.accounts);
    setActiveId(store.activeId);
    setStatus('expired');
  }, [queryClient]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      accounts,
      activeAccount: accounts.find((a) => a.id === activeId) ?? null,
      signIn: beginLogin,
      addAccount: beginLogin,
      switchAccount,
      removeAccount,
      markExpired,
    }),
    [status, accounts, activeId, switchAccount, removeAccount, markExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Puts a name and avatar on the active account.
 *
 * Needed for two cases that both leave a row unnamed: a session migrated from
 * the single-account storage, which never recorded an identity, and a sign-in
 * where `/me` was unreachable. Re-keys the row to the real Spotify id in the
 * first case. Best effort — a failure must never stop the app booting.
 */
async function backfillIdentity(accessToken: string): Promise<void> {
  const account = activeAccount();
  if (!account) return;

  try {
    const profile = await fetchProfile(accessToken);
    const identity = { name: profileName(profile), images: profile.images };

    updateStore((store) =>
      isPending(account.id)
        ? resolvePending(store, account.id, { id: profile.id, ...identity })
        : updateIdentity(store, account.id, identity),
    );
  } catch {
    // Offline, or /me refused. The switcher falls back to a generic label.
  }
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
