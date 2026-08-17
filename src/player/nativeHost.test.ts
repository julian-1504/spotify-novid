// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bindHostCommands,
  hostStatus,
  hostStopped,
  idleFrom,
  inWrapper,
  openHostNotificationSettings,
  publishToHost,
  snapshotOfSelf,
} from './nativeHost';
import type { SelfState } from './webPlayback';

/**
 * The page's end of the Android media notification. Worth testing without a
 * phone because the notification is not decoration: the service behind it is
 * what stops Android freezing the app — and the page — once the screen is off.
 * A snapshot that says the wrong thing is a locked phone that stops between
 * songs, which is the bug this whole seam exists to fix.
 */

const bridge = () => {
  const host = {
    publish: vi.fn(),
    stopped: vi.fn(),
    status: vi.fn(() => '{}'),
    openNotificationSettings: vi.fn(),
  };
  window.Klangkiste = host;
  return host;
};

const playing = (over: Partial<SelfState> = {}): SelfState => ({
  paused: false,
  positionMs: 1000,
  durationMs: 240000,
  uri: 'spotify:track:a',
  title: 'Bibi Blocksberg',
  artist: 'Elfie Donnelly',
  artworkUrl: 'https://i.scdn.co/image/abc',
  ...over,
});

afterEach(() => {
  delete window.Klangkiste;
  delete window.__klangkiste;
});

describe('snapshotOfSelf', () => {
  it('turns what the SDK reports into what the notification shows', () => {
    expect(snapshotOfSelf(playing())).toEqual({
      playing: true,
      title: 'Bibi Blocksberg',
      artist: 'Elfie Donnelly',
      artworkUrl: 'https://i.scdn.co/image/abc',
      durationMs: 240000,
      positionMs: 1000,
    });
  });

  // The SDK says `paused`; a notification asks whether it is playing. Getting
  // this the wrong way round shows a play button on music that is running.
  it('reads a paused SDK state as not playing', () => {
    expect(snapshotOfSelf(playing({ paused: true }))?.playing).toBe(false);
  });

  /**
   * Null is the answer that takes the notification down: no track, or playback
   * that moved to another device. Anything else would leave a locked phone
   * showing a song that ended.
   */
  it('has nothing to show when there is no state', () => {
    expect(snapshotOfSelf(null)).toBeNull();
  });
});

/**
 * The distinction this file exists to protect: „nichts läuft gerade" is not
 * „dieses Handy ist keine Box mehr". The first must keep the foreground service
 * up, because a null arrives at every track boundary — with the app hidden,
 * where Android will not let the service start again.
 */
describe('idleFrom', () => {
  it('keeps the last song on the notification and calls it paused', () => {
    const last = snapshotOfSelf(playing());

    expect(idleFrom(last)).toEqual({
      playing: false,
      title: 'Bibi Blocksberg',
      artist: 'Elfie Donnelly',
      artworkUrl: 'https://i.scdn.co/image/abc',
      durationMs: 240000,
      positionMs: 1000,
    });
  });

  // Selecting this phone publishes before any song has played. A blank title is
  // what the wrapper turns into its own „Klangkiste" fallback.
  it('has a blank paused snapshot when there was never a song', () => {
    expect(idleFrom(null)).toEqual({
      playing: false,
      title: '',
      artist: '',
      durationMs: 0,
      positionMs: 0,
    });
  });
});

describe('publishToHost', () => {
  it('hands the snapshot to the wrapper as JSON', () => {
    const host = bridge();

    publishToHost(snapshotOfSelf(playing()));

    expect(JSON.parse(host.publish.mock.calls[0][0] as string)).toMatchObject({
      playing: true,
      title: 'Bibi Blocksberg',
    });
  });

  it('says playback stopped rather than publishing nothing', () => {
    const host = bridge();

    hostStopped();

    expect(host.stopped).toHaveBeenCalled();
    expect(host.publish).not.toHaveBeenCalled();
  });

  // The whole module is dead weight in a browser, and must be silent there
  // rather than throw on every track change.
  it('does nothing at all outside the wrapper', () => {
    expect(inWrapper()).toBe(false);
    expect(() => publishToHost(snapshotOfSelf(playing()))).not.toThrow();
    expect(() => hostStopped()).not.toThrow();
  });
});

/**
 * The panel on /konto is the only diagnosis available on a phone that is not
 * plugged into a laptop, so it has to survive the two things that will happen
 * to it: an APK older than the method, and an APK that answers with rubbish.
 */
describe('hostStatus', () => {
  it('reads what the wrapper says about itself', () => {
    const host = bridge();
    host.status.mockReturnValue(
      JSON.stringify({ trusted: true, serviceRunning: true, notificationsEnabled: false }),
    );

    expect(hostStatus()).toEqual({
      trusted: true,
      serviceRunning: true,
      notificationsEnabled: false,
    });
  });

  it('has no answer outside the wrapper', () => {
    expect(hostStatus()).toBeNull();
  });

  it('has no answer from a wrapper too old to have the method', () => {
    window.Klangkiste = { publish: vi.fn(), stopped: vi.fn() };

    expect(hostStatus()).toBeNull();
  });

  it('treats an unreadable answer as no answer', () => {
    const host = bridge();
    host.status.mockReturnValue('not json');

    expect(hostStatus()).toBeNull();
  });
});

describe('openHostNotificationSettings', () => {
  it('asks the wrapper to open them', () => {
    const host = bridge();

    openHostNotificationSettings();

    expect(host.openNotificationSettings).toHaveBeenCalled();
  });

  it('does nothing outside the wrapper', () => {
    expect(() => openHostNotificationSettings()).not.toThrow();
  });
});

describe('bindHostCommands', () => {
  const handlers = () => ({
    play: vi.fn(),
    pause: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    seek: vi.fn(),
  });

  it('routes each notification button to its command', () => {
    bridge();
    const h = handlers();

    bindHostCommands(h);
    window.__klangkiste?.command('play');
    window.__klangkiste?.command('pause');
    window.__klangkiste?.command('next');
    window.__klangkiste?.command('previous');
    window.__klangkiste?.command('seek', 42000);

    expect(h.play).toHaveBeenCalled();
    expect(h.pause).toHaveBeenCalled();
    expect(h.next).toHaveBeenCalled();
    expect(h.previous).toHaveBeenCalled();
    expect(h.seek).toHaveBeenCalledWith(42000);
  });

  // A seek with nowhere to go would land at the start of the song.
  it('ignores a seek that carries no position', () => {
    bridge();
    const h = handlers();

    bindHostCommands(h);
    window.__klangkiste?.command('seek');

    expect(h.seek).not.toHaveBeenCalled();
  });

  it('unwires on the way out', () => {
    bridge();

    bindHostCommands(handlers())();

    expect(window.__klangkiste).toBeUndefined();
  });

  it('installs nothing outside the wrapper', () => {
    bindHostCommands(handlers());

    expect(window.__klangkiste).toBeUndefined();
  });
});
