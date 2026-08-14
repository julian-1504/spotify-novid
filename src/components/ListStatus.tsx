/**
 * What a paged list has to say for itself when it has no rows to show.
 *
 * „Leer" and „hat nicht geklappt" are different answers, and showing both says
 * neither. Four screens need that distinction and only the playlist screen used
 * to make it — which is how an artist page spent its time drawing a heading
 * over blank space while the request behind it was being refused outright.
 *
 * The decision is a pure function so it can be tested without a browser; the
 * component is the thin part that picks the wording.
 */

import { Icon, type IconName } from './Icon';
import { isForbidden } from '../api/client';
import { toFriendlyError } from '../errors';
import { t } from '../strings';

/** Which of the six things a paged list is currently doing. */
export type ListState =
  | 'loading'
  | 'offline'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready';

export interface ListQuery {
  /** Nothing has arrived and nothing has failed. See usePagedList. */
  isPending: boolean;
  /** Pending because the connection is believed to be gone. */
  isPaused: boolean;
  error: unknown;
}

/**
 * The order is the whole point, and `empty` coming last is the whole of it.
 *
 * A list that failed, a list still on its way, and a list waiting for the WLAN
 * are all lists with no rows — and every one of them would read as „da ist
 * nichts drin" if that question were asked first. A kid told a playlist is
 * empty goes looking for different music; a kid told it did not load tries
 * again. Only the last case has actually earned the word „leer".
 *
 * `isPending` rather than `isLoading` is load-bearing here: a query paused
 * between retries is pending while not fetching, so `isLoading` is false and
 * this would fall through to `empty`. That is the exact shape of the bug this
 * module exists to prevent, so it is worth being precise about.
 *
 * An error wins even once some rows are on screen — a list that stopped
 * part-way did stop part-way, and the rows go on rendering above the message.
 *
 * „Das darf die App nicht lesen" is a third answer beside „leer" and „hat nicht
 * geklappt", and it is the one a playlist somebody else made gives when even
 * the fallback in `getPlaylistPage` came up empty. Telling a parent something
 * went wrong sends them looking for a fault that is not there, so it is worth
 * a word of its own.
 */
export function listState(list: ListQuery, count: number): ListState {
  if (list.error) return isForbidden(list.error) ? 'forbidden' : 'error';
  if (list.isPaused) return 'offline';
  if (list.isPending) return 'loading';
  if (count === 0) return 'empty';
  return 'ready';
}

/**
 * Renders whichever of those needs saying, and nothing at all when the list is
 * fine. Sits below the rows so a partly-loaded list still shows what it has.
 */
export function ListStatus({
  list,
  count,
  icon,
  empty,
  forbidden,
}: {
  list: ListQuery;
  count: number;
  /** The glyph for the empty state — each screen's own. */
  icon: IconName;
  /** What „nothing here" means on this screen, in words. */
  empty: string;
  /**
   * What „das darf die App nicht lesen" means on this screen. Optional: a
   * screen with nothing better to say falls back to the general wording, which
   * is what the three screens that have never met a refusal do.
   */
  forbidden?: string;
}) {
  const state = listState(list, count);

  if (state === 'loading') return <div className="spinner">{t.app.loading}</div>;

  // Waiting for a connection, not for Spotify. Said plainly rather than left as
  // a spinner that would never stop, or as „leer", which it certainly is not.
  if (state === 'offline')
    return <div className="error">{t.errors.offline}</div>;

  // Yellow, not red: a refusal is Spotify answering, not the app breaking. The
  // wording says so and the colour has to agree, or the box goes on shouting
  // „kaputt" underneath a sentence that says nothing is.
  if (state === 'forbidden')
    return (
      <div className="notice">
        {forbidden ?? toFriendlyError(list.error).message}
      </div>
    );

  if (state === 'error')
    return <div className="error">{toFriendlyError(list.error).message}</div>;

  if (state === 'empty')
    return (
      <div className="empty">
        <div className="big">
          <Icon name={icon} size={44} />
        </div>
        <p>{empty}</p>
      </div>
    );

  return null;
}
