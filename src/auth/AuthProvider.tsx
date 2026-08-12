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
import {
  AuthExpiredError,
  clearStored,
  getAccessToken,
  hasSession,
  requestPersistentStorage,
} from './tokens';
import { beginLogin } from './flow';

type AuthStatus = 'checking' | 'signed-in' | 'signed-out' | 'expired';

interface AuthValue {
  status: AuthStatus;
  signIn: () => Promise<void>;
  /** Ends the session on purpose, so a different account can sign in. */
  signOut: () => void;
  /** Called by the API client when a grant turns out to be dead. */
  markExpired: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const queryClient = useQueryClient();

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
      try {
        await getAccessToken();
        if (!cancelled) setStatus('signed-in');
      } catch (err) {
        if (cancelled) return;
        setStatus(err instanceof AuthExpiredError ? 'expired' : 'signed-in');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // A grant revoked in another tab should not leave this one showing a UI it
  // can no longer drive.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'novid.auth.v1' && e.newValue === null) setStatus('expired');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /**
   * Tearing down a session means dropping the cache too. Cached library and
   * playlist data is scoped to whoever was signed in, so leaving it in place
   * would show the previous account's things for a beat after a new one signs
   * in. The remembered speaker (`novid.device`) is deliberately kept: it is the
   * same household either way, and PlayerProvider forgets it by itself if the
   * next account cannot see it.
   */
  const endSession = useCallback(
    (next: AuthStatus) => {
      clearStored();
      queryClient.clear();
      setStatus(next);
    },
    [queryClient],
  );

  const signOut = useCallback(() => endSession('signed-out'), [endSession]);

  const markExpired = useCallback(() => endSession('expired'), [endSession]);

  const value = useMemo<AuthValue>(
    () => ({ status, signIn: beginLogin, signOut, markExpired }),
    [status, signOut, markExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
