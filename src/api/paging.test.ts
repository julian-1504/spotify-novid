import { describe, expect, it } from 'vitest';
import { playlistEntry } from './catalog';
import { flattenPages, nextPageOffset } from './paging';
import type { Paged, PlaylistItem, Track } from './types';

const page = <T>(items: T[], offset: number, next: string | null): Paged<T> => ({
  items,
  total: 137,
  limit: 50,
  offset,
  next,
});

describe('nextPageOffset', () => {
  it('carries on where the page ended', () => {
    expect(nextPageOffset(page(Array(50).fill('x'), 0, 'https://…'))).toBe(50);
  });

  // The offset is counted, not read out of `next`: that field is an absolute
  // api.spotify.com URL and the client takes paths.
  it('counts from the offset the page reported, not from its ordinal', () => {
    expect(nextPageOffset(page(Array(50).fill('x'), 100, 'https://…'))).toBe(150);
  });

  it('stops at the last page', () => {
    expect(nextPageOffset(page(Array(37).fill('x'), 100, null))).toBeUndefined();
  });

  // Should not happen; if it ever does, asking for the same empty page forever
  // is the one outcome worth ruling out.
  it('stops on an empty page even when it claims there is more', () => {
    expect(nextPageOffset(page([], 50, 'https://…'))).toBeUndefined();
  });
});

const track = (id: string) =>
  ({ id, name: id, type: 'track' }) as unknown as Track;

describe('flattenPages', () => {
  it('is empty for no pages at all', () => {
    expect(flattenPages<Track>([])).toEqual([]);
  });

  // The whole point: tapping the first song of page two has to start song 51,
  // not song 1.
  it('keeps counting across the page boundary', () => {
    const entries = flattenPages([
      page([track('a'), track('b')], 0, 'https://…'),
      page([track('c')], 50, null),
    ]);

    expect(entries.map((e) => e.index)).toEqual([0, 1, 50]);
    expect(entries.map((e) => e.item.id)).toEqual(['a', 'b', 'c']);
  });

  // A playlist entry can hold nothing — removed, or unavailable here. The row
  // renders as nothing, but the song still sits at that position in the
  // playlist, so it has to keep its index or every song after it starts the
  // wrong one.
  //
  // Read through `playlistEntry` and built on `item` rather than on the
  // renamed-away `track`: written from the type instead of from a response,
  // this test passed no matter what the API sent, which is what made the wrong
  // key look tested.
  it('lets an empty playlist entry keep its place', () => {
    const items: PlaylistItem[] = [
      { item: track('a') },
      { item: null },
      { item: track('c') },
    ];

    const entries = flattenPages([page(items, 0, null)]);

    expect(entries.map((e) => e.index)).toEqual([0, 1, 2]);
    expect(playlistEntry(entries[2].item)?.id).toBe('c');
    expect(playlistEntry(entries[1].item)).toBeNull();
  });
});
