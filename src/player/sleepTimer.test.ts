import { describe, expect, it } from 'vitest';
import { t } from '../strings';
import {
  decide,
  formatRemaining,
  parseSleep,
  remainingMs,
  serialiseSleep,
  SLEEP_OPTIONS,
  startSleep,
  STALE_AFTER_MS,
  type SleepTimer,
} from './sleepTimer';

/** A fixed "now" so every expectation below can be read as a wall clock. */
const NOW = 1_760_000_000_000;
const MINUTE = 60_000;

describe('startSleep', () => {
  it('ends the chosen number of minutes from now', () => {
    expect(startSleep(45, NOW)).toEqual({ endsAt: NOW + 45 * MINUTE, minutes: 45 });
  });

  it('offers the five durations the sheet promises', () => {
    expect(SLEEP_OPTIONS).toEqual([15, 30, 45, 60, 90]);
  });
});

describe('remainingMs', () => {
  it('counts down towards the end', () => {
    const timer = startSleep(15, NOW);
    expect(remainingMs(timer, NOW + 5 * MINUTE)).toBe(10 * MINUTE);
  });

  // The bar renders this straight into a label, so a negative number would show
  // up as „noch -3 Min" for as long as the app took to notice the end.
  it('never goes below zero once the end has passed', () => {
    expect(remainingMs(startSleep(15, NOW), NOW + 60 * MINUTE)).toBe(0);
  });
});

describe('decide', () => {
  const timer: SleepTimer = startSleep(30, NOW);

  it('keeps running while there is time left', () => {
    expect(decide(timer, NOW)).toBe('run');
    expect(decide(timer, timer.endsAt - 1)).toBe('run');
  });

  it('expires the moment the end is reached', () => {
    expect(decide(timer, timer.endsAt)).toBe('expire');
  });

  /*
   * The case this whole rule exists for: the phone locked, the tab froze, and
   * the app is only now finding out that the end went past. Just inside the
   * window it still pauses — that is a reload or a tab that was hidden for a
   * moment, and the music is very likely still playing.
   */
  it('still pauses for an end that has only just gone by', () => {
    expect(decide(timer, timer.endsAt + STALE_AFTER_MS - 1)).toBe('expire');
  });

  /*
   * And the case that must not pause: a timer from last night, found again
   * when the kid opens the app in the morning and starts something new.
   * Pausing then would stop music nobody asked it to stop.
   */
  it('forgets an end that is old news', () => {
    expect(decide(timer, timer.endsAt + STALE_AFTER_MS)).toBe('forget');
    expect(decide(timer, timer.endsAt + 10 * 60 * MINUTE)).toBe('forget');
  });
});

describe('parseSleep', () => {
  it('reads back what it wrote', () => {
    const timer = startSleep(60, NOW);
    expect(parseSleep(serialiseSleep(timer), NOW)).toEqual(timer);
  });

  it('has no timer when nothing is stored', () => {
    expect(parseSleep(null, NOW)).toBeNull();
    expect(parseSleep('', NOW)).toBeNull();
  });

  // Anything unreadable has to degrade to "no timer": this value is read while
  // the now-playing bar renders, and throwing there takes the whole app down.
  it('survives a value that is not JSON at all', () => {
    expect(parseSleep('@self', NOW)).toBeNull();
    expect(parseSleep('{"endsAt":', NOW)).toBeNull();
  });

  it('refuses an end that is missing or not a number', () => {
    expect(parseSleep('{"minutes":30}', NOW)).toBeNull();
    expect(parseSleep('{"endsAt":"soon","minutes":30}', NOW)).toBeNull();
    expect(parseSleep('{"endsAt":null,"minutes":30}', NOW)).toBeNull();
  });

  // The sheet ticks the row matching `minutes`, so a duration that is not on
  // offer would leave a running timer with no row to point at.
  it('refuses a duration the sheet does not offer', () => {
    expect(parseSleep(`{"endsAt":${NOW + MINUTE},"minutes":20}`, NOW)).toBeNull();
    expect(parseSleep(`{"endsAt":${NOW + MINUTE}}`, NOW)).toBeNull();
  });

  /*
   * A clock that jumped backwards, or a corrupted write. Kept out because the
   * bar would otherwise show a countdown running for years, and there would be
   * no way to tell it is wrong other than waiting.
   */
  it('refuses an end further out than the longest timer could reach', () => {
    const absurd = NOW + 400 * MINUTE;
    expect(parseSleep(`{"endsAt":${absurd},"minutes":90}`, NOW)).toBeNull();
  });

  // An end that has already gone by is *not* rejected here: deciding what to do
  // about it — pause or forget — is `decide`'s job, and it needs the timer.
  it('keeps a timer whose end has already passed', () => {
    const past = { endsAt: NOW - MINUTE, minutes: 15 } as const;
    expect(parseSleep(JSON.stringify(past), NOW)).toEqual(past);
  });
});

describe('formatRemaining', () => {
  /*
   * The bug this rounding exists for: „45 Minuten" chosen, and a second later
   * the bar reads „noch 44 Min". Nothing was lost, but it looks exactly as if
   * something was.
   */
  it('still says 45 a second after 45 was chosen', () => {
    expect(formatRemaining(45 * MINUTE)).toBe(t.sleep.left(45));
    expect(formatRemaining(45 * MINUTE - 1000)).toBe(t.sleep.left(45));
  });

  it('drops to the next number only once a full minute has gone', () => {
    expect(formatRemaining(44 * MINUTE)).toBe(t.sleep.left(44));
  });

  it('says one minute rather than counting seconds', () => {
    expect(formatRemaining(MINUTE)).toBe(t.sleep.left(1));
  });

  // „noch 0 Min" reads like the timer is stuck, so the last minute is worded.
  it('stops naming a number in the last minute', () => {
    expect(formatRemaining(MINUTE - 1)).toBe(t.sleep.almost);
    expect(formatRemaining(0)).toBe(t.sleep.almost);
  });
});
