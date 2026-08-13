import { describe, expect, it } from 'vitest';
import { SEARCH_TYPES, playlistItemCount, searchBucket } from './catalog';
import { nextPageOffset } from './paging';
import { t } from '../strings';
import type { Album, Artist, Paged, Playlist, Show, Track } from './types';

const playlist = (extra: Partial<Playlist>): Playlist => ({
  id: 'p1',
  name: 'Meine Lieder',
  uri: 'spotify:playlist:p1',
  images: [],
  description: '',
  owner: { id: 'u1' },
  ...extra,
});

describe('playlistItemCount', () => {
  it('reads the February 2026 items summary', () => {
    expect(playlistItemCount(playlist({ items: { total: 12 } }))).toBe(12);
  });

  it('still reads the older tracks summary', () => {
    expect(playlistItemCount(playlist({ tracks: { total: 7 } }))).toBe(7);
  });

  it('reports an empty playlist as empty, not as unknown', () => {
    expect(playlistItemCount(playlist({ items: { total: 0 } }))).toBe(0);
  });

  // The library bug: `/me/playlists` summaries carry no count at all, and
  // calling that zero told kids their full playlists held no songs.
  it('reports a missing count as unknown, not as zero', () => {
    expect(playlistItemCount(playlist({}))).toBeUndefined();
  });
});

const page = <T>(items: T[], next: string | null = null): Paged<T> => ({
  items,
  total: items.length,
  limit: 10,
  offset: 0,
  next,
});

const album = (id: string) => ({ id, name: id }) as unknown as Album;
const track = (id: string) => ({ id, name: id }) as unknown as Track;
const artist = (id: string) => ({ id, name: id }) as unknown as Artist;
const show = (id: string) => ({ id, name: id }) as unknown as Show;

describe('searchBucket', () => {
  it('reads the bucket belonging to the type that was searched', () => {
    const results = {
      albums: page([album('a1')]),
      tracks: page([track('t1')]),
    };

    expect(searchBucket(results, 'album').items[0].id).toBe('a1');
    expect(searchBucket(results, 'track').items[0].id).toBe('t1');
  });

  it('keeps the paging fields the walk runs on', () => {
    const next = 'https://api.spotify.com/v1/search?offset=10';

    expect(searchBucket({ albums: page([album('a1')], next) }, 'album')).toEqual(
      expect.objectContaining({ next, offset: 0, total: 1 }),
    );
  });

  // A search that matched nothing omits the bucket entirely. Reading that as an
  // empty page is what lets the screen say "nichts gefunden" instead of sitting
  // on undefined.
  it('turns a missing bucket into an empty page at that offset', () => {
    expect(searchBucket({}, 'album', 20)).toEqual({
      items: [],
      total: 0,
      limit: 10,
      offset: 20,
      next: null,
    });
  });

  it('ends the walk on a missing bucket rather than asking again', () => {
    expect(nextPageOffset(searchBucket({}, 'album', 20))).toBeUndefined();
  });
});

/**
 * The list the chips and the „Alles" shelves are both built from. It is read
 * off `SEARCH_BUCKET`, so these guard what that derivation cannot: that a type
 * added there arrives on screen with a German label and its own bucket, rather
 * than as an unlabelled chip over somebody else's results.
 */
describe('SEARCH_TYPES', () => {
  it('lists every type search offers', () => {
    expect(SEARCH_TYPES).toEqual(['track', 'album', 'artist', 'playlist', 'show']);
  });

  it('has a chip label for each', () => {
    for (const type of SEARCH_TYPES) {
      expect(t.search.tabs[type]).toBeTruthy();
    }
  });

  it('reads a different bucket for each', () => {
    const results = {
      tracks: page([track('t1')]),
      albums: page([album('a1')]),
      artists: page([artist('r1')]),
      playlists: page([playlist({})]),
      shows: page([show('s1')]),
    };

    const seen = SEARCH_TYPES.map(
      (type) => searchBucket(results, type).items[0]?.id,
    );

    expect(seen).toEqual(['t1', 'a1', 'r1', 'p1', 's1']);
  });
});
