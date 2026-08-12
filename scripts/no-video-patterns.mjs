/**
 * The patterns behind `npm run check:novideo`, in their own module so the
 * checker and its test share one definition.
 *
 * Two sets, because neither covers what the other does.
 *
 * SOURCE_PATTERNS is the primary defence. An `<iframe>` written in a .tsx file
 * is visible as literal text and no bundler can rename it, so matching source
 * does not depend on what the compiler emits.
 *
 * BUNDLE_PATTERNS catches what never appears in src/: third-party code and
 * elements built at runtime.
 *
 * Patterns are deliberately specific rather than bare words like "embed", which
 * appear harmlessly in minified library code.
 */

/** Written in .tsx source. Cannot be obscured by the build. */
export const SOURCE_PATTERNS = [
  { re: /<video[\s>/]/i, what: '<video> element' },
  { re: /<iframe[\s>/]/i, what: '<iframe> element' },
];

export const BUNDLE_PATTERNS = [
  { re: /<video[\s>]/i, what: '<video> element' },
  { re: /<iframe[\s>]/i, what: '<iframe> element' },

  // React's *classic* runtime, and document.createElement.
  { re: /createElement\(\s*["'`]video["'`]/i, what: 'createElement("video")' },
  { re: /createElement\(\s*["'`]iframe["'`]/i, what: 'createElement("iframe")' },

  // React's *automatic* runtime, which is what this app actually compiles to —
  // JSX becomes jsx("iframe", …), never createElement. Omitting this was a real
  // hole: a rendered <iframe> passed the check and would have been deployed.
  //
  // `\)?` handles the minified call form `(0,k.jsx)(`, and the backtick in the
  // character class is required because this bundler emits backtick strings.
  // Specific enough to skip React DOM's own `case`iframe`:` statements, which
  // are in every build.
  //
  // Keyed on the emitted helper name, which survives minification here as
  // `k.jsx` only because React's CJS interop keeps it a namespace property. A
  // bundler that renamed it to a bare local would defeat this one — hence
  // SOURCE_PATTERNS being the primary defence rather than this.
  {
    re: /\bjsxs?(?:DEV)?\s*\)?\s*\(\s*["'`](?:video|iframe)["'`]/i,
    what: 'jsx("video"|"iframe") from the automatic JSX runtime',
  },

  { re: /open\.spotify\.com\/embed/i, what: 'Spotify embed iframe URL' },
  { re: /\bvideoTracks\b/, what: 'video track handling' },
];
