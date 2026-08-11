#!/usr/bin/env node
/**
 * Fails the build if any video surface reached the bundle.
 *
 * This is the mechanical check behind the app's first no-video layer: the app
 * renders no video, ever. Run after `npm run build`.
 *
 * Patterns are deliberately specific rather than bare words like "embed", which
 * appear harmlessly in minified library code.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = 'dist';

const PATTERNS = [
  { re: /<video[\s>]/i, what: '<video> element' },
  { re: /<iframe[\s>]/i, what: '<iframe> element' },
  { re: /createElement\(\s*["'`]video["'`]/i, what: 'createElement("video")' },
  { re: /createElement\(\s*["'`]iframe["'`]/i, what: 'createElement("iframe")' },
  { re: /open\.spotify\.com\/embed/i, what: 'Spotify embed iframe URL' },
  { re: /\bvideoTracks\b/, what: 'video track handling' },
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

let failures = 0;
let scanned = 0;

try {
  for await (const file of walk(DIST)) {
    if (!/\.(js|html|css|mjs)$/i.test(file)) continue;
    scanned++;
    const text = await readFile(file, 'utf8');
    for (const { re, what } of PATTERNS) {
      if (re.test(text)) {
        console.error(`FAIL ${file}: contains ${what}`);
        failures++;
      }
    }
  }
} catch (err) {
  console.error(`Could not scan ${DIST}/ — run "npm run build" first.`);
  console.error(err.message);
  process.exit(1);
}

if (failures > 0) {
  console.error(`\n${failures} video surface(s) found in the bundle.`);
  process.exit(1);
}

console.log(`✓ No video surface in ${scanned} bundled files.`);
