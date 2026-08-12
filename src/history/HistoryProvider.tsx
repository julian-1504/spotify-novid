import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { isPending } from '../auth/accounts';
import { usePlayer } from '../player/PlayerProvider';
import { getAlbum, getEpisode, getPlaylist, getShow } from '../api/catalog';
import { getRecentlyPlayed } from '../api/player';
import {
  addRecent,
  EMPTY_RECENT,
  mergeRecent,
  parseRecent,
  recentKey,
  refKey,
  referenceForPlayback,
  refsFromRecentlyPlayed,
  serialiseRecent,
  type RecentEntry,
  type RecentStore,
} from './recent';
import { resolveRef, type RecentLookups } from './resolve';

const HistoryContext = createContext<RecentEntry[]>([]);

/**
 * Watches what is playing and remembers the covers it came from.
 *
 * Sits inside PlayerProvider because it reads the playback state that is
 * already being polled there, and outside the app shell because the home screen
 * has to read the result. Its own provider rather than another effect in
 * PlayerProvider: recording has to run wherever playback is polled — that is,
 * always — while reading only happens on one screen, and PlayerProvider is
 * already carrying enough.
 */
export function HistoryProvider({ children }: { children: ReactNode }) {
  const { state } = usePlayer();
  const { activeAccount } = useAuth();
  const queryClient = useQueryClient();

  /**
   * Whose history this is. A pending id belongs to a sign-in that has not come
   * back with a real Spotify id yet; keying storage on it would leave an
   * orphaned entry behind the moment the account is re-keyed.
   */
  const accountId =
    activeAccount && !isPending(activeAccount.id) ? activeAccount.id : null;

  const [store, setStore] = useState<RecentStore>(EMPTY_RECENT);
  /** The parent last written, so the 3s poll does not rewrite it every tick. */
  const lastRef = useRef<string | null>(null);
  /** The account the backfill has already been attempted for this session. */
  const backfilledFor = useRef<string | null>(null);

  // A different kid means a different list. Reading here rather than in the
  // useState initialiser is what makes an account switch swap the covers.
  useEffect(() => {
    lastRef.current = null;
    setStore(accountId ? parseRecent(localStorage.getItem(recentKey(accountId))) : EMPTY_RECENT);
  }, [accountId]);

  /**
   * Applies a change and writes it out. Takes an updater rather than a value
   * because both callers act after an await, by which time the store they last
   * saw may already have moved.
   */
  const update = useCallback(
    (change: (prev: RecentStore) => RecentStore) => {
      setStore((prev) => {
        const next = change(prev);
        if (accountId) {
          try {
            localStorage.setItem(recentKey(accountId), serialiseRecent(next));
          } catch {
            // Full or private-mode storage. The covers are gone at the next
            // launch and nothing else changes; not worth interrupting anyone.
          }
        }
        return next;
      });
    },
    [accountId],
  );

  /**
   * Routed through the query cache using the detail screens' own keys, so a
   * lookup is usually already answered — the kid has just come from that screen
   * — and when it is not, it warms the cache for the tap that follows.
   */
  const lookups = useMemo<RecentLookups>(
    () => ({
      album: (id) =>
        queryClient.fetchQuery({ queryKey: ['album', id], queryFn: () => getAlbum(id) }),
      playlist: (id) =>
        queryClient.fetchQuery({ queryKey: ['playlist', id], queryFn: () => getPlaylist(id) }),
      show: (id) =>
        queryClient.fetchQuery({ queryKey: ['show', id], queryFn: () => getShow(id) }),
      episode: (id) =>
        queryClient.fetchQuery({ queryKey: ['episode', id], queryFn: () => getEpisode(id) }),
    }),
    [queryClient],
  );

  // Record what is playing.
  useEffect(() => {
    if (!accountId) return;
    const ref = referenceForPlayback(state);
    if (!ref) return;

    // One write per parent, not per poll: an hour inside one playlist writes
    // once. Set before the await, or two polls three seconds apart both fire.
    const key = refKey(ref);
    if (key === lastRef.current) return;
    lastRef.current = key;

    void resolveRef(ref, Date.now(), lookups).then((entry) => {
      if (entry) update((prev) => addRecent(prev, entry));
    });
    // Switching accounts clears the query cache, so `state` is undefined for a
    // beat — which is why nothing from the previous kid can land in this one's
    // history between the switch and the next poll.
  }, [state, accountId, lookups, update]);

  // Seed from Spotify's own history, once per account.
  useEffect(() => {
    if (!accountId || store.backfilled || backfilledFor.current === accountId) return;
    backfilledFor.current = accountId;

    void (async () => {
      try {
        const page = await getRecentlyPlayed(50);
        const resolved = await Promise.all(
          refsFromRecentlyPlayed(page?.items).map((r) =>
            resolveRef(r.ref, r.playedAt, lookups),
          ),
        );
        const entries = resolved.filter((e): e is RecentEntry => e !== null);
        update((prev) => mergeRecent(prev, entries));
      } catch {
        // A 403 on a grant older than the scope, an offline launch, a rate
        // limit — all the same answer: show whatever was recorded locally. The
        // flag stays unset, so a later launch tries again once somebody has
        // re-authorized; `backfilledFor` keeps it to one attempt per session.
      }
    })();
  }, [accountId, store.backfilled, lookups, update]);

  return (
    <HistoryContext.Provider value={store.entries}>{children}</HistoryContext.Provider>
  );
}

/** The covers to offer, newest first. Empty until something has been played. */
export function useRecent(): RecentEntry[] {
  return useContext(HistoryContext);
}
