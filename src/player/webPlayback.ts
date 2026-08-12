/**
 * Turning this phone into a Spotify Connect device.
 *
 * Why this exists: Spotify classifies podcasts as "mixed media" and withholds
 * them from audio-only Connect devices, so an Echo Dot accepts the command,
 * reports that it is playing, and stays silent. A browser is not an audio-only
 * device, so it gets the podcast — `npm run spike:player` confirmed an episode
 * playing here with position advancing. The box is then reached over Bluetooth
 * rather than over Spotify.
 *
 * Everything downstream of `boot()` is unchanged: the SDK registers as a normal
 * Connect device, so `src/api/player.ts` drives it through the same
 * /me/player/* endpoints as any speaker. Nothing about playEpisode, seeking or
 * the pollers needed to know about this.
 *
 * The cost, and it is real: the SDK is fetched from sdk.scdn.co at runtime and
 * injects a cross-origin iframe, so `npm run check:novideo` — which scans src/
 * and dist/ — cannot see any of it. src/player/domGuard.ts is the compensating
 * layer.
 */

import { SDK_ORIGIN } from '../config';
import { getAccessToken } from '../auth/tokens';

const SCRIPT_URL = `${SDK_ORIGIN}/spotify-player.js`;

/** How long to wait for sdk.scdn.co before giving up and staying Connect-only. */
const LOAD_TIMEOUT_MS = 15_000;
/** How long to wait for the SDK to register itself as a device. */
const READY_TIMEOUT_MS = 20_000;

/** The device name kids see in the picker on their *other* devices. */
const DEVICE_NAME = 'Musik-App';

export type WebPlaybackFailure =
  | 'unsupported'
  | 'auth'
  | 'premium'
  | 'offline'
  | 'timeout';

export class WebPlaybackError extends Error {
  readonly kind: WebPlaybackFailure;
  constructor(kind: WebPlaybackFailure, message: string) {
    super(message);
    this.name = 'WebPlaybackError';
    this.kind = kind;
  }
}

// Minimal shape of the bits of the SDK this module touches. There is no types
// package for it, and declaring only what is used keeps the surface honest.
interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, cb: (payload: never) => void): boolean;
  activateElement?(): Promise<void>;
}

interface SpotifyNamespace {
  Player: new (options: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }) => SpotifyPlayer;
}

declare global {
  interface Window {
    Spotify?: SpotifyNamespace;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

let scriptPromise: Promise<void> | null = null;

/**
 * Injects the SDK script once. Rejects rather than hanging if it never arrives
 * — an offline launch must fall back to Connect-only, not sit on a spinner.
 */
function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      // Let a later attempt retry from scratch rather than caching the failure.
      scriptPromise = null;
      reject(new WebPlaybackError('timeout', `${SCRIPT_URL} did not load`));
    }, LOAD_TIMEOUT_MS);

    window.onSpotifyWebPlaybackSDKReady = () => {
      clearTimeout(timer);
      resolve();
    };

    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onerror = () => {
      clearTimeout(timer);
      scriptPromise = null;
      reject(new WebPlaybackError('offline', `${SCRIPT_URL} could not be fetched`));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

let player: SpotifyPlayer | null = null;
let deviceId: string | null = null;
let bootPromise: Promise<string> | null = null;

/** The live SDK device id, or null when the phone is not a playback device. */
export function selfDeviceId(): string | null {
  return deviceId;
}

/**
 * Starts the SDK and resolves with the device id it registers under.
 *
 * Called lazily — only when a kid actually picks this phone. Booting at startup
 * would put a phantom device in every family member's picker and hold a DRM
 * session open for nothing.
 */
export function boot(onFailure?: (err: WebPlaybackError) => void): Promise<string> {
  if (deviceId) return Promise.resolve(deviceId);
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    await loadScript();
    const Spotify = window.Spotify;
    if (!Spotify) {
      throw new WebPlaybackError('unsupported', 'SDK loaded but window.Spotify is absent');
    }

    const instance = new Spotify.Player({
      name: DEVICE_NAME,
      // Called again whenever the token expires, so it must go through the
      // shared refresh path rather than closing over a token captured at boot.
      getOAuthToken: (cb) => {
        void getAccessToken().then(cb).catch(() => {
          // Leaving the callback unanswered is what the SDK expects on failure;
          // it surfaces as authentication_error below.
        });
      },
      volume: 0.8,
    });
    player = instance;

    // Fatal, one-shot conditions. `playback_error` is deliberately not here:
    // it fires for transient stumbles and must not tear the device down.
    const fatal = (kind: WebPlaybackFailure) => (payload: { message: string }) => {
      onFailure?.(new WebPlaybackError(kind, payload?.message ?? kind));
    };
    instance.addListener('initialization_error', fatal('unsupported') as never);
    instance.addListener('authentication_error', fatal('auth') as never);
    instance.addListener('account_error', fatal('premium') as never);

    const id = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new WebPlaybackError('timeout', 'the SDK never became ready')),
        READY_TIMEOUT_MS,
      );
      instance.addListener('ready', ((payload: { device_id: string }) => {
        clearTimeout(timer);
        resolve(payload.device_id);
      }) as never);
      void instance.connect();
    });

    deviceId = id;
    return id;
  })();

  bootPromise = bootPromise.catch((err: unknown) => {
    // A failed boot must not poison later attempts — the kid may simply have
    // been offline, or tapped before the network came back.
    bootPromise = null;
    player = null;
    throw err;
  });

  return bootPromise;
}

/**
 * Unlocks audio output. iOS produces no sound from playback that was not
 * started by a real user gesture, no matter how many commands succeed — so this
 * must be called synchronously from the tap that selects this phone.
 */
export async function activate(): Promise<void> {
  try {
    await player?.activateElement?.();
  } catch {
    // Best effort. Failing here costs sound on iOS, but throwing would cost the
    // whole device selection.
  }
}

export function teardown(): void {
  player?.disconnect();
  player = null;
  deviceId = null;
  bootPromise = null;
}
