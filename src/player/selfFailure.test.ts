import { describe, expect, it } from 'vitest';
import { describeFailure } from './selfFailure';
import { HELP_TOPIC_IDS } from '../help/topics';
import type { WebPlaybackFailure } from './webPlayback';

const ALL_KINDS: WebPlaybackFailure[] = [
  'unsupported',
  'auth',
  'premium',
  'offline',
  'timeout',
];

describe('describeFailure', () => {
  /**
   * The rule this whole module exists for. An auth failure is usually not an
   * expired grant at all — it is a grant that predates the `streaming` scope —
   * and a fresh sign-in is what fixes either version of it.
   */
  it('offers a fresh sign-in for an auth failure', () => {
    const failure = describeFailure('auth');
    expect(failure.offerReauth).toBe(true);
    expect(failure.topic).toBe('anmelden');
  });

  /**
   * The rule that keeps a kid out of an unbreakable loop: signing in again
   * cannot buy a Premium subscription, so the button would walk them through
   * the password dance to arrive back at this exact message.
   */
  it('never offers a sign-in for a non-Premium account', () => {
    expect(describeFailure('premium').offerReauth).toBe(false);
  });

  it('never offers a sign-in for a failure the account cannot fix', () => {
    for (const kind of ['offline', 'timeout', 'unsupported'] as const) {
      expect(describeFailure(kind).offerReauth).toBe(false);
    }
  });

  it('sends a network failure to the internet topic, not the phone one', () => {
    expect(describeFailure('offline').topic).toBe('kein-internet');
    expect(describeFailure('timeout').topic).toBe('kein-internet');
  });

  it('gives every kind German text and a real help topic', () => {
    for (const kind of ALL_KINDS) {
      const failure = describeFailure(kind);
      expect(failure.kind).toBe(kind);
      expect(failure.message.length).toBeGreaterThan(0);
      // A dead deep link would strand the kid on the help index. topics.test.ts
      // catches these in source; this catches one built at runtime.
      expect(HELP_TOPIC_IDS).toContain(failure.topic);
    }
  });

  // The old wording claimed the sign-in had expired, which is untrue in the
  // case that actually happens and sends a grown-up hunting the wrong problem.
  it('does not claim the sign-in expired', () => {
    expect(describeFailure('auth').message).not.toMatch(/abgelaufen/i);
  });
});
