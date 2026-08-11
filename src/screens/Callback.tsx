import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { completeLogin } from '../auth/flow';
import { Icon } from '../components/Icon';
import { t } from '../strings';

export function Callback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // React 18+ StrictMode double-invokes effects in dev; the authorization code
  // is single-use, so guard against exchanging it twice.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    completeLogin(window.location.search)
      .then(() => {
        // replace: the URL still holds the one-time code.
        navigate('/', { replace: true });
        // Re-run the auth bootstrap now that tokens exist.
        window.location.reload();
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [navigate]);

  return (
    <div className="content">
      {error ? (
        <div className="empty">
          <div className="big">
            <Icon name="alert" size={44} />
          </div>
          <div className="error">{error}</div>
          <button className="btn" onClick={() => navigate('/', { replace: true })}>
            {t.login.retry}
          </button>
        </div>
      ) : (
        <div className="spinner">{t.login.signingIn}</div>
      )}
    </div>
  );
}
