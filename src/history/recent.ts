/**
 * What was listened to lately, and how to work out what to remember it as.
 *
 * Pure on purpose, like the sticky device choice next door: the interesting
 * behaviour here is a derivation rule and a storage format, and both are worth
 * testing without a browser. HistoryProvider owns the localStorage and the
 * React wiring; resolve.ts owns the one lookup this cannot do without network.
 *
 * The thing being remembered is deliberately the *parent* — the podcast, album
 * or playlist — rather than the song or episode itself. A kid coming back to
 * the app wants the cover they tapped yesterday, not the fourth track of it.
 */

import type {
  Album,
  Episode,
  Image,
  PlaybackContext,
  PlaybackState,
  Playlist,
  RecentlyPlayedItem,
  Show,
  Track,
} from '../api/types';

/** The three things that have a detail screen worth landing on. */
export type RecentKind = 'album' | 'playlist' | 'show';

export interface RecentEntry {
  kind: RecentKind;
  id: string;
  name: string;
  /** Artists or publisher, so the tile reads like its twin in „Deine Sachen". */
  subtitle?: string;
  /** Snapshot, kept largest-first the way Spotify sends it — Artwork reads the last. */
  images: Image[];
  /** Epoch ms this was last heard. */
  playedAt: number;
}

export interface RecentStore {
  version: 1;
  /** Most-recent-first. */
  entries: RecentEntry[];
  /** True once Spotify's own history has been folded in, so it happens once. */
  backfilled: boolean;
}

export const RECENT_VERSION = 1;

/**
 * How many covers the home screen remembers.
 *
 * Eight because the tile grid is two columns on a phone, so this is four rows
 * before „Deine Sachen" starts — enough to hold a week of habits without
 * pushing the saved things off the screen entirely.
 */
export const RECENT_LIMIT = 8;

export const EMPTY_RECENT: RecentStore = {
  version: RECENT_VERSION,
  entries: [],
  backfilled: false,
};

/**
 * Per account, because several kids share this app and a history is a personal
 * thing. Switching accounts must switch the covers, not merge them.
 */
export const recentKey = (accountId: string): string =>
  `novid.recent.${accountId}`;

const KINDS: readonly string[] = ['album', 'playlist', 'show'];

const isKind = (value: unknown): value is RecentKind =>
  typeof value === 'string' && KINDS.includes(value);

/** Keeps only what Artwork actually reads, so a stored snapshot stays small. */
function cleanImages(value: unknown): Image[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((img) => {
    const url = (img as Image | null)?.url;
    if (typeof url !== 'string' || !url) return [];
    const { height, width } = img as Image;
    return [
      {
        url,
        height: typeof height === 'number' ? height : null,
        width: typeof width === 'number' ? width : null,
      },
    ];
  });
}

function cleanEntry(value: unknown): RecentEntry | null {
  const raw = value as Partial<RecentEntry> | null;
  if (!raw || !isKind(raw.kind)) return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.name !== 'string' || !raw.name) return null;

  return {
    kind: raw.kind,
    id: raw.id,
    name: raw.name,
    subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : undefined,
    images: cleanImages(raw.images),
    playedAt: typeof raw.playedAt === 'number' ? raw.playedAt : 0,
  };
}

/**
 * Reads the stored history. Never throws: this runs on the way to painting the
 * first screen, and nothing here is worth a blank app.
 *
 * A single malformed entry is dropped rather than taken as proof the whole file
 * is rubbish — losing one cover beats losing the lot. A payload that is not a
 * store at all, or one written by a future version, starts over.
 */
export function parseRecent(raw: string | null): RecentStore {
  if (!raw) return EMPTY_RECENT;
  try {
    const parsed = JSON.parse(raw) as Partial<RecentStore> | null;
    if (!parsed || parsed.version !== RECENT_VERSION) return EMPTY_RECENT;
    if (!Array.isArray(parsed.entries)) return EMPTY_RECENT;

    return {
      version: RECENT_VERSION,
      entries: parsed.entries
        .map(cleanEntry)
        .filter((e): e is RecentEntry => e !== null)
        .slice(0, RECENT_LIMIT),
      backfilled: parsed.backfilled === true,
    };
  } catch {
    return EMPTY_RECENT;
  }
}

