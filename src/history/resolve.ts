/**
 * Turning a reference into something the home screen can draw.
 *
 * Split out from the rules next door because this is the one part that may need
 * the network: a playlist context carries nothing but a URI, and an episode
 * does not always bring its show along. The lookups are injected rather than
 * imported so this stays testable without a browser or a bearer token — and so
 * the provider can route them through the query cache, where the answer usually
 * already is.
 *
 * Nothing here throws. Recording what was played is a convenience; a deleted
 * playlist or a moment offline must cost a cover, never the screen.
 */

import {
  detailsFromAlbum,
  detailsFromPlaylist,
  detailsFromShow,
  entryFrom,
  type RecentEntry,
  type RecentRef,
} from './recent';
import type { Album, Episode, Playlist, Show } from '../api/types';

export interface RecentLookups {
  album: (id: string) => Promise<Album>;
  playlist: (id: string) => Promise<Playlist>;
  show: (id: string) => Promise<Show>;
  episode: (id: string) => Promise<Episode>;
}

export async function resolveRef(
  ref: RecentRef,
  playedAt: number,
  lookups: RecentLookups,
): Promise<RecentEntry | null> {
  try {
    // The common case: the playback state already carried everything a tile
    // needs, so this costs no request at all.
    if (ref.details) return entryFrom(ref, playedAt);

    switch (ref.source) {
      case 'album':
        return entryFrom(
          { ...ref, details: detailsFromAlbum(await lookups.album(ref.id)) },
          playedAt,
        );
      case 'playlist':
        return entryFrom(
          { ...ref, details: detailsFromPlaylist(await lookups.playlist(ref.id)) },
          playedAt,
        );
      case 'show':
        return entryFrom(
          { ...ref, details: detailsFromShow(await lookups.show(ref.id)) },
          playedAt,
        );
      case 'episode': {
        // An episode is never remembered as itself — there is no screen for one.
        // It is a detour to the show it belongs to.
        const full = await lookups.episode(ref.id);
        if (!full.show?.id) return null;
        return entryFrom(
          { source: 'show', id: full.show.id, details: detailsFromShow(full.show) },
          playedAt,
        );
      }
    }
  } catch {
    return null;
  }
}
