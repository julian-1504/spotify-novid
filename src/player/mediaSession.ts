/**
 * Lock-screen and headset controls.
 *
 * `npm run spike:player` reported `metadataSetBySdk: false` — the Web Playback
 * SDK does not populate navigator.mediaSession itself, so the app has to.
 *
 * This is not decoration. Once the phone is the player and a Bluetooth box is
 * the speaker, the box's own buttons do nothing and the phone is in a pocket:
 * the lock screen is the only transport a kid has. It is also what keeps the
 * OS from treating the tab as idle audio when the screen goes off.
 */

import type { Episode, PlaybackState, Track } from '../api/types';

export interface MediaSessionHandlers {
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (positionMs: number) => void;
}

const supported = (): boolean =>
  typeof navigator !== 'undefined' && 'mediaSession' in navigator;

function artworkFor(item: Track | Episode): MediaImage[] {
  const images = item.type === 'episode' ? item.images : item.album?.images;
  return (images ?? [])
    .filter((i) => !!i.url)
    .map((i) => ({
      src: i.url,
      sizes: i.width && i.height ? `${i.width}x${i.height}` : undefined,
    }));
}

/** Mirrors the polled playback state onto the lock screen. */
export function publishMetadata(state: PlaybackState | undefined): void {
  if (!supported()) return;

  const item = state?.item;
  if (!item) {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
    return;
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: item.name,
    // A podcast's show is the useful second line; a track's is its artists.
    artist:
      item.type === 'episode'
        ? (item.show?.name ?? 'Podcast')
        : (item.artists?.map((a) => a.name).join(', ') ?? ''),
    album: item.type === 'episode' ? undefined : item.album?.name,
    artwork: artworkFor(item),
  });

  navigator.mediaSession.playbackState = state?.is_playing ? 'playing' : 'paused';

  // Lets the lock screen draw a real scrubber rather than a bare title.
  // Guarded because a duration of 0 or a position past the end throws.
  try {
    const duration = (item.duration_ms ?? 0) / 1000;
    const position = (state?.progress_ms ?? 0) / 1000;
    if (duration > 0 && position <= duration) {
      navigator.mediaSession.setPositionState({ duration, position, playbackRate: 1 });
    }
  } catch {
    // Position state is a nicety; never let it break the metadata above.
  }
}

/** Wires the hardware buttons. Returns a function that unwires them. */
export function bindHandlers(handlers: MediaSessionHandlers): () => void {
  if (!supported()) return () => {};

  const entries: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => handlers.play()],
    ['pause', () => handlers.pause()],
    ['nexttrack', () => handlers.next()],
    ['previoustrack', () => handlers.previous()],
    [
      'seekto',
      (details) => {
        if (details.seekTime !== undefined) handlers.seek(details.seekTime * 1000);
      },
    ],
  ];

  for (const [action, handler] of entries) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Browsers reject actions they do not implement; the rest still bind.
    }
  }

  return () => {
    for (const [action] of entries) {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch {
        // Nothing to undo if it never bound.
      }
    }
  };
}