export function serialiseRecent(store: RecentStore): string {
  return JSON.stringify(store);
}

const entryKey = (entry: Pick<RecentEntry, 'kind' | 'id'>): string =>
  `${entry.kind}:${entry.id}`;

/** Puts an entry at the front, moving rather than duplicating one already there. */
export function addRecent(
  store: RecentStore,
  entry: RecentEntry,
): RecentStore {
  const key = entryKey(entry);
  return {
    ...store,
    entries: [
      entry,
      ...store.entries.filter((e) => entryKey(e) !== key),
    ].slice(0, RECENT_LIMIT),
  };
}

/**
 * Folds Spotify's history into what this app recorded itself.
 *
 * Sets `backfilled`, because merging *is* the backfill — keeping the flag with
 * the merge means "did this already happen" is one tested decision rather than
 * a boolean somebody has to remember to set at the call site.
 *
 * Newer wins per parent, so a cover this app watched being played today keeps
 * its place ahead of the same cover in last week's Spotify history.
 */
export function mergeRecent(
  store: RecentStore,
  entries: RecentEntry[],
): RecentStore {
  const byKey = new Map<string, RecentEntry>();
  for (const entry of [...store.entries, ...entries]) {
    const key = entryKey(entry);
    const existing = byKey.get(key);
    if (!existing || entry.playedAt > existing.playedAt) byKey.set(key, entry);
  }

  return {
    ...store,
    entries: [...byKey.values()]
      .sort((a, b) => b.playedAt - a.playedAt)
      .slice(0, RECENT_LIMIT),
    backfilled: true,
  };
}

/**
 * What to remember, before it is known whether a lookup is needed.
 *
 * `episode` is not a kind of its own — it means "an episode whose show did not
 * come with it", which resolve.ts turns into a show.
 */
export type RecentSource = RecentKind | 'episode';

export interface RecentDetails {
  name: string;
  subtitle?: string;
  images: Image[];
}

export interface RecentRef {
  source: RecentSource;
  id: string;
  /** Filled when the playback state already carried enough to build a tile. */
  details: RecentDetails | null;
}

export const refKey = (ref: RecentRef): string => `${ref.source}:${ref.id}`;

/**
 * Pulls the id out of `spotify:<type>:<id>`, insisting on the type it was asked
 * for. Local files (`spotify:local:…`) have no detail screen, so they fail here.
 */
export function idFromUri(
  uri: string | undefined | null,
  type: string,
): string | null {
  if (!uri) return null;
  const parts = uri.split(':');
  if (parts.length !== 3) return null;
  const [scheme, kind, id] = parts;
  if (scheme !== 'spotify' || kind !== type || !id) return null;
  return id;
}

export const detailsFromAlbum = (album: Album): RecentDetails => ({
  name: album.name,
  subtitle: album.artists.map((a) => a.name).join(', '),
  images: album.images,
});

export const detailsFromShow = (show: Show): RecentDetails => ({
  name: show.name,
  subtitle: show.publisher,
  images: show.images,
});

export const detailsFromPlaylist = (playlist: Playlist): RecentDetails => ({
  name: playlist.name,
  images: playlist.images,
});

/** Builds the storable entry once the details are known. */
export function entryFrom(
  ref: RecentRef,
  playedAt: number,
): RecentEntry | null {
  if (!ref.details || ref.source === 'episode') return null;
  return {
    kind: ref.source,
    id: ref.id,
    name: ref.details.name,
    subtitle: ref.details.subtitle,
    images: ref.details.images,
    playedAt,
  };
}

