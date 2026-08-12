/**
 * Remembering which box was chosen, and when to stop believing in it.
 *
 * Pure on purpose, like the allowlist next door: the interesting behaviour here
 * is a counting rule and a storage format, and both are worth testing without a
 * browser. PlayerProvider owns the localStorage and React wiring.
 */

/**
 * How many consecutive device polls may miss the chosen speaker before the app
 * gives up on it.
 *
 * Not one. Echo Dots drop off `/me/player/devices` for a poll or two whenever
 * they idle, and forgetting on the first miss meant a speaker the user had
 * deliberately picked was silently swapped for whatever Spotify happened to
 * call active — which is how audio ends up aimed at a device nobody chose. At
 * the 10s device refetch this is about 30s of genuine absence.
 */
export const FORGET_AFTER_MISSES = 3;

/** The chosen speaker. The name is kept so the UI can name a box that is off. */
export interface RememberedDevice {
  id: string;
  name: string;
}

export interface AbsenceResult {
  /** The streak to carry into the next poll. */
  streak: number;
  /** True when the speaker has been gone long enough to forget. */
  forget: boolean;
}

/**
 * Advances the missing-poll counter. `present` is whether the remembered
 * speaker appeared in the device list this poll.
 */
export function trackAbsence(streak: number, present: boolean): AbsenceResult {
  if (present) return { streak: 0, forget: false };

  const next = streak + 1;
  // Reset on the way out so a re-picked device starts from a clean count.
  return next >= FORGET_AFTER_MISSES
    ? { streak: 0, forget: true }
    : { streak: next, forget: false };
}

/**
 * Reads the stored choice. Older builds wrote the bare device id, so a value
 * that is not JSON is treated as one rather than throwing the choice away.
 */
export function parseRemembered(raw: string | null): RememberedDevice | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RememberedDevice>;
    if (typeof parsed?.id !== 'string' || !parsed.id) return null;
    return { id: parsed.id, name: parsed.name ?? '' };
  } catch {
    return { id: raw, name: '' };
  }
}

export function serialiseRemembered(device: RememberedDevice): string {
  return JSON.stringify(device);
}
