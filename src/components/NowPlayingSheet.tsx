import { Link } from 'react-router-dom';
import { usePlayer } from '../player/PlayerProvider';
import { jumpTargetsFor, type JumpTarget } from '../player/jumpTargets';
import { Artwork } from './Artwork';
import { subtitleFor } from './NowPlayingBar';
import { Icon, type IconName } from './Icon';
import { t } from '../strings';

const ICONS: Record<JumpTarget['kind'], IconName> = {
  album: 'album',
  playlist: 'playlist',
  show: 'podcast',
  artist: 'artist',
};

const ACTIONS: Record<JumpTarget['kind'], string> = {
  album: t.player.showAlbum,
  playlist: t.player.showPlaylist,
  show: t.player.showShow,
  artist: t.player.showArtist,
};

/**
 * What each row says.
 *
 * Normally the big line is the action and the small line is the name, so the
 * rows read as a list of things to do. The exception is a song credited to
 * several artists: two rows both reading „Künstler zeigen" are the same row
 * twice as far as a glance is concerned, so those lead with the name and put
 * the word „Künstler" underneath instead.
 */
function linesFor(
  target: JumpTarget,
  targets: JumpTarget[],
): { name: string; meta?: string } {
  const severalArtists =
    target.kind === 'artist' &&
    targets.filter((other) => other.kind === 'artist').length > 1;

  if (severalArtists && target.name)
    return { name: target.name, meta: t.player.artist };
  return { name: ACTIONS[target.kind], meta: target.name };
}

/**
 * The way out of the now-playing bar.
 *
 * A sheet rather than a panel inside the bar, and deliberately the same sheet
 * as the speaker picker one tap above it: a kid who has met one has met both,
 * and nothing on the screen moves while it opens.
 *
 * Mounted and unmounted by NowPlayingBar, like DevicePicker — there is no
 * `open` prop, so nothing here has to think about being invisible.
 */
export function NowPlayingSheet({ onClose }: { onClose: () => void }) {
  const { state } = usePlayer();
  const item = state?.item;
  const targets = jumpTargetsFor(state);

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t.player.moreTitle}
      >
        <div className="np-sheet-head">
          <Artwork
            images={item?.type === 'episode' ? item.images : item?.album?.images}
            alt=""
          />
          <span className="np-text">
            <span className="np-title">
              {item?.name ?? t.player.nothingPlaying}
            </span>
            <span className="np-sub">{subtitleFor(item)}</span>
          </span>
        </div>

        {targets.length === 0 ? (
          <p className="muted">{t.player.noPage}</p>
        ) : (
          <div className="rows">
            {targets.map((target) => {
              const lines = linesFor(target, targets);
              return (
                <Link
                  key={`${target.kind}:${target.id}`}
                  className="jump"
                  to={`/${target.kind}/${target.id}`}
                  onClick={onClose}
                >
                  <Icon name={ICONS[target.kind]} size={26} />
                  <span className="body">
                    <span className="name">{lines.name}</span>
                    {lines.meta && <span className="meta">{lines.meta}</span>}
                  </span>
                  <Icon name="chevron-right" size={18} />
                </Link>
              );
            })}
          </div>
        )}

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
