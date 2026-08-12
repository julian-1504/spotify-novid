import { describe, expect, it } from 'vitest';
import {
  addRecent,
  EMPTY_RECENT,
  mergeRecent,
  parseRecent,
  RECENT_LIMIT,
  recentKey,
  referenceForPlayback,
  referenceFrom,
  refsFromRecentlyPlayed,
  serialiseRecent,
  type RecentEntry,
  type RecentStore,
} from './recent';
import type {
  Album,
  Episode,
  PlaybackContext,
  PlaybackState,
  RecentlyPlayedItem,
  Show,
  Track,
} from '../api/types';

const album = (extra: Partial<Album> = {}): Album => ({
  id: 'al1',
  name: 'Bibi Blocksberg',
  uri: 'spotify:album:al1',
  images: [{ url: 'https://i/al1.jpg', height: 300, width: 300 }],
  artists: [{ id: 'ar1', name: 'Bibi', uri: 'spotify:artist:ar1' }],
  release_date: '2020-01-01',
  total_tracks: 10,
  album_type: 'album',
  ...extra,
});

const show = (extra: Partial<Show> = {}): Show => ({
  id: 'sh1',
  name: 'Benjamin Blümchen',
  uri: 'spotify:show:sh1',
  images: [{ url: 'https://i/sh1.jpg', height: 300, width: 300 }],
  publisher: 'Kiddinx',
  description: '',
  total_episodes: 100,
  ...extra,
});

const track = (extra: Partial<Track> = {}): Track => ({
  id: 't1',
  name: 'Lied',
  uri: 'spotify:track:t1',
  duration_ms: 1000,
  explicit: false,
  track_number: 1,
  artists: [{ id: 'ar1', name: 'Bibi', uri: 'spotify:artist:ar1' }],
  album: album(),
  type: 'track',
  ...extra,
});

const episode = (extra: Partial<Episode> = {}): Episode => ({
  id: 'ep1',
  name: 'Folge 1',
  uri: 'spotify:episode:ep1',
  images: [],
  description: '',
  duration_ms: 1000,
  release_date: '2020-01-01',
  show: show(),
  type: 'episode',
  ...extra,
});

const context = (type: string, uri: string): PlaybackContext => ({ type, uri });

const playback = (extra: Partial<PlaybackState> = {}): PlaybackState => ({
  device: null,
  is_playing: true,
  progress_ms: 0,
  shuffle_state: false,
  repeat_state: 'off',
  item: track(),
  currently_playing_type: 'track',
  context: null,
  ...extra,
});

const entry = (extra: Partial<RecentEntry> = {}): RecentEntry => ({
  kind: 'album',
  id: 'al1',
  name: 'Bibi Blocksberg',
  images: [],
  playedAt: 1000,
  ...extra,
});

const store = (entries: RecentEntry[], backfilled = false): RecentStore => ({
  version: 1,
  entries,
  backfilled,
});

describe('referenceFrom', () => {
  // The bug this whole rule exists for. Inside a playlist every track belongs
  // to some other album, and remembering those would fill the home screen with
  // covers the kid never tapped.
  it('prefers the playlist over the album of the track playing in it', () => {
    const ref = referenceFrom(track(), context('playlist', 'spotify:playlist:pl1'));
    expect(ref).toEqual({ source: 'playlist', id: 'pl1', details: null });
  });

  it('takes the details for free when the album context is the track’s own', () => {
    const ref = referenceFrom(track(), context('album', 'spotify:album:al1'));
    expect(ref?.source).toBe('album');
    expect(ref?.id).toBe('al1');
    expect(ref?.details?.name).toBe('Bibi Blocksberg');
  });

  // A compilation: the context is one album, the track came from another.
  it('leaves an album context that is not the track’s album to be looked up', () => {
    const ref = referenceFrom(track(), context('album', 'spotify:album:other'));
    expect(ref).toEqual({ source: 'album', id: 'other', details: null });
  });

  it('takes the show details from the episode when the context is that show', () => {
    const ref = referenceFrom(episode(), context('show', 'spotify:show:sh1'));
    expect(ref?.source).toBe('show');
    expect(ref?.details?.subtitle).toBe('Kiddinx');
  });

  it('remembers the show of an episode with no context', () => {
    const ref = referenceFrom(episode(), null);
    expect(ref?.source).toBe('show');
    expect(ref?.id).toBe('sh1');
  });

  // The insurance against /me/player omitting the embedded show.
  it('falls back to the episode itself when it carries no show', () => {
    const ref = referenceFrom(episode({ show: undefined }), null);
    expect(ref).toEqual({ source: 'episode', id: 'ep1', details: null });
  });

  it('remembers the album of a track with no context', () => {
    const ref = referenceFrom(track(), null);
    expect(ref?.source).toBe('album');
    expect(ref?.details?.subtitle).toBe('Bibi');
  });

  it('remembers nothing for a track with no album', () => {
    expect(referenceFrom(track({ album: undefined }), null)).toBeNull();
  });

  it('ignores an artist context and falls through to the album', () => {
    const ref = referenceFrom(track(), context('artist', 'spotify:artist:ar1'));
    expect(ref?.source).toBe('album');
  });

  it('falls through on a context type it has never heard of', () => {
    const ref = referenceFrom(track(), context('collection', 'spotify:collection:x'));
    expect(ref?.source).toBe('album');
  });

  it('remembers nothing for a local file', () => {
    const local = track({ album: undefined, uri: 'spotify:local:a:b:c' });
    expect(referenceFrom(local, context('playlist', 'spotify:local:a:b:c'))).toBeNull();
  });

  it('falls through when the context uri is malformed', () => {
    const ref = referenceFrom(track(), context('playlist', 'not-a-uri'));
    expect(ref?.source).toBe('album');
  });

  it('remembers nothing when there is nothing playing', () => {
    expect(referenceFrom(null, null)).toBeNull();
  });
});

