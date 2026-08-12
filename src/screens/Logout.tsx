import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../components/Icon';
import { t } from '../strings';

/**
 * The confirmation step for signing out.
 *
 * The nav entry leads here rather than signing out on tap: it sits alongside
 * three harmless tabs, and a mis-tap that ends the session would otherwise stop
 * the music with no warning. This screen *is* the confirmation, so the button
 * below acts immediately.
 *
 * Getting back in is not as dire as it looks. An explicit sign-out leaves the
 * status at `signed-out`, so Login shows the ordinary "Mit Spotify anmelden"
 * screen, and Spotify's own session cookie survives — the approval screen it
 * then shows offers a one-tap "Weiter als …". No password needed to undo a
 * mistake; only to switch to a genuinely different account.
 */
export function Logout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="content">
      <div className="empty">
        <div className="big">
          <Icon name="logout" size={56} />
        </div>
        <h1>{t.logout.title}</h1>
        <p>{t.logout.intro}</p>
        <p className="muted">{t.logout.hint}</p>
        <div className="actions">
          <button className="btn danger" onClick={signOut}>
            {t.logout.confirm}
          </button>
          <button
            className="btn secondary"
            onClick={() => navigate('/', { replace: true })}
          >
            {t.logout.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
