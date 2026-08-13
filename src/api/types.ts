/**
 * Spotify object shapes, trimmed to what this app uses.
 *
 * Note the absence of `popularity`, `followers` and `available_markets` — those
 * fields were removed from Development Mode responses in February 2026, so
 * nothing here may depend on them.
 */

export interface Image {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SimpleArtist {
  id: string;
  name: string;
  uri: string;
}

export interface Artist extends SimpleArtist {
  images: Image[];
  genres?: string[];
}

export interface Album {
  id: string;
  name: string;
  uri: string;
  images: Image[];
  artists: SimpleArtist[];
  release_date: string;
  total_tracks: number;
  album_type: string;
}

export interface Track {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  explicit: boolean;
  track_number: number;
  is_playable?: boolean;
  artists: SimpleArtist[];
  album?: Album;
  type: 'track';
}

export interface Show {
  id: string;
  name: string;
  uri: string;
  images: Image[];
  publisher: string;
  description: string;
  total_episodes: number;
  /** Spotify's own free-text media hint. Never trusted as a video filter. */
  media_type?: string;
}

export interface Episode {
  id: string;
  name: string;
  uri: string;
  images: Image[];
  description: string;
  duration_ms: number;
  release_date: string;
  is_playable?: boolean;
  /** How far the user previously got, so playback can resume. */
  resume_point?: { fully_played: boolean; resume_position_ms: number };
  show?: Show;
  type: 'episode';
}

export interface Playlist {
  id: string;
  name: string;
  uri: string;
  images: Image[];
  description: string;
  owner: { id: string; display_name?: string };
  /**
   * How many entries the playlist holds — under whichever name the response
   * happens to use. February 2026 renamed the contents of a playlist from
   * "tracks" to "items" (that is why the endpoint is `/playlists/{id}/items`),
   * and the summary object that carries the count moved with it. Which of the
   * two a given response carries is not something a screen should have to know,
   * so both are optional and both are read through `playlistItemCount`.
   *
   * Either may also be absent altogether: a count is a fact to look up, never
   * one to assume, because assuming means telling a kid a full playlist has no
   * songs in it.
   */
  items?: { total: number };
  tracks?: { total: number };
}

export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
}

/**
 * What the current item is being played *from* — the playlist, album or show a
 * track arrived in.
 *
 * `type` is a bare string on purpose. Spotify documents four values but has
 * added more before, and an unrecognised one has to fall through to the item
 * rather than fail a check: recording nothing is fine, recording the wrong tile
 * is not.
 */
export interface PlaybackContext {
  uri: string;
  type: string;
  href?: string;
}

/**
 * Cursor-paged, unlike everything else here: no total and no offset, because
 * the history has no fixed length to count against.
 */
export interface CursorPaged<T> {
  items: T[];
  limit: number;
  next: string | null;
  cursors?: { after?: string; before?: string };
}

/**
 * One entry of Spotify's own listening history.
 *
 * Tracks only — `/me/player/recently-played` has never returned episodes, and
 * there is no `additional_types` to ask it for them. The podcast half of this
 * app's history can only come from what it records itself.
 */
export interface RecentlyPlayedItem {
  track: Track;
  /** ISO 8601. */
  played_at: string;
  context: PlaybackContext | null;
}

export interface PlaylistItem {
  /**
   * The track or episode this entry holds — under whichever name the response
   * uses. February 2026 renamed a playlist's contents from "tracks" to "items"
   * and the wrapper around each entry moved with it, so `item` is what arrives
   * and `track` is the older name the reference still lists as deprecated.
   * Which of the two a given response carries is not something a screen should
   * have to know, so both are optional and both are read through
   * `playlistEntry`.
   *
   * Either may also be null: an entry whose song was removed keeps its place
   * in the playlist, because a position is what starts the right song.
   */
  item?: Track | Episode | null;
  track?: Track | Episode | null;
}

export interface Device {
  id: string | null;
  is_active: boolean;
  is_restricted: boolean;
  is_private_session: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
  supports_volume: boolean;
}

export interface PlaybackState {
  device: Device | null;
  is_playing: boolean;
  progress_ms: number | null;
  shuffle_state: boolean;
  repeat_state: 'off' | 'track' | 'context';
  item: Track | Episode | null;
  currently_playing_type: 'track' | 'episode' | 'ad' | 'unknown';
  /** What the item is playing from. Null when Spotify reports no context. */
  context: PlaybackContext | null;
}

/**
 * The signed-in user, as far as this app cares.
 *
 * Only the fields that need no extra scope: `product`, `country` and `email`
 * are gated behind user-read-private / user-read-email, and adding either scope
 * would mean every stored grant carried a different scope set than new ones.
 * `display_name` can be null on accounts that never set one.
 */
export interface UserProfile {
  id: string;
  display_name: string | null;
  images?: Image[];
}

export interface SearchResults {
  tracks?: Paged<Track>;
  albums?: Paged<Album>;
  artists?: Paged<Artist>;
  playlists?: Paged<Playlist>;
  shows?: Paged<Show>;
  episodes?: Paged<Episode>;
}