describe('referenceForPlayback', () => {
  it('records a playing track', () => {
    expect(referenceForPlayback(playback())?.source).toBe('album');
  });

  it('records nothing without a playback state', () => {
    expect(referenceForPlayback(undefined)).toBeNull();
  });

  it('records nothing when the item is missing', () => {
    expect(referenceForPlayback(playback({ item: null }))).toBeNull();
  });

  // An advert has a context like anything else, so the type is the only guard.
  it('never records an advert, even inside a playlist', () => {
    const state = playback({
      currently_playing_type: 'ad',
      context: context('playlist', 'spotify:playlist:pl1'),
    });
    expect(referenceForPlayback(state)).toBeNull();
  });

  it('never records something Spotify cannot name', () => {
    expect(referenceForPlayback(playback({ currently_playing_type: 'unknown' }))).toBeNull();
  });

  it('records nothing while playback is paused', () => {
    expect(referenceForPlayback(playback({ is_playing: false }))).toBeNull();
  });
});

describe('addRecent', () => {
  it('puts the newest first', () => {
    const next = addRecent(store([entry({ id: 'old' })]), entry({ id: 'new' }));
    expect(next.entries.map((e) => e.id)).toEqual(['new', 'old']);
  });

  it('moves a repeat to the front instead of duplicating it', () => {
    const first = store([entry({ id: 'a' }), entry({ id: 'b' })]);
    const next = addRecent(first, entry({ id: 'b', playedAt: 9000 }));
    expect(next.entries.map((e) => e.id)).toEqual(['b', 'a']);
    expect(next.entries[0].playedAt).toBe(9000);
  });

  // Spotify ids are only unique within a type, and an album and a show could
  // in principle collide.
  it('keeps the same id under two kinds apart', () => {
    const next = addRecent(store([entry({ kind: 'album', id: 'x' })]), entry({ kind: 'show', id: 'x' }));
    expect(next.entries).toHaveLength(2);
  });

  it('drops the oldest once it is full', () => {
    const full = store(
      Array.from({ length: RECENT_LIMIT }, (_, i) => entry({ id: `e${i}` })),
    );
    const next = addRecent(full, entry({ id: 'newest' }));
    expect(next.entries).toHaveLength(RECENT_LIMIT);
    expect(next.entries[0].id).toBe('newest');
    expect(next.entries.some((e) => e.id === `e${RECENT_LIMIT - 1}`)).toBe(false);
  });

  it('does not forget that the backfill already happened', () => {
    expect(addRecent(store([], true), entry()).backfilled).toBe(true);
  });
});

describe('parseRecent', () => {
  it('round-trips a store', () => {
    const original = store([entry({ subtitle: 'Bibi' })], true);
    expect(parseRecent(serialiseRecent(original))).toEqual(original);
  });

  it.each([null, '', '{', 'null', '[]', '"nope"'])(
    'starts over on %j rather than throwing',
    (raw) => {
      expect(parseRecent(raw)).toEqual(EMPTY_RECENT);
    },
  );

  it('starts over on a payload from a version it does not know', () => {
    expect(parseRecent(JSON.stringify({ version: 2, entries: [entry()] }))).toEqual(
      EMPTY_RECENT,
    );
  });

  // Losing one cover beats losing the lot.
  it('drops a broken entry and keeps the rest', () => {
    const raw = JSON.stringify({
      version: 1,
      entries: [entry({ id: 'good' }), { kind: 'album' }, null],
      backfilled: false,
    });
    expect(parseRecent(raw).entries.map((e) => e.id)).toEqual(['good']);
  });

  it('drops an entry whose kind is not one this app can open', () => {
    const raw = JSON.stringify({
      version: 1,
      entries: [{ ...entry(), kind: 'artist' }],
      backfilled: false,
    });
    expect(parseRecent(raw).entries).toEqual([]);
  });

  it('clamps a stored list that is longer than the limit', () => {
    const raw = JSON.stringify({
      version: 1,
      entries: Array.from({ length: RECENT_LIMIT + 5 }, (_, i) => entry({ id: `e${i}` })),
      backfilled: false,
    });
    expect(parseRecent(raw).entries).toHaveLength(RECENT_LIMIT);
  });

  it('keeps only images it can actually draw', () => {
    const raw = JSON.stringify({
      version: 1,
      entries: [entry({ images: [{ url: '' }, { url: 'https://i/a.jpg' }] as never })],
      backfilled: false,
    });
    expect(parseRecent(raw).entries[0].images).toEqual([
      { url: 'https://i/a.jpg', height: null, width: null },
    ]);
  });
});

