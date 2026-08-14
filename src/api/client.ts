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

/**
 * The refusal that means „this is not yours to read", as opposed to „this
 * account is not Premium".
 *
 * `PremiumRequiredError` extends `ApiError` with the same 403, so a bare status
 * check reads a free account as a permissions problem — and every caller of
 * this asks in order to try something *else* instead, which for a free account
 * would fail exactly the same way. The `instanceof` exclusion is the whole
 * point of the function and the reason it is not written inline.
 */
export const isForbidden = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.status === 403 &&
  !(error instanceof PremiumRequiredError);

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
  /** Internal: how many 202s this request has already sat through. */
  accepted?: number;
}

/**
 * Spotify answers player commands with 202 when it has taken the command but
 * the target device has not acted on it yet — a speaker that is still waking.
 * Treating that as success is how the app ends up claiming music is playing
 * while the room stays silent, so wait and ask again.
 */
const ACCEPTED_RETRIES = 3;
const ACCEPTED_WAIT_MS = 1000;

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, query, retrying = false, accepted = 0 } = options;

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

  // "Accepted, but nothing has happened yet." Give the device a moment and ask
  // again rather than reporting a command that may never take effect.
  if (res.status === 202) {
    if (accepted >= ACCEPTED_RETRIES) {
      throw new ApiError(202, 'The speaker did not answer the command.');
    }
    await new Promise((resolve) => setTimeout(resolve, ACCEPTED_WAIT_MS));
    return apiRequest<T>(path, { ...options, accepted: accepted + 1 });
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
