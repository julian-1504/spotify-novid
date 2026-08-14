/**
 * What comes next in the thing that is playing right now.
 *
 * This exists for one case and should not grow past it: a playlist somebody
 * else made. Spotify refuses this app the songs of such a playlist outright —
 * `/playlists/{id}/items` answers 403 and the playlist object arrives with no
 * contents at all — but it will happily say what is coming next once the
 * playlist is running. So a kid presses „Abspielen" and the list appears
 * behind it, which is the wrong way round and still better than a screen that
 * names a playlist and shows nothing of it.
 *
 * Pure, like the jump targets and the sticky device choice next door: the
 * interesting part is the guard, and a guard is worth testing without a
 * browser.
 */

import type { Episode, PlaybackState, PlayerQueue, Track } from '../api/types';

/**
 * The upcoming items, but only if they belong to the thing being asked about.
 *
 * The guard is the whole function. There is exactly one queue per account, and
 * it goes on answering with whatever is playing after a kid wanders off to
 * another playlist — so without checking the context, a screen would list one
 * playlist's songs under another playlist's name. Empty is the honest answer
 * there, and the screen says „press play" rather than showing a borrowed list.
 *
 * Entries without a `uri` are dropped: the uri is what a tap plays, and a row
 * that cannot be played is a row that lies about being tappable.
 */
export function upcomingIn(
  contextUri: string,
  state: PlaybackState | undefined,
  queue: PlayerQueue | undefined,
): (Track | Episode)[] {
  if (!contextUri || state?.context?.uri !== contextUri) return [];
  return (queue?.queue ?? []).filter((entry) => Boolean(entry?.uri));
}
