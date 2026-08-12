import { describe, expect, it } from 'vitest';
import { BUNDLE_PATTERNS, SOURCE_PATTERNS } from './no-video-patterns.mjs';

/**
 * The check these patterns back was broken for months in the only way that
 * mattered: it looked for React's classic runtime while the app compiles to the
 * automatic one, so a rendered <iframe> passed cleanly. Nothing caught it
 * because nothing ever asserted the checker catches what it claims.
 *
 * The bad samples below are real strings taken from a build poisoned on purpose,
 * not idealised ones — the minified forms are the whole point.
 */

const matches = (patterns, text) => patterns.some(({ re }) => re.test(text));

describe('no-video patterns: bundle layer', () => {
  const bad = [
    // Automatic JSX runtime, minified. This is the form that got through.
    ['minified jsx() call', '(0,k.jsx)(`iframe`,{src:`https://example.com`})'],
    ['unminified jsx()', 'jsx("video",{controls:!0})'],
    ['jsxs() for multiple children', 'jsxs("iframe",{})'],
    ['dev runtime', 'jsxDEV("video",{},void 0,!1)'],
    // Classic runtime and plain DOM.
    ['React.createElement', 'React.createElement("video", null)'],
    ['document.createElement', 'document.createElement(`iframe`)'],
    // Literal markup.
    ['html iframe', '<iframe src="https://example.com"></iframe>'],
    ['html video', '<video autoplay></video>'],
    // Other surfaces.
    ['spotify embed', 'https://open.spotify.com/embed/track/abc'],
    ['video tracks', 'stream.videoTracks.length'],
  ];

  for (const [name, sample] of bad) {
    it(`catches ${name}`, () => {
      expect(matches(BUNDLE_PATTERNS, sample)).toBe(true);
    });
  }

  /**
   * React DOM's own event-registration code switches on tag names, so these
   * strings are in every single build. A pattern that trips on them makes the
   * check useless in the opposite direction — it would never pass.
   */
  const good = [
    ['react-dom tag switch', 'case`iframe`:case`object`:case`embed`:Q(`load`,t);break;'],
    ['react-dom dialog switch', 'case`dialog`:Q(`cancel`,t),Q(`close`,t);break;'],
    ['prose mentioning video', 'const help = "Kein Video, nur Ton";'],
  ];

  for (const [name, sample] of good) {
    it(`does not trip on ${name}`, () => {
      expect(matches(BUNDLE_PATTERNS, sample)).toBe(false);
    });
  }
});

describe('no-video patterns: source layer', () => {
  const bad = [
    ['self-closing jsx iframe', '      <iframe src="https://example.com" />'],
    ['jsx iframe with children', '<iframe title="x">fallback</iframe>'],
    ['jsx video', '<video controls />'],
    ['jsx video, no attributes', '<video>'],
  ];

  for (const [name, sample] of bad) {
    it(`catches ${name}`, () => {
      expect(matches(SOURCE_PATTERNS, sample)).toBe(true);
    });
  }

  it('does not trip on identifiers that merely contain the word', () => {
    expect(matches(SOURCE_PATTERNS, 'const videoBlocked = true;')).toBe(false);
    expect(matches(SOURCE_PATTERNS, "t('video.none')")).toBe(false);
    expect(matches(SOURCE_PATTERNS, '<VideoWarning />')).toBe(false);
  });
});

/**
 * Guards against the check quietly becoming a no-op. Emptying either array
 * would otherwise leave every scan passing with nothing to report.
 */
describe('no-video patterns: the check is not empty', () => {
  it('has patterns in both layers', () => {
    expect(SOURCE_PATTERNS.length).toBeGreaterThan(0);
    expect(BUNDLE_PATTERNS.length).toBeGreaterThan(0);
  });

  it('gives every pattern a description for the failure message', () => {
    for (const { re, what } of [...SOURCE_PATTERNS, ...BUNDLE_PATTERNS]) {
      expect(re).toBeInstanceOf(RegExp);
      expect(what.length).toBeGreaterThan(0);
    }
  });
});
