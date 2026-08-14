/** Spotify Connect transport control. These endpoints survived the Feb 2026 cull. */

import { apiRequest } from './client';
import type {
  CursorPaged,
  Device,
  PlaybackState,
  PlayerQueue,
  RecentlyPlayedItem,
} from './types';

export function getPlaybackState(): Promise<PlaybackState | undefined> {
  // additional_types is required or episodes come back mislabelled as tracks
  // for backwards compatibility.
  return apiRequest<PlaybackState | undefined>('/me/player', {
    query: { additional_types: 'track,episode' },
  });
}

/**
 * Spotify's own listening history, used once per account to give the home
 * screen something to show before this app has recorded anything itself.
 *
 * Tracks only, so a fresh install starts music-only until a podcast is played.
 * That is the endpoint, not a bug to fix here.
 *
 * Needs `user-read-recently-played`, which grants older than that scope do not
 * carry — every caller has to treat a 403 as "no history", not as an error.
 */
export const getRecentlyPlayed = (limit = 50) =>
  apiRequest<CursorPaged<RecentlyPlayedItem> | undefined>(
    '/me/player/recently-played',
    { query: { limit } },
  );

export async function getDevices(): Promise<Device[]> {
  const res = await apiRequest<{ devices: Device[] }>('/me/player/devices');
  return res?.devices ?? [];
}

export function transferPlayback(deviceId: string, play = false): Promise<void> {
  return apiRequest('/me/player', {
    method: 'PUT',
    body: { device_ids: [deviceId], play },
  });
}

interface PlayArgs {
  deviceId?: string;
  /** Album, artist or playlist URI. */
  contextUri?: string;
  /** Explicit track/episode URIs. */
  uris?: string[];
  /** Index into the context. */
  offsetPosition?: number;
  /**
   * Which track in the context to start on, named rather than counted.
   *
   * For a playlist whose entries this app is not allowed to read, a position is
   * not something it can know — the songs arrive from the queue, which says
   * what comes next and never where in the playlist it sits. The URI is the
   * handle that works without that knowledge.
   */
  offsetUri?: string;
  positionMs?: number;
}

export function play({
  deviceId,
  contextUri,
  uris,
  offsetPosition,
  offsetUri,
  positionMs,
}: PlayArgs = {}): Promise<void> {
  const body: Record<string, unknown> = {};
  if (contextUri) body.context_uri = contextUri;
  if (uris) body.uris = uris;
  if (offsetPosition !== undefined) body.offset = { position: offsetPosition };
  else if (offsetUri !== undefined) body.offset = { uri: offsetUri };
  if (positionMs !== undefined) body.position_ms = positionMs;

  return apiRequest('/me/player/play', {
    method: 'PUT',
    query: { device_id: deviceId },
    body,
  });
}

/**
 * Podcast playback is the one soft spot in the API: `/me/player/play` documents
 * `uris` as track-only and rejects episode *contexts* outright. Passing an
 * episode URI in `uris` does work in practice, so try that first and fall back
 * to playing the show from the top rather than failing outright.
 */
export async function playEpisode(
  episodeUri: string,
  showUri: string | undefined,
  deviceId: string | undefined,
  positionMs?: number,
): Promise<void> {
  try {
    await play({ deviceId, uris: [episodeUri], positionMs });
  } catch (err) {
    if (!showUri) throw err;
    await play({ deviceId, contextUri: showUri });
  }
}

/**
 * The next twenty things on the active device.
 *
 * Asked bare: no `additional_types`, because unlike `/me/player` this endpoint
 * has always named episodes correctly, and unlike the playlist endpoints it
 * takes no paging. Undefined when nothing is playing — there is no queue then,
 * which is a different thing from an empty one.
 */
export const getQueue = () =>
  apiRequest<PlayerQueue | undefined>('/me/player/queue');

export const pause = (deviceId?: string) =>
  apiRequest('/me/player/pause', { method: 'PUT', query: { device_id: deviceId } });

export const resume = (deviceId?: string) =>
  apiRequest('/me/player/play', { method: 'PUT', query: { device_id: deviceId } });

export const next = (deviceId?: string) =>
  apiRequest('/me/player/next', { method: 'POST', query: { device_id: deviceId } });

export const previous = (deviceId?: string) =>
  apiRequest('/me/player/previous', {
    method: 'POST',
    query: { device_id: deviceId },
  });

export const seek = (positionMs: number, deviceId?: string) =>
  apiRequest('/me/player/seek', {
    method: 'PUT',
    query: { position_ms: Math.round(positionMs), device_id: deviceId },
  });

export const setVolume = (percent: number, deviceId?: string) =>
  apiRequest('/me/player/volume', {
    method: 'PUT',
    query: {
      volume_percent: Math.max(0, Math.min(100, Math.round(percent))),
      device_id: deviceId,
    },
  });

export const setShuffle = (state: boolean, deviceId?: string) =>
  apiRequest('/me/player/shuffle', {
    method: 'PUT',
    query: { state: String(state), device_id: deviceId },
  });

export const setRepeat = (
  state: 'off' | 'track' | 'context',
  deviceId?: string,
) =>
  apiRequest('/me/player/repeat', {
    method: 'PUT',
    query: { state, device_id: deviceId },
  });
