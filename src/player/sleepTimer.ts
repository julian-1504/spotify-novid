/**
 * The sleep timer's rules and storage format.
 *
 * Pure on purpose, like devices/sticky.ts next door: what is worth testing here
 * is a handful of decisions about time, and none of them need a browser.
 * SleepProvider owns the localStorage, the interval and the pause command.
 *
 * Everything takes `now` as an argument rather than reading the clock itself,
 * which is what makes the boundaries below testable at all.
 */

import { t } from '../strings';

/** What the sheet offers, in minutes. */
export const SLEEP_OPTIONS = [15, 30, 45, 60, 90] as const;

export type SleepMinutes = (typeof SLEEP_OPTIONS)[number];

const MINUTE_MS = 60_000;

/** No stored timer can legitimately end further out than the longest option. */
const LONGEST_MS = Math.max(...SLEEP_OPTIONS) * MINUTE_MS;

/**
 * How long after the end a stored timer is still worth acting on.
 *
 * The timer is only a remote control: the music plays on the box, so the pause
 * has to be sent from a page that is still running, and a phone that locks can
 * freeze the tab for the whole countdown. When the app comes back it therefore
 * has to decide whether the deadline it finds is one it slept through by a
 * moment or one from last night.
 *
 * Five minutes covers a reload, a bfcache restore, or a tab that was hidden
 * briefly — the window where sending the pause is still the right answer.
 * Beyond it the timer is forgotten in silence, because a timer set at 22:45 has
 * no business pausing the music a kid deliberately started at eight the next
 * morning: the night already played out, so the pause achieves nothing and only
 * makes the app look broken.
 */
export const STALE_AFTER_MS = 5 * MINUTE_MS;

export interface SleepTimer {
  /** Absolute wall-clock end, ms since epoch. Never a countdown that is ticked
   *  down by hand — a throttled or skipped tick must not stretch the timer. */
  endsAt: number;
  /** What was chosen, so the sheet can tick the row it came from. */
  minutes: SleepMinutes;
}

/** What to do with a stored timer right now. */
export type SleepDecision =
  /** Time is left; keep counting. */
  | 'run'
  /** The end has passed recently enough to still be worth pausing for. */
  | 'expire'
  /** The end is old news. Drop it and send nothing. */
  | 'forget';

const isOption = (value: unknown): value is SleepMinutes =>
  SLEEP_OPTIONS.includes(value as SleepMinutes);

export function startSleep(minutes: SleepMinutes, now: number): SleepTimer {
  return { endsAt: now + minutes * MINUTE_MS, minutes };
}

/** Ms left, floored at zero so callers never have to think about the sign. */
export function remainingMs(timer: SleepTimer, now: number): number {
  return Math.max(0, timer.endsAt - now);
}

export function decide(timer: SleepTimer, now: number): SleepDecision {
  const left = timer.endsAt - now;
  if (left > 0) return 'run';
  return left > -STALE_AFTER_MS ? 'expire' : 'forget';
}

/**
 * Reads the stored timer. Never throws: a corrupted or half-written value has
 * to degrade to "no timer", not to a crash in the now-playing bar.
 *
 * `now` is needed because a deadline further out than the longest option is
 * nonsense — a clock that jumped backwards, or a value from a build that stored
 * something else — and leaving it in place would show a countdown that runs for
 * years.
 */
export function parseSleep(raw: string | null, now: number): SleepTimer | null {
  if (!raw) return null;

  let parsed: Partial<SleepTimer>;
  try {
    parsed = JSON.parse(raw) as Partial<SleepTimer>;
  } catch {
    return null;
  }

  const { endsAt, minutes } = parsed ?? {};
  if (typeof endsAt !== 'number' || !Number.isFinite(endsAt)) return null;
  if (!isOption(minutes)) return null;
  if (endsAt > now + LONGEST_MS) return null;

  return { endsAt, minutes };
}

export function serialiseSleep(timer: SleepTimer): string {
  return JSON.stringify(timer);
}

/**
 * The countdown as a kid reads it.
 *
 * Rounds up, which is the whole point: flooring would turn „45 Minuten" into
 * „noch 44 Min" one second after it was chosen, and it reads as if the app lost
 * a minute on the way. Rounding up means the number shown is always the number
 * that was picked, right up until a minute has genuinely gone.
 */
export function formatRemaining(ms: number): string {
  if (ms < MINUTE_MS) return t.sleep.almost;
  return t.sleep.left(Math.ceil(ms / MINUTE_MS));
}
