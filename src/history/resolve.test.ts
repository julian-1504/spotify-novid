import { describe, expect, it, vi } from 'vitest';
import { resolveRef, type RecentLookups } from './resolve';
import { detailsFromAlbum } from './recent';
import type { Album, Episode, Playlist, Show } from '../api/types';

const album: Album = {
  id: 'al1',
  name: 'Bibi Blocksberg',
  uri: 'spotify:album:al1',
  images: [{ url: 'https://i/al1.jpg', height: 300, width: 300 }],
  artists: [{ id: 'ar1', name: 'Bibi', uri: 'spotify:artist:ar1' }],
  release_date: '2020-01-01',
  total_tracks: 10,
  album_type: 'album',
};

const show: Show = {
  id: 'sh1',
  name: 'Benjamin Blümchen',
  uri: 'spotify:show:sh1',
  images: [{ url: 'https://i/sh1.jpg', height: 300, width: 300 }],
  publisher: 'Kiddinx',
  description: '',
  total_episodes: 100,
};

const playlist: Playlist = {
  id: 'pl1',
  name: 'Meine Lieder',
  uri: 'spotify:playlist:pl1',
  images: [{ url: 'https://i/pl1.jpg', height: 300, width: 300 }],
  description: '',
  owner: { id: 'u1' },
};

const episode = (extra: Partial<Episode> = {}): Episode => ({
  id: 'ep1',
  name: 'Folge 1',
  uri: 'spotify:episode:ep1',
  images: [],
  description: '',
  duration_ms: 1000,
  release_date: '2020-01-01',
  show,
  type: 'episode',
  ...extra,
});

const lookups = (extra: Partial<RecentLookups> = {}): RecentLookups => ({
  album: vi.fn(() => Promise.resolve(album)),
  playlist: vi.fn(() => Promise.resolve(playlist)),
  show: vi.fn(() => Promise.resolve(show)),
  episode: vi.fn(() => Promise.resolve(episode())),
  ...extra,
});

describe('resolveRef', () => {
  // Most recordings come off a playback state that already had everything.
  it('asks for nothing when the reference carries its own details', async () => {
    const api = lookups();
    const entry = await resolveRef(
      { source: 'album', id: 'al1', details: detailsFromAlbum(album) },
      1234,
      api,
    );

    expect(entry).toEqual({
      kind: 'album',
      id: 'al1',
      name: 'Bibi Blocksberg',
      subtitle: 'Bibi',
      images: album.images,
      playedAt: 1234,
    });
    expect(api.album).not.toHaveBeenCalled();
    expect(api.playlist).not.toHaveBeenCalled();
  });

  it('looks a playlist up, since a context carries only its uri', async () => {
    const api = lookups();
    const entry = await resolveRef({ source: 'playlist', id: 'pl1', details: null }, 7, api);

    expect(api.playlist).toHaveBeenCalledWith('pl1');
    expect(entry).toMatchObject({ kind: 'playlist', id: 'pl1', name: 'Meine Lieder', playedAt: 7 });
    // Playlists have no artist or publisher to put under the title.
    expect(entry?.subtitle).toBeUndefined();
  });

  it('turns an episode into the show it belongs to', async () => {
    const api = lookups();
    const entry = await resolveRef({ source: 'episode', id: 'ep1', details: null }, 7, api);

    expect(api.episode).toHaveBeenCalledWith('ep1');
    expect(entry).toMatchObject({ kind: 'show', id: 'sh1', subtitle: 'Kiddinx' });
  });

  it('gives up on an episode that has no show even after looking it up', async () => {
    const api = lookups({ episode: () => Promise.resolve(episode({ show: undefined })) });
    expect(await resolveRef({ source: 'episode', id: 'ep1', details: null }, 7, api)).toBeNull();
  });

  // A cover is a nicety. Losing one must never surface as an error.
  it('gives up quietly when a lookup fails', async () => {
    const api = lookups({ playlist: () => Promise.reject(new Error('403')) });
    expect(await resolveRef({ source: 'playlist', id: 'pl1', details: null }, 7, api)).toBeNull();
  });
});
