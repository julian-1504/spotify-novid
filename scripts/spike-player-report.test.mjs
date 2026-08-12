import { describe, expect, it } from 'vitest';
import { renderReport } from './spike-player-report.mjs';

/**
 * The renderer runs once, after an interactive sign-in and a tap-through that
 * may have happened on a phone. These cover the three conclusions it can reach,
 * because reaching the wrong one sends the whole project down the wrong path.
 */

const step = (label, verdict, extra = {}) => ({
  label,
  verdict,
  httpStatus: 204,
  sdkState: { paused: verdict !== 'playing' },
  ...extra,
});

const base = {
  deviceId: 'abc123',
  activateElement: 'ok',
  secureContext: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14)',
  selfDevice: { id: 'abc123', name: 'NoVid Spike', type: 'Computer' },
  dom: {
    frames: [{ src: 'https://sdk.scdn.co/embedded/index.html', allow: 'encrypted-media', hidden: true }],
    videos: [],
    audioElements: 0,
  },
  mediaSession: { available: true, metadataSetBySdk: false, playbackState: 'none' },
};

describe('renderReport', () => {
  it('calls the plan sound when the podcast plays', () => {
    const out = renderReport({
      ...base,
      steps: [step('MUSIC (track)', 'playing'), step('PODCAST (episode)', 'playing')],
    });
    expect(out).toContain('podcasts play through the SDK');
    expect(out).not.toContain('fall back to the open-RSS-feed');
  });

  it('sends you to RSS when music plays but the podcast does not', () => {
    // The distinction that matters: the SDK works, so a podcast failure is
    // Spotify withholding mixed media rather than a broken setup.
    const out = renderReport({
      ...base,
      steps: [step('MUSIC (track)', 'playing'), step('PODCAST (episode)', 'not-playing')],
    });
    expect(out).toContain('fall back to the open-RSS-feed');
    expect(out).not.toContain('The phone-as-player plan holds');
  });

  it('blames the setup, not podcasts, when nothing plays at all', () => {
    const out = renderReport({
      ...base,
      steps: [step('MUSIC (track)', 'not-playing'), step('PODCAST (episode)', 'not-playing')],
    });
    expect(out).toContain('nothing played');
    expect(out).toContain('before drawing any conclusion');
  });

  it('shouts if the SDK ever creates a video element', () => {
    const out = renderReport({
      ...base,
      steps: [step('PODCAST (episode)', 'playing')],
      dom: { ...base.dom, videos: [{ src: 'blob:https://sdk.scdn.co/xyz' }] },
    });
    expect(out).toContain('THE SDK CREATED A VIDEO ELEMENT');
  });

  it('says the device type must be admitted by id, not by type', () => {
    const out = renderReport({ ...base, steps: [] });
    expect(out).toContain("'computer' is blocked by src/config.ts");
    expect(out).toContain('admit this');
  });

  it('survives a report from a run that never got off the ground', () => {
    // A fatal before `ready` leaves almost every field undefined; the renderer
    // still has to produce the errors rather than throwing over them.
    const out = renderReport({
      fatal: 'no ready event within 20s',
      events: [{ event: 'authentication_error', message: 'Invalid token scopes.' }],
    });
    expect(out).toContain('FATAL: no ready event within 20s');
    expect(out).toContain('Invalid token scopes.');
    expect(out).toContain('(never became ready)');
    expect(out).toContain('nothing played');
  });
});
