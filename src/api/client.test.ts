import { describe, expect, it } from 'vitest';
import { ApiError, PremiumRequiredError, isForbidden } from './client';

/**
 * The 403 that means „not yours to read", told apart from the 403 that means
 * „not Premium".
 *
 * Every caller asks this in order to try something *else* instead — the
 * playlist screen falls back to reading the songs off the playlist object. For
 * a free account that fallback would fail exactly the same way, so mistaking
 * the one refusal for the other buys a second failure and a confusing message
 * in place of the true one.
 */
describe('isForbidden', () => {
  it('recognises the refusal that means „not your playlist"', () => {
    expect(isForbidden(new ApiError(403, 'Insufficient client scope'))).toBe(true);
  });

  // The one that will silently rot: PremiumRequiredError extends ApiError with
  // the same status, so a bare `status === 403` reads true here.
  it('never mistakes the Premium refusal for it', () => {
    expect(isForbidden(new PremiumRequiredError())).toBe(false);
  });

  it('says no to every other status', () => {
    expect(isForbidden(new ApiError(404, 'Not found'))).toBe(false);
    expect(isForbidden(new ApiError(429, 'Too many requests'))).toBe(false);
  });

  it('says no to something that never reached Spotify at all', () => {
    expect(isForbidden(new TypeError('Failed to fetch'))).toBe(false);
    expect(isForbidden(undefined)).toBe(false);
  });
});
