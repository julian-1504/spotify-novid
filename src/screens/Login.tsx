import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../components/Icon';
import { CLIENT_ID } from '../config';
import { t } from '../strings';

/**
 * Two distinct situations share this screen.
 *
 * `expired` matters: Spotify kills refresh tokens six months after the original
 * sign-in regardless of activity, so roughly twice a year a kid lands here
 * through no fault of their own. Telling them to fetch a parent is more useful
 * than showing a login form for a password they don't know.
 */
export function Login() {
  const { status, signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const expired = status === 'expired';

  const go = async () => {
    setError(null);
    try {
      await signIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Setup problem, not a kid problem — this one stays in English, because the
  // only person who can act on it is whoever is configuring the app.
  if (!CLIENT_ID) {
    return (
      <div className="content">
        <div className="error">
          <strong>{t.login.notConfiguredTitle}</strong>
          <p>
            Copy <code>.env.example</code> to <code>.env</code> and set{' '}
            <code>VITE_SPOTIFY_CLIENT_ID</code> to the client ID from your
            Spotify developer dashboard, then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="empty">
        <div className={`big ${expired ? '' : 'brand'}`}>
          <Icon name={expired ? 'key' : 'spotify'} size={56} />
        </div>
        <h1>{expired ? t.login.titleExpired : t.login.titleFresh}</h1>
        <p>{expired ? t.login.introExpired : t.login.introFresh}</p>
        {error && <div className="error">{error}</div>}
        <button className="btn with-icon" onClick={() => void go()}>
          <Icon name="spotify" size={20} />
          {expired ? t.login.buttonExpired : t.login.buttonFresh}
        </button>
      </div>
    </div>
  );
}
