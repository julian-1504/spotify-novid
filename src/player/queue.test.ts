import { describe, expect, it } from 'vitest';
import { skipTarget, upcomingIn } from './queue';
import type { Episode, PlaybackState, PlayerQueue, Track } from '../api/types';

const song = (id: string) =>
  ({ id, name: id, uri: `spotify:track:${id}`, type: 'track' }) as unknown as Track;

const episode = (id: string) =>
  ({
    id,
    name: id,
    uri: `spotify:episode:${id}`,
    type: 'episode',
  }) as unknown as Episode;

const playing = (contextUri: string | null): PlaybackState =>
  ({
    context: contextUri ? { uri: contextUri, type: 'playlist' } : null,
  }) as unknown as PlaybackState;

const queue = (items: (Track | Episode)[]): PlayerQueue =>
  ({ currently_playing: null, queue: items }) as PlayerQueue;

const PLAYLIST = 'spotify:playlist:p1';

describe('upcomingIn', () => {
  it('lists what comes next in the playlist that is playing', () => {
    const next = upcomingIn(PLAYLIST, playing(PLAYLIST), queue([song('a'), song('b')]));

    expect(next.map((s) => s.id)).toEqual(['a', 'b']);
  });

  /**
   * The guard, and the reason this is a function rather than a line in a
   * component. There is one queue per account and it answers about whatever is
   * playing — so a kid who starts one playlist and then opens another would see
   * the first playlist's songs listed under the second one's name.
   */
  it('says nothing about a playlist that is not the one playing', () => {
    const next = upcomingIn(PLAYLIST, playing('spotify:playlist:other'), queue([song('a')]));

    expect(next).toEqual([]);
  });

  it('says nothing when nothing is playing at all', () => {
    expect(upcomingIn(PLAYLIST, undefined, queue([song('a')]))).toEqual([]);
    expect(upcomingIn(PLAYLIST, playing(null), queue([song('a')]))).toEqual([]);
  });

  /** Nothing playing and nothing queued are the same answer here, not an error. */
  it('says nothing when the queue has not arrived', () => {
    expect(upcomingIn(PLAYLIST, playing(PLAYLIST), undefined)).toEqual([]);
    expect(upcomingIn(PLAYLIST, playing(PLAYLIST), queue([]))).toEqual([]);
  });

  // A row is tappable because it has a uri to play. One without is a row that
  // would do nothing when a kid presses it.
  it('drops anything a tap could not play', () => {
    const broken = { id: 'x', name: 'x', type: 'track' } as unknown as Track;
    const next = upcomingIn(PLAYLIST, playing(PLAYLIST), queue([broken, song('a')]));

    expect(next.map((s) => s.id)).toEqual(['a']);
  });
});

/**
 * The jump that walks a playlist twenty songs at a time — the only way through
 * one the app is not allowed to list.
 */
describe('skipTarget', () => {
  it('takes the last song on screen', () => {
    expect(skipTarget([song('a'), song('b'), song('c')])?.id).toBe('c');
  });

  it('takes the only song when that is all there is', () => {
    expect(skipTarget([song('a')])?.id).toBe('a');
  });

  it('has nothing to skip to in an empty list', () => {
    expect(skipTarget([])).toBeUndefined();
  });

  /**
   * The reason this is not simply „the last one". A playlist cannot be started
   * at an episode — the API refuses episode URIs as a context — so the jump
   * aims at the last thing it can actually land on.
   */
  it('skips back past an episode at the end to the last song', () => {
    expect(skipTarget([song('a'), song('b'), episode('e1')])?.id).toBe('b');
  });

  it('has nothing to skip to when nothing coming is a song', () => {
    expect(skipTarget([episode('e1'), episode('e2')])).toBeUndefined();
  });
});
