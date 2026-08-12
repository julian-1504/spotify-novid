/**
 * Catalog reads: search, albums, artists, playlists, shows, library.
 *
 * Two February 2026 changes are baked in here: search pages at 10 items max,
 * and playlist contents come from `/playlists/{id}/items` (the older
 * `/tracks` path was removed). Batch `GET /albums`, `/tracks`, `/episodes`
 * are gone too, so everything is fetched individually and cached by the query
 * layer instead.
 */

import { SEARCH_PAGE_SIZE } from '../config';
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

export type SearchType = 'track' | 'album' | 'artist' | 'playlist' | 'show';

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

export const getAlbum = (id: string) => apiRequest<Album>(`/albums/${id}`);

export const getAlbumTracks = (id: string, offset = 0) =>
  apiRequest<Paged<Track>>(`/albums/${id}/tracks`, {
    query: { limit: 50, offset },
  });

export const getArtist = (id: string) => apiRequest<Artist>(`/artists/${id}`);

export const getArtistAlbums = (id: string, offset = 0) =>
  apiRequest<Paged<Album>>(`/artists/${id}/albums`, {
    query: { limit: 50, offset, include_groups: 'album,single' },
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
 * Ask for the count directly, for a summary that arrived without one.
 *
 * One item is requested because only the page total is wanted; the items
 * themselves are the detail screen's business.
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
