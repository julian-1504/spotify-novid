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
 * Null in, null out: no state and no track are both "nothing is playing here",
 * which is the one case that must take the notification away rather than freeze
 * it on a song that ended.
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

/** Nothing is playing on this phone any more. */
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
