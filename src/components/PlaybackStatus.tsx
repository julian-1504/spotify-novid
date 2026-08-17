import { useEffect, useState } from 'react';
import {
  hostStatus,
  openHostNotificationSettings,
  type HostStatus,
} from '../player/nativeHost';
import { t } from '../strings';

/** How often the wrapper is asked again, so a setting changed elsewhere shows up. */
const POLL_MS = 2000;

/**
 * What the Android app's playback plumbing is doing, on the adults' screen.
 *
 * This is here because of where the app runs. The music surviving a locked
 * screen depends on a chain — the page is trusted, the bridge is reached, the
 * foreground service starts, Android agrees to show its notification — and
 * every link fails silently by design, because none of them is worth stopping
 * the music over. On a phone that is never plugged into a laptop that left
 * „es geht nicht" as the entire diagnosis.
 *
 * So the wrapper is asked, and answers. Verdicts rather than numbers: the point
 * is to get from „die Musik hört auf" to the one thing worth doing about it.
 *
 * Renders nothing in a browser, and nothing in an APK too old to answer — the
 * page is deployed separately from the wrapper, so both are normal.
 */
export function PlaybackStatus() {
  const [status, setStatus] = useState<HostStatus | null>(hostStatus);

  useEffect(() => {
    const id = setInterval(() => setStatus(hostStatus()), POLL_MS);
    return () => clearInterval(id);
  }, []);

  if (!status) return null;

  // The bridge refusing the page is the failure that makes every line below
  // meaningless, so it is the whole panel when it happens.
  if (status.trusted === false) {
    return (
      <div className="panel">
        <h2>{t.account.playback.title}</h2>
        <p className="error">{t.account.playback.bridgeBroken}</p>
        <p className="muted small">
          {t.account.playback.bridgeHint(status.pageHost || '?')}
        </p>
      </div>
    );
  }

  const notifications = status.notificationsEnabled === true && status.channelImportance !== 0;
  const running = status.serviceRunning === true && status.foregrounded === true;

  return (
    <div className="panel">
      <h2>{t.account.playback.title}</h2>
      <p className="muted small">{t.account.playback.intro}</p>

      <p className={notifications ? '' : 'warn'}>
        {notifications
          ? t.account.playback.notificationsOn
          : t.account.playback.notificationsOff}
      </p>
      {!notifications && (
        <>
          <p className="muted small">{t.account.playback.notificationsHint}</p>
          <div className="actions">
            <button className="btn secondary" onClick={openHostNotificationSettings}>
              {t.account.playback.allow}
            </button>
          </div>
        </>
      )}

      <p className={running ? '' : 'warn'}>
        {running ? t.account.playback.serviceRunning : t.account.playback.serviceStopped}
      </p>
      {!running && <p className="muted small">{t.account.playback.serviceHint}</p>}

      <p className="muted small">
        {status.publishCount
          ? t.account.playback.reports(status.publishCount)
          : t.account.playback.noReports}
      </p>
      {status.lastError && (
        <p className="muted small">{t.account.playback.lastError(status.lastError)}</p>
      )}
    </div>
  );
}
