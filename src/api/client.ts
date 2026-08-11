/**
 * Single choke point for every Spotify Web API call.
 *
 * Centralising 401-refresh-retry and 429 backoff here means no screen has to
 * think about either.
 */

import {
  AuthExpiredError,
  getAccessToken,
  refreshAccessToken,
} from '../auth/tokens';

const API_BASE = 'https://api.spotify.com/v1';

export class ApiError extends Error {
  // Declared explicitly rather than as a constructor parameter property, which
  // this project's `erasableSyntaxOnly` setting disallows.
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Raised when the account is not Premium — playback control is Premium-only. */
export class PremiumRequiredError extends ApiError {
  constructor() {
    super(403, 'Spotify Premium is required to control playback.');
    this.name = 'PremiumRequiredError';
  }
}

/** Set by the app so the client can drop the session on a dead grant. */
let onAuthExpired: (() => void) | null = null;
export function setAuthExpiredHandler(fn: () => void): void {
  onAuthExpired = fn;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Internal: prevents infinite refresh loops. */
  retrying?: boolean;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, query, retrying = false } = options;

  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    if (err instanceof AuthExpiredError) onAuthExpired?.();
    throw err;
  }

  const url = new URL(API_BASE + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // The access token can be rejected even when we thought it was fresh (e.g.
  // revoked server-side). Force one refresh and retry exactly once.
  if (res.status === 401 && !retrying) {
    try {
      await refreshAccessToken();
    } catch (err) {
      if (err instanceof AuthExpiredError) onAuthExpired?.();
      throw err;
    }
    return apiRequest<T>(path, { ...options, retrying: true });
  }

  if (res.status === 429) {
    const wait = Number(res.headers.get('Retry-After') ?? '1');
    await new Promise((resolve) => setTimeout(resolve, (wait + 0.5) * 1000));
    return apiRequest<T>(path, options);
  }

  if (res.status === 403) {
    const text = await res.text();
    if (/premium/i.test(text)) throw new PremiumRequiredError();
    throw new ApiError(403, text || 'Spotify refused this request.');
  }

  // Player commands answer 204 with no body; so does a device with nothing
  // playing on GET /me/player.
  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    let message = `Spotify request failed (${res.status})`;
    try {
      const parsed = (await res.json()) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiError(res.status, message);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
