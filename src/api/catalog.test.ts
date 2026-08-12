import { describe, expect, it } from 'vitest';
import { playlistItemCount } from './catalog';
import type { Playlist } from './types';

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
