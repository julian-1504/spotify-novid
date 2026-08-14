import { describe, expect, it } from 'vitest';
import { listState, type ListQuery } from './ListStatus';
import { ApiError, PremiumRequiredError } from '../api/client';

const query = (over: Partial<ListQuery> = {}): ListQuery => ({
  isPending: false,
  isPaused: false,
  error: null,
  ...over,
});

const loading = query({ isPending: true });
const paused = query({ isPending: true, isPaused: true });
const failed = query({ error: new Error('Invalid limit') });
const refused = query({ error: new ApiError(403, 'Insufficient client scope') });
const fine = query();

describe('listState', () => {
  /**
   * The bug this exists to prevent. The artist screen asked for fifty albums
   * from an endpoint that refuses anything over ten, got a 400, and drew a
   * heading over blank space — because nothing ever asked whether the list was
   * empty or merely broken.
   */
  it('calls a failed list failed, not empty', () => {
    expect(listState(failed, 0)).toBe('error');
  });

  /**
   * The second half of the same bug, and the subtler half. React Query pauses a
   * query it cannot retry — a lost connection, a retry still waiting its turn —
   * leaving it pending while *not* fetching. Asked about `isLoading` that state
   * answers false, and a playlist nobody could load announced itself as empty.
   */
  it('never calls a paused list empty', () => {
    expect(listState(paused, 0)).toBe('offline');
  });

  /**
   * A list that has not arrived yet is not an empty one either. Said out loud
   * because this is the state a slow connection spends the longest in, and
   * „nichts gefunden" that turns into a full list a second later is the version
   * a kid stops trusting.
   */
  it('calls a list that has not arrived loading, not empty', () => {
    expect(listState(loading, 0)).toBe('loading');
  });

  /** A real failure outranks the guess that the connection is at fault. */
  it('prefers a real error to a paused retry', () => {
    expect(listState(query({ isPaused: true, error: new Error('x') }), 0)).toBe(
      'error',
    );
  });

  /**
   * Paging: the first page landed, the second failed. The rows already on
   * screen keep rendering, and the message underneath them is still about the
   * failure — the list genuinely did stop part-way.
   */
  it('reports an error even once some rows are showing', () => {
    expect(listState(failed, 12)).toBe('error');
  });

  it('calls a genuinely empty list empty', () => {
    expect(listState(fine, 0)).toBe('empty');
  });

  it('says nothing about a list that has rows', () => {
    expect(listState(fine, 1)).toBe('ready');
  });

  /**
   * A playlist somebody else made, whose songs Spotify will not hand over. That
   * is not a fault to report as one: „hat nicht geklappt" sends a parent looking
   * for a problem that is not there, when the honest answer is that this list is
   * not ours to read.
   */
  it('calls a refusal a refusal, not a general failure', () => {
    expect(listState(refused, 0)).toBe('forbidden');
  });

  /** Same status, different answer — a free account is not a permissions problem. */
  it('still calls the Premium refusal a general failure', () => {
    expect(listState(query({ error: new PremiumRequiredError() }), 0)).toBe(
      'error',
    );
  });

  /**
   * Every no-rows state must answer something other than „ready", or the screen
   * shows a blank space with no explanation — which is where this started.
   */
  it('always has something to say when there are no rows', () => {
    for (const list of [loading, paused, failed, refused, fine]) {
      expect(listState(list, 0)).not.toBe('ready');
    }
  });
});
