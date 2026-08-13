/**
 * Where the now-playing bar can take you.
 *
 * The bar knows what is playing and what it is playing from; until now it did
 * nothing with the second half. A kid who hears a song they like mid-playlist
 * has no way back to that playlist except remembering its name and hunting for
 * it again, which is exactly the thing they cannot do.
 *
 * Pure, like the sticky device choice and the recents rule next door: the
 * interesting part is a derivation, and a derivation is worth testing without a
 * browser.
 */

import { referenceFrom } from '../history/recent';
import type { PlaybackState } from '../api/types';

/**
 * Somewhere with a screen to land on.
 *
 * `kind` is byte-identical to the route segment on purpose — `/album/:id`,
 * `/playlist/:id`, `/show/:id` and `/artist/:id` all exist, so the sheet can
 * build its link as `/${kind}/${id}` without a lookup table that would have to
 * be kept in step with App.tsx.
 */
export interface JumpTarget {
  kind: 'album' | 'playlist' | 'show' | 'artist';
  id: string;
  /** The album, podcast or artist name, when the playback state carried one. */
  name?: string;
}

/**
 * What the playing thing leads to, best first.
 *
 * The context wins over the item, and that is the whole point — the same rule
 * the home screen uses to decide which cover to remember, so it is imported
 * from there rather than written a second time. A kid who tapped a playlist
 * gets that playlist back, not the album of whichever song happens to be on.
 *
 * Unlike the recents recorder next door there is deliberately no `is_playing`
 * gate: that one is answering „what did somebody actually listen to", while
 * this one is answering „where does this take me", and a paused song deserves
 * the way back just as much as a playing one.
 */
export function jumpTargetsFor(state: PlaybackState | undefined): JumpTarget[] {
  if (!state?.item) return [];

  // The advert gate, same as referenceForPlayback's: an advert has no screen,
  // and whatever it says its context is, it is not somewhere to send a kid.
  if (
    state.currently_playing_type !== 'track' &&
    state.currently_playing_type !== 'episode'
  )
    return [];

  const targets: JumpTarget[] = [];

  const ref = referenceFrom(state.item, state.context);
  // `episode` is not dropped for being uninteresting — it means „an episode
  // whose show did not come with it", and this app has no screen for a single
  // episode. Looking the show up would need a request, and a sheet that has to
  // wait for the network before it can offer a row is worse than one row fewer.
  if (ref && ref.source !== 'episode')
    targets.push({ kind: ref.source, id: ref.id, name: ref.details?.name });

  if (state.item.type === 'track') {
    // A local file's artists come through as a name with no id, and an artist
    // with no id has no page.
    for (const artist of state.item.artists ?? []) {
      if (artist.id) targets.push({ kind: 'artist', id: artist.id, name: artist.name });
    }
  }

  return targets;
}
