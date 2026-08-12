import { Tile } from './Rows';
import { useRecent } from '../history/HistoryProvider';
import { t } from '../strings';
import type { IconName } from './Icon';
import type { RecentKind } from '../history/recent';

const ROUTE: Record<RecentKind, string> = {
  album: 'album',
  playlist: 'playlist',
  show: 'show',
};

const FALLBACK: Record<RecentKind, IconName> = {
  album: 'album',
  playlist: 'playlist',
  show: 'podcast',
};

/**
 * The covers of what was played lately, newest first.
 *
 * Renders nothing at all when there is no history rather than an empty shelf
 * with a heading over it: a kid reading „Zuletzt gehört" above a blank strip
 * concludes the app has lost their things.
 *
 * Uses the generic Tile, not the typed ones — what is stored is a snapshot of a
 * name and a picture, which is all a tile draws, and never a whole Album or Show.
 */
export function RecentlyPlayed() {
  const entries = useRecent();
  if (entries.length === 0) return null;

  return (
    <>
      <h2>{t.home.recent}</h2>
      <div className="grid">
        {entries.map((entry) => (
          <Tile
            key={`${entry.kind}:${entry.id}`}
            to={`/${ROUTE[entry.kind]}/${entry.id}`}
            images={entry.images}
            title={entry.name}
            subtitle={entry.subtitle}
            fallback={FALLBACK[entry.kind]}
          />
        ))}
      </div>
    </>
  );
}
