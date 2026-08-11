/**
 * Build-time configuration.
 *
 * The device allowlist lives here on purpose rather than in an in-app settings
 * screen: a settings screen would let a kid add the living-room TV back as a
 * playback target. Changing what can be played to requires a rebuild + redeploy.
 */

/** Public client ID from the Spotify developer dashboard. Not a secret. */
export const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '';

/**
 * Must exactly match a redirect URI registered in the dashboard.
 * Spotify requires HTTPS and explicitly bans `localhost`; `127.0.0.1` with a
 * port is the permitted loopback form for local development.
 *
 * Resolved lazily rather than at module load so this module stays importable
 * outside a browser (tests, tooling).
 */
export function redirectUri(): string {
  return `${window.location.origin}/callback`;
}

export const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-read-playback-position',
] as const;

/**
 * Playback targets are filtered allowlist-first: a device whose `type` is not
 * listed here is hidden, so an unrecognised or newly-invented device type fails
 * closed rather than open.
 *
 * Spotify only ever documents 'computer', 'smartphone' and 'speaker', so the
 * real strings must be observed. Run `npm run spike -- <client-id>` against your
 * own account with the speakers switched on and paste the reported types here.
 *
 * Compared case-insensitively, which is load-bearing rather than defensive: a
 * real Chromecast Audio reports `"CastAudio"`, not `"castaudio"`. Keep the
 * entries here lowercase and keep the lowercasing in devices/allowlist.ts.
 */
export const ALLOWED_DEVICE_TYPES: readonly string[] = [
  'speaker',
  'castaudio',
  'avr',
];

/**
 * Optional hard pin to specific devices. When non-empty, ONLY these device IDs
 * are selectable — the tightest setting available. The blocked-type check below
 * still applies on top, so a pinned id cannot re-admit a TV by accident.
 */
export const ALLOWED_DEVICE_IDS: readonly string[] = [];

/**
 * Types that must never appear, even if someone widens ALLOWED_DEVICE_TYPES by
 * mistake. Belt and braces: these are the ones that can render video.
 */
export const BLOCKED_DEVICE_TYPES: readonly string[] = [
  'tv',
  'castvideo',
  'stb',
  'game_console',
  'computer',
  'smartphone',
];

/** How often to poll playback state while a screen is visible. */
export const PLAYBACK_POLL_MS = 3000;

/** Spotify capped search at 10 results per page in February 2026. */
export const SEARCH_PAGE_SIZE = 10;
