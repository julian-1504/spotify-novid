/**
 * Walking an offset-paged endpoint.
 *
 * Everything the catalogue returns comes 50 at a time, and a screen that reads
 * only the first page is not showing a kid their playlist — it is showing them
 * the first quarter of it. These two functions are the whole of the logic;
 * `hooks/usePagedList.ts` is the React half that calls them.
 */

import type { Paged } from './types';

/**
 * Where the next page starts, or `undefined` when this was the last one.
 *
 * `next` is the authority on whether more exists — it is the field Spotify
 * nulls on the final page — but the offset itself is computed rather than
 * parsed out of that URL, because `next` is an absolute api.spotify.com link
 * and `apiRequest` takes a path.
 *
 * A page that claims a `next` but returned nothing also ends the walk. That
 * combination should not happen, and if it ever does, stopping beats asking
 * for the same empty page for as long as the screen is open.
 */
export function nextPageOffset<T>(page: Paged<T>): number | undefined {
  if (!page.next || page.items.length === 0) return undefined;
  return page.offset + page.items.length;
}

/** One entry, and where it sits in the list as a whole. */
export interface PagedEntry<T> {
  item: T;
  index: number;
}

/**
 * Pages flattened into entries that know their position in the whole list.
 *
 * The index matters beyond display: playing a song works by handing Spotify
 * the playlist and a position in it, so the third song of the third page has
 * to say 137, not 37. It comes from the offset the API reported for the page
 * rather than from the page's ordinal, and every item counts — including a
 * playlist entry whose track is `null`, which renders as nothing but still
 * occupies its place in the playlist.
 */
export function flattenPages<T>(pages: Paged<T>[]): PagedEntry<T>[] {
  return pages.flatMap((page) =>
    page.items.map((item, i) => ({ item, index: page.offset + i })),
  );
}
