/**
 * Catalog reads: search, albums, artists, playlists, shows, library.
 *
 * Two February 2026 changes are baked in here: search pages at 10 items max,
 * and playlist contents come from `/playlists/{id}/items` (the older
 * `/tracks` path was removed). Batch `GET /albums`, `/tracks`, `/episodes`
 * are gone too, so everything is fetched individually and cached by the query
 * layer instead.
 *
 * A third thing shapes the playlist half of this file, and it is a limit rather
 * than a workaround: `/playlists/{id}/items` is refused with a 403 for any
 * playlist this account does not own, and the playlist object itself then
 * arrives with no `items` and no `tracks` at all — not the songs, not even a
 * count. Measured, not read off the docs: `npm run spike:playlist`, which also
 * tried market, fields and additional_types on both endpoints. There is no way
 * to list such a playlist, so the screen says so. Playing it still works.
 */

import { ARTIST_ALBUM_PAGE_SIZE, SEARCH_PAGE_SIZE } from '../config';
import { apiRequest } from './client';
import type {
  Album,
  Artist,
  Episode,
  Paged,
  Playlist,
  PlaylistItem,
  SearchResults,
  Show,
  Track,
} from './types';

/** What a search of each type answers with. */
interface SearchItems {
  track: Track;
  album: Album;
  artist: Artist;
  playlist: Playlist;
  show: Show;
}

export type SearchType = keyof SearchItems;

export function search(
  q: string,
  types: SearchType[],
  offset = 0,
): Promise<SearchResults> {
  return apiRequest<SearchResults>('/search', {
    query: {
      q,
      type: types.join(','),
      limit: SEARCH_PAGE_SIZE,
      offset,
      additional_types: 'track,episode',
    },
  });
}

const SEARCH_BUCKET: {
  [K in SearchType]: (r: SearchResults) => Paged<SearchItems[K]> | undefined;
} = {
  track: (r) => r.tracks,
  album: (r) => r.albums,
  artist: (r) => r.artists,
  playlist: (r) => r.playlists,
  show: (r) => r.shows,
};

/**
 * Every searchable type, in the order the chips and the „Alles" shelves use.
 *
 * Read off `SEARCH_BUCKET` rather than written out a second time, so a type
 * added to the union cannot be forgotten by the screen — the record's key order
 * is the one place to reorder or extend what search offers.
 */
export const SEARCH_TYPES = Object.keys(SEARCH_BUCKET) as SearchType[];

/**
 * The one bucket a search of one type answers in — as a page, never as nothing.
 *
 * A search that matched nothing comes back with the bucket missing altogether,
 * and an empty page is the honest reading of that: it says "no results" to the
 * screen, and `nextPageOffset` reads it as the end of the walk rather than as a
 * reason to keep asking for the same offset.
 */
export function searchBucket<K extends SearchType>(
  results: SearchResults,
  type: K,
  offset = 0,
): Paged<SearchItems[K]> {
  return (
    SEARCH_BUCKET[type](results) ?? {
      items: [],
      total: 0,
      limit: SEARCH_PAGE_SIZE,
      offset,
      next: null,
    }
  );
}

/** One page of search results of a single type, ready for `usePagedList`. */
export async function searchPage<K extends SearchType>(
  q: string,
  type: K,
  offset = 0,
): Promise<Paged<SearchItems[K]>> {
  return searchBucket(await search(q, [type], offset), type, offset);
}

/**
 * Every type at once — one request, one page of each, which is what the „Alles"
 * filter shows. Spotify caps that page at ten per bucket, so the shelves are a
 * taste of each type and a chip is how you see the rest.
 */
export const searchAll = (q: string) => search(q, SEARCH_TYPES);

export const getAlbum = (id: string) => apiRequest<Album>(`/albums/${id}`);

export const getAlbumTracks = (id: string, offset = 0) =>
  apiRequest<Paged<Track>>(`/albums/${id}/tracks`, {
    query: { limit: 50, offset },
  });

export const getArtist = (id: string) => apiRequest<Artist>(`/artists/${id}`);

/**
 * Everything an artist is on — not only what they released under their own name.
 *
 * `compilation` and `appears_on` are in the list because of what this app is
 * for: in a Hörspiel and kids-music catalogue the record a kid is looking for
 * is usually a Sampler somebody else put out, and asking only for `album,single`
 * hid exactly those. For the artist this was first noticed on it is the
 * difference between 2 releases and 11.
 *
 * Note the page size: this endpoint refuses anything above ten outright. See
 * ARTIST_ALBUM_PAGE_SIZE.
 */
export const getArtistAlbums = (id: string, offset = 0) =>
  apiRequest<Paged<Album>>(`/artists/${id}/albums`, {
    query: {
      limit: ARTIST_ALBUM_PAGE_SIZE,
      offset,
      include_groups: 'album,single,compilation,appears_on',
    },
  });

export const getPlaylist = (id: string) =>
  apiRequest<Playlist>(`/playlists/${id}`);

export const getPlaylistItems = (id: string, offset = 0) =>
  apiRequest<Paged<PlaylistItem>>(`/playlists/${id}/items`, {
    query: { limit: 50, offset, additional_types: 'track,episode' },
  });

/**
 * The number of entries in a playlist, when the response already carries it.
 *
 * `undefined` means "this response did not say", which is a different thing
 * from an empty playlist and has to stay distinguishable from it: `/me/playlists`
 * summaries come back without a count, and treating that as zero is what made
 * every playlist in the library claim it held no songs.
 */
export const playlistItemCount = (playlist: Playlist): number | undefined =>
  playlist.items?.total ?? playlist.tracks?.total;

/**
 * What one entry of a playlist holds, under whichever name the response used.
 *
 * The same February 2026 rename as above, one level down: `items.items.track`
 * became `items.items.item`. Reading only the old name is what left the
 * playlist screen drawing a header over an empty list — every entry looked
 * like a removed song.
 */
export const playlistEntry = (entry: PlaylistItem): Track | Episode | null =>
  entry.item ?? entry.track ?? null;

/**
 * Ask for the count directly, for a summary that arrived without one.
 *
 * One item is requested because only the page total is wanted; the items
 * themselves are the detail screen's business.
 *
 * Refused for a playlist this account does not own, like everything else about
 * one — the tile then shows no count rather than a wrong one.
 */
export async function fetchPlaylistItemCount(id: string): Promise<number> {
  const page = await apiRequest<Paged<PlaylistItem>>(`/playlists/${id}/items`, {
    query: { limit: 1, additional_types: 'track,episode' },
  });
  return page.total;
}

export const getShow = (id: string) => apiRequest<Show>(`/shows/${id}`);

export const getShowEpisodes = (id: string, offset = 0) =>
  apiRequest<Paged<Episode>>(`/shows/${id}/episodes`, {
    query: { limit: 50, offset },
  });

export const getEpisode = (id: string) =>
  apiRequest<Episode>(`/episodes/${id}`);

export const getMyPlaylists = (offset = 0) =>
  apiRequest<Paged<Playlist>>('/me/playlists', { query: { limit: 50, offset } });

export const getMyAlbums = (offset = 0) =>
  apiRequest<Paged<{ album: Album }>>('/me/albums', {
    query: { limit: 50, offset },
  });

export const getMyShows = (offset = 0) =>
  apiRequest<Paged<{ show: Show }>>('/me/shows', {
    query: { limit: 50, offset },
  });
