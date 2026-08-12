/**
 * Turns Spotify's English API errors into something a kid can act on.
 *
 * Raw messages like "Player command failed: No active device found" would
 * otherwise reach the UI verbatim. Each mapping carries the help topic that
 * explains the fix, so an error can offer a direct link instead of a dead end.
 */

import { ApiError, PremiumRequiredError } from './api/client';
import type { HelpTopicId } from './help/topics';
import { t } from './strings';

export interface FriendlyError {
  message: string;
  topic?: HelpTopicId;
}

export function toFriendlyError(error: unknown): FriendlyError {
  if (!navigator.onLine) {
    return { message: t.errors.offline, topic: 'kein-internet' };
  }

  if (error instanceof PremiumRequiredError) {
    return { message: t.errors.premium };
  }

  if (error instanceof ApiError) {
    const raw = error.message.toLowerCase();

    // Spotify answers 404 NO_ACTIVE_DEVICE when the target speaker went away
    // between the device list refreshing and the command being sent.
    if (error.status === 404 || raw.includes('no active device')) {
      return { message: t.errors.noDevice, topic: 'keine-box' };
    }
    // The speaker was there and took the command, but never acted on it. That
    // is a sound problem, not a missing-box problem.
    if (error.status === 202) {
      return { message: t.errors.restricted, topic: 'kein-ton' };
    }
    if (raw.includes('restriction')) {
      return { message: t.errors.restricted, topic: 'kein-ton' };
    }
  }

  return { message: t.errors.generic };
}