/**
 * The derivation rule: given what is playing and what it is playing from, what
 * belongs on the home screen.
 *
 * The context wins over the item, and that is the whole point. A kid who tapped
 * a playlist hears tracks from a dozen different albums; remembering the album
 * of whichever one happened to be playing would fill the home screen with
 * covers they never chose and cannot find their way back from. The item is only
 * consulted when there is no context worth having.
 */
export function referenceFrom(
  item: Track | Episode | null | undefined,
  context: PlaybackContext | null | undefined,
): RecentRef | null {
  const track = item?.type === 'track' ? item : null;
  const episode = item?.type === 'episode' ? item : null;

  if (context) {
    // Anything else — an artist radio, a „collection", something Spotify has
    // yet to invent — falls through to the item rather than being forced into a
    // tile this app has no screen for.
    const playlistId = idFromUri(context.uri, 'playlist');
    if (context.type === 'playlist' && playlistId)
      return { source: 'playlist', id: playlistId, details: null };

    const albumId = idFromUri(context.uri, 'album');
    if (context.type === 'album' && albumId)
      return {
        source: 'album',
        id: albumId,
        // Free when the track came from the album we are about to remember.
        details:
          track?.album?.id === albumId ? detailsFromAlbum(track.album) : null,
      };

    const showId = idFromUri(context.uri, 'show');
    if (context.type === 'show' && showId)
      return {
        source: 'show',
        id: showId,
        details:
          episode?.show?.id === showId ? detailsFromShow(episode.show) : null,
      };
  }

  if (episode) {
    // `/me/player` normally embeds the show, but it is optional in the API and
    // an episode without one is still worth remembering — resolve.ts looks it up.
    if (episode.show?.id)
      return {
        source: 'show',
        id: episode.show.id,
        details: detailsFromShow(episode.show),
      };
    return episode.id ? { source: 'episode', id: episode.id, details: null } : null;
  }

  if (track?.album?.id)
    return {
      source: 'album',
      id: track.album.id,
      details: detailsFromAlbum(track.album),
    };

  return null;
}

/**
 * The recording gate. Lives here rather than in the provider so „we never put
 * an advert on the home screen" is a tested fact and not a hopeful `if`.
 */
export function referenceForPlayback(
  state: PlaybackState | undefined,
): RecentRef | null {
  if (!state || !state.is_playing || !state.item) return null;
  if (state.currently_playing_type !== 'track' &&
      state.currently_playing_type !== 'episode')
    return null;
  return referenceFrom(state.item, state.context);
}

/**
 * Maps Spotify's history onto the same rule, collapsing it to one reference per
 * parent.
 *
 * Deduplicating here rather than after resolving is what keeps fifty history
 * items down to at most RECENT_LIMIT lookups — and most of those need none,
 * because this endpoint embeds each track's album.
 */
export function refsFromRecentlyPlayed(
  items: RecentlyPlayedItem[] | undefined,
): { ref: RecentRef; playedAt: number }[] {
  if (!items) return [];

  const byKey = new Map<string, { ref: RecentRef; playedAt: number }>();
  for (const item of items) {
    const ref = referenceFrom(item.track, item.context);
    if (!ref) continue;
    const playedAt = Date.parse(item.played_at);
    if (Number.isNaN(playedAt)) continue;

    const key = refKey(ref);
    const existing = byKey.get(key);
    // Keep the newest play, but prefer whichever reference came with details:
    // one lookup saved, and the two describe the same thing either way.
    if (!existing) {
      byKey.set(key, { ref, playedAt });
    } else if (playedAt > existing.playedAt) {
      byKey.set(key, { ref: existing.ref.details ? existing.ref : ref, playedAt });
    } else if (!existing.ref.details && ref.details) {
      byKey.set(key, { ref, playedAt: existing.playedAt });
    }
  }

  return [...byKey.values()]
    .sort((a, b) => b.playedAt - a.playedAt)
    .slice(0, RECENT_LIMIT);
}
