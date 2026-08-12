import { describe, expect, it } from 'vitest';
import {
  FORGET_AFTER_MISSES,
  isSelfSentinel,
  parseRemembered,
  SELF_DEVICE_SENTINEL,
  serialiseRemembered,
  trackAbsence,
} from './sticky';

describe('trackAbsence', () => {
  // The bug this rule exists for: an idle Echo Dot vanishes from
  // /me/player/devices for a poll or two, and the app used to forget the
  // speaker the user had deliberately chosen on the very first miss.
  it('keeps the speaker through a single missing poll', () => {
    expect(trackAbsence(0, false)).toEqual({ streak: 1, forget: false });
  });

  it('keeps it through a second missing poll', () => {
    expect(trackAbsence(1, false)).toEqual({ streak: 2, forget: false });
  });

  it('forgets on the third consecutive miss', () => {
    expect(trackAbsence(2, false)).toEqual({ streak: 0, forget: true });
  });

  it('resets the moment the speaker comes back', () => {
    expect(trackAbsence(2, true)).toEqual({ streak: 0, forget: false });
  });

  // Two misses, a reappearance, then two more must not add up to a forget.
  it('needs the misses to be consecutive', () => {
    let streak = 0;
    let forgotten = false;
    for (const present of [false, false, true, false, false]) {
      const result = trackAbsence(streak, present);
      streak = result.streak;
      forgotten ||= result.forget;
    }
    expect(forgotten).toBe(false);
  });

  it('does forget once the misses do line up', () => {
    let streak = 0;
    let forgotten = false;
    for (let i = 0; i < FORGET_AFTER_MISSES; i++) {
      const result = trackAbsence(streak, false);
      streak = result.streak;
      forgotten ||= result.forget;
    }
    expect(forgotten).toBe(true);
  });
});

describe('parseRemembered', () => {
  it('round-trips a stored choice', () => {
    const device = { id: 'abc_amzn_1', name: 'Küche Echo Dot' };
    expect(parseRemembered(serialiseRemembered(device))).toEqual(device);
  });

  it('treats a bare id from an older build as a choice, not as junk', () => {
    expect(parseRemembered('abc_amzn_1')).toEqual({
      id: 'abc_amzn_1',
      name: '',
    });
  });

  it('has no opinion when nothing is stored', () => {
    expect(parseRemembered(null)).toBeNull();
    expect(parseRemembered('')).toBeNull();
  });

  it('rejects JSON that carries no usable id', () => {
    expect(parseRemembered('{"name":"Küche"}')).toBeNull();
    expect(parseRemembered('{"id":""}')).toBeNull();
  });

  /**
   * The Web Playback SDK mints a new device id every session. Storing the live
   * id would remember something that can never reappear, so trackAbsence would
   * forget the choice ~30s into every launch — the kid's box "forgetting
   * itself" each time they open the app.
   */
  it('round-trips the self sentinel like any other choice', () => {
    const stored = serialiseRemembered({
      id: SELF_DEVICE_SENTINEL,
      name: 'Dieses Handy',
    });
    expect(parseRemembered(stored)).toEqual({
      id: SELF_DEVICE_SENTINEL,
      name: 'Dieses Handy',
    });
  });

  it('recognises the sentinel and nothing else', () => {
    expect(isSelfSentinel(SELF_DEVICE_SENTINEL)).toBe(true);
    expect(isSelfSentinel('abc_amzn_1')).toBe(false);
    expect(isSelfSentinel('')).toBe(false);
    expect(isSelfSentinel(null)).toBe(false);
    expect(isSelfSentinel(undefined)).toBe(false);
  });

  // It has to be something Spotify would never issue, or a real box could
  // collide with it and inherit the phone's behaviour.
  it('uses a sentinel that cannot be mistaken for a Spotify device id', () => {
    expect(SELF_DEVICE_SENTINEL).toMatch(/^@/);
    expect(SELF_DEVICE_SENTINEL).not.toMatch(/^[0-9a-f]+$/i);
  });
});