describe('mergeRecent', () => {
  it('keeps the newer play of a parent that appears in both', () => {
    const local = store([entry({ id: 'al1', playedAt: 5000 })]);
    const merged = mergeRecent(local, [entry({ id: 'al1', playedAt: 1000 })]);
    expect(merged.entries).toHaveLength(1);
    expect(merged.entries[0].playedAt).toBe(5000);
  });

  it('sorts everything newest-first and caps it', () => {
    const local = store([entry({ id: 'a', playedAt: 100 })]);
    const merged = mergeRecent(
      local,
      Array.from({ length: RECENT_LIMIT + 3 }, (_, i) =>
        entry({ id: `b${i}`, playedAt: i + 1 }),
      ),
    );
    expect(merged.entries).toHaveLength(RECENT_LIMIT);
    expect(merged.entries[0].id).toBe('a');
    expect(merged.entries.map((e) => e.playedAt)).toEqual(
      [...merged.entries.map((e) => e.playedAt)].sort((x, y) => y - x),
    );
  });

  it('records that the backfill has happened', () => {
    expect(mergeRecent(store([]), []).backfilled).toBe(true);
  });
});

describe('refsFromRecentlyPlayed', () => {
  const item = (extra: Partial<RecentlyPlayedItem> = {}): RecentlyPlayedItem => ({
    track: track(),
    played_at: '2026-08-12T10:00:00.000Z',
    context: null,
    ...extra,
  });

  it('collapses a long history to one reference per parent', () => {
    const items = Array.from({ length: 50 }, (_, i) =>
      item({
        track: track({ id: `t${i}` }),
        played_at: new Date(1000 + i).toISOString(),
      }),
    );
    const refs = refsFromRecentlyPlayed(items);
    expect(refs).toHaveLength(1);
    expect(refs[0].ref.id).toBe('al1');
  });

  it('keeps the newest play of a repeated parent', () => {
    const refs = refsFromRecentlyPlayed([
      item({ played_at: '2026-08-10T00:00:00.000Z' }),
      item({ played_at: '2026-08-12T00:00:00.000Z' }),
    ]);
    expect(refs[0].playedAt).toBe(Date.parse('2026-08-12T00:00:00.000Z'));
  });

  it('honours a playlist context the same way live playback does', () => {
    const refs = refsFromRecentlyPlayed([
      item({ context: context('playlist', 'spotify:playlist:pl1') }),
    ]);
    expect(refs[0].ref).toEqual({ source: 'playlist', id: 'pl1', details: null });
  });

  it('drops an item nothing can be derived from', () => {
    expect(refsFromRecentlyPlayed([item({ track: track({ album: undefined }) })])).toEqual([]);
  });

  it('drops an item whose timestamp is unreadable', () => {
    expect(refsFromRecentlyPlayed([item({ played_at: 'gestern' })])).toEqual([]);
  });

  it('caps the result at the limit, newest first', () => {
    const items = Array.from({ length: RECENT_LIMIT + 4 }, (_, i) =>
      item({
        track: track({ album: album({ id: `al${i}`, uri: `spotify:album:al${i}` }) }),
        played_at: new Date(1_700_000_000_000 + i * 1000).toISOString(),
      }),
    );
    const refs = refsFromRecentlyPlayed(items);
    expect(refs).toHaveLength(RECENT_LIMIT);
    expect(refs[0].ref.id).toBe(`al${RECENT_LIMIT + 3}`);
  });

  it('tolerates a response with no items at all', () => {
    expect(refsFromRecentlyPlayed(undefined)).toEqual([]);
  });
});

describe('recentKey', () => {
  // The per-account guarantee: two kids, two histories, never one shared list.
  it('gives every account its own key', () => {
    expect(recentKey('anna')).not.toBe(recentKey('ben'));
    expect(recentKey('anna')).toBe('novid.recent.anna');
  });
});
