/** Spotify Connect transport control. These endpoints survived the Feb 2026 cull. */

import { apiRequest } from './client';
import type {
  CursorPaged,
  Device,
  PlaybackState,
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
  positionMs?: number;
}

export function play({
  deviceId,
  contextUri,
  uris,
  offsetPosition,
  positionMs,
}: PlayArgs = {}): Promise<void> {
  const body: Record<string, unknown> = {};
  if (contextUri) body.context_uri = contextUri;
  if (uris) body.uris = uris;
  if (offsetPosition !== undefined) body.offset = { position: offsetPosition };
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
