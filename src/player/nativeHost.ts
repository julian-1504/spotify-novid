/**
 * The Android wrapper's media notification, seen from the page.
 *
 * Shaped like `mediaSession.ts` next door, because it solves the same problem
 * one layer further out: something outside the page has to say what is playing
 * and offer buttons for it. `navigator.mediaSession` does that in a browser; it
 * does not reach the system from inside a WebView, which is where the app runs
 * on the phones this was built for.
 *
 * The bridge is only there in the wrapper (`PlaybackBridge.kt` injects it as
 * `window.Klangkiste`), so every function here is a no-op in a plain browser and
 * the web app is unchanged by its absence.
 *
 * This exists for more than a pretty notification. The service behind the bridge
 * is what keeps Android from freezing the app once the screen is off — without
 * it the Web Playback SDK, which lives in this page, was gone by the end of the
 * track and a kid had to press play for every song. So publishing is not
 * decoration: it is how the music survives a locked phone.
 */

import type { MediaSessionHandlers } from './mediaSession';
import type { SelfState } from './webPlayback';

/** Exactly what `PlaybackBridge.publish` parses on the other side. */
export interface HostSnapshot {
  playing: boolean;
  title: string;
  artist: string;
  artworkUrl?: string;
  durationMs: number;
  positionMs: number;
}

interface HostBridge {
  publish(json: string): void;
  stopped(): void;
  /** `HostStatus` as JSON. Absent in a wrapper older than this method. */
  status?(): string;
  /** Opens Android's notification settings for this app. */
  openNotificationSettings?(): void;
}

/**
 * What the wrapper says about itself, for the panel on /konto.
 *
 * Every field is optional and the whole thing is `unknown` until checked: this
 * crosses a version boundary — the page is deployed on its own and an older APK
 * may answer with fewer fields, or with nothing at all.
 */
export interface HostStatus {
  /** The host of the page currently loaded, and whether the bridge accepts it. */
  pageHost?: string;
  trusted?: boolean;
  /** Whether a PlaybackService exists, and whether it reached the foreground. */
  serviceRunning?: boolean;
  foregrounded?: boolean;
  /** False when Android is suppressing the notification, whatever the service does. */
  notificationsEnabled?: boolean;
  /** 0 means the channel itself was switched off. */
  channelImportance?: number;
  publishCount?: number;
  lastPublishAgoMs?: number;
  /** The last thing that was swallowed, and where. Absent when nothing was. */
  lastError?: string;
  androidSdk?: number;
}

declare global {
  interface Window {
    /** Injected by the Android wrapper. Absent in every browser. */
    Klangkiste?: HostBridge;
    /** Installed by [bindHostCommands] for the wrapper to call back into. */
    __klangkiste?: { command: (name: string, value?: number) => void };
  }
}

const bridge = (): HostBridge | undefined =>
  typeof window === 'undefined' ? undefined : window.Klangkiste;

/** True inside the Android app, false in a browser. */
export const inWrapper = (): boolean => !!bridge();

/**
 * What the notification should show, from what the SDK last reported.
 *
 * Null in, null out — but a null here means only "the SDK has nothing to report
 * right now", which is what it says at every track boundary. It is *not* the end
 * of anything: see [idleFrom] for what a caller does with it, and [hostStopped]
 * for the one thing that does take the notification away.
 */
export function snapshotOfSelf(state: SelfState | null): HostSnapshot | null {
  if (!state) return null;
  return {
    playing: !state.paused,
    title: state.title,
    artist: state.artist,
    artworkUrl: state.artworkUrl,
    durationMs: state.durationMs,
    positionMs: state.positionMs,
  };
}

/**
 * What to publish while this phone is still the player but the SDK has nothing
 * to report.
 *
 * The SDK sends a null state more often than "playback has ended": at a track
 * boundary, and whenever this device is briefly not the active one. Treating
 * every one of those as the end used to stop the foreground service — at
 * exactly the moment it exists to survive, and with the app hidden, which is
 * when Android refuses to let it start again. So a null keeps the service up
 * and says the music is paused instead.
 *
 * The last song's title and cover are carried over so the notification does not
 * blank out mid-transition. With no song yet, the blank title lands on the
 * wrapper's own „Klangkiste" fallback.
 */
export function idleFrom(last: HostSnapshot | null): HostSnapshot {
  if (last) return { ...last, playing: false };
  return { playing: false, title: '', artist: '', durationMs: 0, positionMs: 0 };
}

/** Sends the snapshot across, or takes the notification down when there is none. */
export function publishToHost(snapshot: HostSnapshot | null): void {
  const host = bridge();
  if (!host) return;

  try {
    if (snapshot) host.publish(JSON.stringify(snapshot));
    else host.stopped();
  } catch {
    // The bridge is a nicety on top of playback that is already running. An
    // older wrapper missing a method must not take the music with it.
  }
}

/**
 * This phone is not the box any more — take the notification down.
 *
 * Emphatically not for "nothing is playing right now": that is [idleFrom], and
 * confusing the two is the bug this seam was built wrong around the first time.
 * Two callers only, both deliberate: another box being chosen, and the DOM guard
 * tripping.
 */
export const hostStopped = (): void => publishToHost(null);

/**
 * Wires the notification's buttons to the same commands the lock screen and the
 * app's own bar use. Returns a function that unwires them.
 */
export function bindHostCommands(handlers: MediaSessionHandlers): () => void {
  if (!inWrapper()) return () => {};

  window.__klangkiste = {
    command: (name, value) => {
      switch (name) {
        case 'play':
          handlers.play();
          break;
        case 'pause':
          handlers.pause();
          break;
        case 'next':
          handlers.next();
          break;
        case 'previous':
          handlers.previous();
          break;
        case 'seek':
          if (value !== undefined) handlers.seek(value);
          break;
      }
    },
  };

  return () => {
    delete window.__klangkiste;
  };
}

/**
 * What the wrapper makes of its own playback plumbing, or null in a browser.
 *
 * This exists because the phones this runs on are not attached to a laptop.
 * Every link in the chain — the trust gate, the bridge, the service, the
 * notification permission — fails silently by design, so without a way to ask,
 * „es geht nicht" is the whole of the diagnosis. The panel on /konto asks.
 *
 * Null for three different reasons, all treated the same: not in the wrapper,
 * an APK too old to have the method, or an answer that would not parse.
 */
export function hostStatus(): HostStatus | null {
  const host = bridge();
  if (!host?.status) return null;

  try {
    const parsed: unknown = JSON.parse(host.status());
    return typeof parsed === 'object' && parsed !== null ? (parsed as HostStatus) : null;
  } catch {
    return null;
  }
}

/**
 * Sends the adult to Android's notification settings for this app.
 *
 * The way back from a refusal, and on a phone where the dialog has already been
 * dismissed twice the *only* way: Android stops showing it after that, so
 * asking again from the app is a silent no-op for ever.
 */
export function openHostNotificationSettings(): void {
  try {
    bridge()?.openNotificationSettings?.();
  } catch {
    // Same reasoning as publishToHost: an older wrapper missing the method must
    // cost nothing more than the button doing nothing.
  }
}
