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

/**
 * `streaming` (with the two `user-read-*` scopes the SDK requires alongside it)
 * is what lets this phone become a playback device itself — the only way to get
 * podcasts onto a box that refuses them over Connect.
 *
 * Adding it invalidates every existing grant: a refresh token does not carry a
 * scope that was not asked for originally, so all five accounts have to sign in
 * once more. That is the „Frag bitte einen Erwachsenen" flow.
 *
 * The exact set is the one `npm run spike:player` proved works. Trimming it
 * needs a re-run, not a guess.
 *
 * Adding one, on the other hand, is not retroactive and invalidates nothing on
 * its own: a stored refresh token keeps the scopes it was granted, and nothing
 * in this app ever compares a grant against this list. An existing account
 * therefore keeps working and merely gets a 403 from whatever endpoint needs
 * the new scope, until somebody happens to re-authorize anyway. That is why
 * `user-read-recently-played` could be added without sending five kids to find
 * a grown-up — the one thing it powers degrades to nothing.
 */
export const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-read-playback-position',
  'user-read-recently-played',
] as const;

/**
 * The one remote origin the app loads code from, and consequently the only
 * iframe the runtime guard tolerates. `npm run spike:player` observed exactly
 * one frame — https://sdk.scdn.co/embedded/index.html, with
 * `allow="encrypted-media; autoplay"` — and no video element at all.
 *
 * Kept here beside the device allowlist because it is the same kind of rule: a
 * build-time decision about what the app may talk to.
 */
export const SDK_ORIGIN = 'https://sdk.scdn.co';

/**
 * The device type the Web Playback SDK registers itself under, lowercased.
 * Observed via `npm run spike:player`, which reported `type = Computer`.
 *
 * The allowlist requires this *as well as* a matching device id before it will
 * admit the phone, so an id that is somehow wrong still cannot let a TV in.
 */
export const SDK_DEVICE_TYPE = 'computer';

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
