import { useSleepTimer } from '../player/SleepProvider';
import { formatRemaining, SLEEP_OPTIONS } from '../player/sleepTimer';
import { Icon } from './Icon';
import { t } from '../strings';

/**
 * Choosing how long the music may go on for.
 *
 * Deliberately the same sheet as the box picker and the now-playing one, down
 * to the rows: a kid who has met one has met all three, and the tick on the
 * chosen row means the same thing in each.
 *
 * Mounted and unmounted by NowPlayingBar, like its two siblings — there is no
 * `open` prop, so nothing here has to think about being invisible.
 */
export function SleepPicker({ onClose }: { onClose: () => void }) {
  const { timer, remaining, setTimer, clear } = useSleepTimer();

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t.sleep.title}
      >
        <h2>{t.sleep.title}</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          {t.sleep.subtitle}
        </p>

        <div className="rows">
          {SLEEP_OPTIONS.map((minutes) => {
            const on = timer?.minutes === minutes;
            return (
              <button
                key={minutes}
                className={`device ${on ? 'on' : ''}`}
                onClick={() => {
                  setTimer(minutes);
                  onClose();
                }}
              >
                <Icon name="moon" size={26} />
                <span className="body">
                  <span className="name">{t.sleep.option(minutes)}</span>
                  {/*
                    Only on the running row, and it says the time left rather
                    than „Läuft" — a kid who opens this sheet has come to find
                    out how long is left, and this is where the number is
                    biggest.
                  */}
                  {on && remaining !== null && (
                    <span className="meta"> - {formatRemaining(remaining)}</span>
                  )}
                </span>
                {on && <Icon name="check" size={20} />}
              </button>
            );
          })}

          {/*
            Only while something is running: an „Aus" row with nothing to switch
            off is a tap that does nothing, and the tick above already says
            whether a timer is set.
          */}
          {timer && (
            <button
              className="device"
              onClick={() => {
                clear();
                onClose();
              }}
            >
              <Icon name="close" size={26} />
              <span className="body">
                <span className="name">{t.sleep.off}</span>
              </span>
            </button>
          )}
        </div>

        <button
          className="btn secondary"
          style={{ width: '100%', marginTop: 12 }}
          onClick={onClose}
        >
          {t.devices.close}
        </button>
      </div>
    </div>
  );
}
