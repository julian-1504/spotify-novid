import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
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
  signOut: () => void;
  /** Called by the API client when a grant turns out to be dead. */
  markExpired: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');

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

  const signOut = useCallback(() => {
    clearStored();
    setStatus('signed-out');
  }, []);

  const markExpired = useCallback(() => {
    clearStored();
    setStatus('expired');
  }, []);

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
