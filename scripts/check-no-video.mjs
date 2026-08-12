#!/usr/bin/env node
/**
 * Fails the build if any video surface reached the app.
 *
 * This is the mechanical check behind the app's first no-video layer: the app
 * renders no video, ever. Run after `npm run build`.
 *
 * Scans twice. `src/` catches anything authored here, regardless of what the
 * compiler turns it into; `dist/` catches third-party and runtime-built code
 * that never appears in source. The patterns live in ./no-video-patterns.mjs so
 * that no-video-patterns.test.mjs can assert they still catch what they claim.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BUNDLE_PATTERNS, SOURCE_PATTERNS } from './no-video-patterns.mjs';

const DIST = 'dist';
const SRC = 'src';

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

let failures = 0;

/** Returns how many files were scanned. */
async function scan(dir, patterns, include) {
  let scanned = 0;
  for await (const file of walk(dir)) {
    if (!include(file)) continue;
    scanned++;
    const text = await readFile(file, 'utf8');
    for (const { re, what } of patterns) {
      if (re.test(text)) {
        console.error(`FAIL ${file}: contains ${what}`);
        failures++;
      }
    }
  }
  return scanned;
}

let sources = 0;
let bundled = 0;

try {
  sources = await scan(SRC, SOURCE_PATTERNS, (file) =>
    /\.tsx?$/i.test(file) && !/\.test\.tsx?$/i.test(file),
  );
  bundled = await scan(DIST, BUNDLE_PATTERNS, (file) =>
    /\.(js|html|css|mjs)$/i.test(file),
  );
} catch (err) {
  console.error(`Could not scan ${SRC}/ and ${DIST}/ — run "npm run build" first.`);
  console.error(err.message);
  process.exit(1);
}

// A scan that finds nothing to look at would pass silently, which is the same
// failure mode as having no check at all.
if (sources === 0 || bundled === 0) {
  console.error(
    `Scanned ${sources} source and ${bundled} bundled files — expected both to be non-zero.`,
  );
  process.exit(1);
}

if (failures > 0) {
  console.error(`\n${failures} video surface(s) found.`);
  process.exit(1);
}

console.log(
  `✓ No video surface in ${sources} source files and ${bundled} bundled files.`,
);
