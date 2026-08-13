import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { flattenPages, nextPageOffset, type PagedEntry } from '../api/paging';
import type { Paged } from '../api/types';

/**
 * A list that keeps going: the first 50 on open, the next 50 whenever the
 * caller asks for them.
 *
 * The caller decides *when* to ask — `components/EndOfList.tsx` does it by
 * watching for the end of the list coming into view — and gets back entries
 * that carry their absolute position, because a row's position is what starts
 * the right song.
 */
export function usePagedList<T>(
  queryKey: QueryKey,
  fetchPage: (offset: number) => Promise<Paged<T>>,
) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: nextPageOffset,
  });

  const pages = query.data?.pages;

  return {
    entries: pages ? flattenPages(pages) : ([] as PagedEntry<T>[]),
    /**
     * How long the list is in full, as the API stated it — not how many
     * entries have been fetched so far. Undefined until the first page lands,
     * which is a different thing from an empty list and stays distinguishable
     * from it.
     */
    total: pages?.[0]?.total,
    error: query.error,
    /**
     * Nothing has arrived and nothing has failed — the honest test for „this
     * list is not here yet".
     *
     * `isLoading` is deliberately not what callers should ask, because it is
     * `isPending && isFetching`: a query waiting between retry attempts, or one
     * React Query has paused because it believes the connection is gone, is
     * pending while *not* fetching. Reading `isLoading` there says „finished,
     * nothing to show" about a list that never arrived — which is how a
     * playlist that failed to load came to announce itself as empty.
     */
    isPending: query.isPending,
    /** Waiting for a connection rather than for Spotify. Never resolves alone. */
    isPaused: query.isPaused,
    isLoading: query.isLoading,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
