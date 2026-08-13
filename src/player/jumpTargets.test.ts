import { describe, expect, it } from 'vitest';
import { jumpTargetsFor } from './jumpTargets';
import type {
  Album,
  Episode,
  PlaybackContext,
  PlaybackState,
  Show,
  Track,
} from '../api/types';

const album = (id: string, name: string): Album => ({
  id,
  name,
  uri: `spotify:album:${id}`,
  images: [],
  artists: [{ id: 'art1', name: 'Bibi und Tina', uri: 'spotify:artist:art1' }],
  release_date: '2014',
  total_tracks: 12,
  album_type: 'album',
});

const show = (id: string, name: string): Show => ({
  id,
  name,
  uri: `spotify:show:${id}`,
  images: [],
  publisher: 'Europa',
  description: '',
  total_episodes: 200,
});

const track = (over: Partial<Track> = {}): Track => ({
  id: 'trk1',
  name: 'Das Lied vom Pferd',
  uri: 'spotify:track:trk1',
  duration_ms: 195_000,
  explicit: false,
  track_number: 3,
  artists: [{ id: 'art1', name: 'Bibi und Tina', uri: 'spotify:artist:art1' }],
  album: album('alb1', 'Bibi und Tina — Der Film'),
  type: 'track',
  ...over,
});

const episode = (over: Partial<Episode> = {}): Episode => ({
  id: 'ep1',
  name: 'Folge 42',
  uri: 'spotify:episode:ep1',
  images: [],
  description: '',
  duration_ms: 1_800_000,
  release_date: '2024-01-01',
  show: show('shw1', 'Die drei ???'),
  type: 'episode',
  ...over,
});

const context = (type: string, uri: string): PlaybackContext => ({ type, uri });

const playing = (
  item: Track | Episode | null,
  ctx: PlaybackContext | null = null,
  over: Partial<PlaybackState> = {},
): PlaybackState => ({
  device: null,
  is_playing: true,
  progress_ms: 1000,
  shuffle_state: false,
  repeat_state: 'off',
  item,
  currently_playing_type: item?.type === 'episode' ? 'episode' : 'track',
  context: ctx,
  ...over,
});

describe('jumpTargetsFor', () => {
  /**
   * The rule the whole feature exists for. A kid who tapped a playlist and is
   * now three songs in wants that playlist back — not the album of whichever
   * song happens to be on, which they never chose and cannot find their way
   * back from.
   */
  it('offers the playlist when a song is playing from one', () => {
    const targets = jumpTargetsFor(
      playing(track(), context('playlist', 'spotify:playlist:pl1')),
    );
    expect(targets[0]).toEqual({ kind: 'playlist', id: 'pl1', name: undefined });
  });

  /**
   * A playlist context carries only a URI, so there is no name to show under
   * the row. An album context normally arrives alongside the track's own album
   * object, so that one does have a name — worth asserting, because it is the
   * difference between a row that reads „Album zeigen · Der Film" and one that
   * reads only „Album zeigen".
   */
  it('names the album when the playing track came from it', () => {
    const targets = jumpTargetsFor(
      playing(track(), context('album', 'spotify:album:alb1')),
    );
    expect(targets[0]).toEqual({
      kind: 'album',
      id: 'alb1',
      name: 'Bibi und Tina — Der Film',
    });
  });

  it('offers the podcast when an episode is playing from one', () => {
    const targets = jumpTargetsFor(
      playing(episode(), context('show', 'spotify:show:shw1')),
    );
    expect(targets[0]).toEqual({
      kind: 'show',
      id: 'shw1',
      name: 'Die drei ???',
    });
  });

  /** No context at all — a single song started on its own still has an album. */
  it('falls back to the song’s own album when there is no context', () => {
    const targets = jumpTargetsFor(playing(track()));
    expect(targets[0]).toEqual({
      kind: 'album',
      id: 'alb1',
      name: 'Bibi und Tina — Der Film',
    });
  });

  it('falls back to the episode’s own podcast when there is no context', () => {
    const targets = jumpTargetsFor(playing(episode()));
    expect(targets).toEqual([
      { kind: 'show', id: 'shw1', name: 'Die drei ???' },
    ]);
  });

  /**
   * An episode whose show did not come with it. There is no screen for a single
   * episode, and looking the show up would mean a sheet that cannot draw until
   * the network answers — so it offers nothing rather than a spinner.
   */
  it('offers nothing for an episode that arrived without its podcast', () => {
    expect(jumpTargetsFor(playing(episode({ show: undefined })))).toEqual([]);
  });

  it('offers every artist of a song, in the order they are credited', () => {
    const targets = jumpTargetsFor(
      playing(
        track({
          artists: [
            { id: 'art1', name: 'Bibi und Tina', uri: 'spotify:artist:art1' },
            { id: 'art2', name: 'Peter Plate', uri: 'spotify:artist:art2' },
          ],
        }),
      ),
    );
    expect(targets.filter((target) => target.kind === 'artist')).toEqual([
      { kind: 'artist', id: 'art1', name: 'Bibi und Tina' },
      { kind: 'artist', id: 'art2', name: 'Peter Plate' },
    ]);
  });

  /** A podcast has a publisher, not an artist, and no page to send anyone to. */
  it('never offers an artist for an episode', () => {
    const targets = jumpTargetsFor(playing(episode()));
    expect(targets.some((target) => target.kind === 'artist')).toBe(false);
  });

  /**
   * The gate that keeps a kid off a dead end. A local file has no page, and
   * neither has the artist Spotify credits it to — both come through without
   * an id.
   */
  it('offers nothing for a local file', () => {
    const local = track({
      id: '',
      uri: 'spotify:local:::Das+Lied:195',
      album: undefined,
      artists: [{ id: '', name: 'Unbekannt', uri: '' }],
    });
    expect(jumpTargetsFor(playing(local))).toEqual([]);
  });

  /** An advert is not somewhere to send anybody, whatever it claims to be. */
  it('offers nothing during an advert', () => {
    const state = playing(track(), context('playlist', 'spotify:playlist:pl1'), {
      currently_playing_type: 'ad',
    });
    expect(jumpTargetsFor(state)).toEqual([]);
  });

  /**
   * The one place this rule parts company with the recents recorder next door,
   * which insists on `is_playing`. That one is answering „what was listened
   * to"; this one is answering „where does this take me", and pausing to go
   * looking for the album is the most likely way anybody uses it at all.
   */
  it('still offers targets while paused', () => {
    const state = playing(track(), context('playlist', 'spotify:playlist:pl1'), {
      is_playing: false,
    });
    expect(jumpTargetsFor(state)).toHaveLength(2);
  });

  it('offers nothing when nothing is playing', () => {
    expect(jumpTargetsFor(undefined)).toEqual([]);
    expect(jumpTargetsFor(playing(null))).toEqual([]);
  });
});
