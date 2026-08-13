#!/usr/bin/env node
/**
 * Generates the launcher icons: the PWA's into public/, and the Android
 * wrapper's into android/app/src/main/res/mipmap-*.
 *
 * Hand-rolled PNG encoding keeps this dependency-free — the icon is a flat
 * rounded square with a music note, so per-pixel maths is enough and pulling in
 * an image library would be overkill.
 *
 * Run from the repo root: `node scripts/make-icons.mjs`.
 */

import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';

const BG = [29, 185, 84]; // Spotify green
const FG = [255, 255, 255];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Signed distance helpers, all in 0..1 space so the shape scales cleanly. */
function inRoundedSquare(x, y, r) {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
  return Math.hypot(dx, dy) <= r;
}

function inNote(x, y) {
  // Note head: ellipse at lower left.
  const headX = (x - 0.38) / 0.15;
  const headY = (y - 0.68) / 0.115;
  if (headX * headX + headY * headY <= 1) return true;

  // Stem rising from the head's right edge.
  if (x >= 0.50 && x <= 0.55 && y >= 0.26 && y <= 0.70) return true;

  // Flag at the top of the stem.
  if (x >= 0.50 && x <= 0.70 && y >= 0.26 && y <= 0.38) {
    const t = (x - 0.50) / 0.20;
    return y <= 0.26 + 0.12 * (1 - t * t) + 0.02;
  }
  return false;
}

/**
 * @param size    Edge length in pixels.
 * @param scale   How much of the canvas the artwork fills. Android's adaptive
 *                icons draw on a 108dp canvas but only guarantee the middle
 *                72dp is visible, so the foreground layer is drawn at 2/3.
 * @param cutout  Leave the padding transparent instead of filling it with the
 *                page background. Wanted for an adaptive foreground, where the
 *                background layer shows through; not wanted for the PWA icons,
 *                whose padding is what makes them safe to mask.
 */
function renderPng(size, { scale = 1, cutout = false } = {}) {
  const channels = cutout ? 4 : 3;
  const raw = Buffer.alloc(size * (size * channels + 1));
  let pos = 0;
  for (let py = 0; py < size; py++) {
    raw[pos++] = 0; // filter type: none
    for (let px = 0; px < size; px++) {
      // Map back into the artwork's own 0..1 space. Outside it the rounded
      // square simply does not match, which is exactly the padding.
      const x = ((px + 0.5) / size - 0.5) / scale + 0.5;
      const y = ((py + 0.5) / size - 0.5) / scale + 0.5;
      const inside = inRoundedSquare(x, y, 0.22);
      const colour = !inside
        ? [15, 17, 21] // page background, so maskable padding blends in
        : inNote(x, y)
          ? FG
          : BG;
      raw[pos++] = colour[0];
      raw[pos++] = colour[1];
      raw[pos++] = colour[2];
      if (cutout) raw[pos++] = inside ? 255 : 0;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = cutout ? 6 : 2; // colour type: truecolour, with alpha when cut out
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  await writeFile(`public/icon-${size}.png`, renderPng(size));
  console.log(`wrote public/icon-${size}.png`);
}

/**
 * The Android wrapper's launcher icons, from the same shape — so the icon a kid
 * taps is the icon they already knew, and there is one place to change it.
 *
 * Two sets per density: the legacy square icon, which is the maskable artwork
 * unchanged, and the adaptive icon's foreground layer, which is transparent
 * outside the shape because android/app/src/main/res/mipmap-anydpi-v26 paints
 * the background from @color/background instead.
 */
const ANDROID_RES = 'android/app/src/main/res';
const DENSITIES = {
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4,
};

for (const [density, factor] of Object.entries(DENSITIES)) {
  const dir = `${ANDROID_RES}/mipmap-${density}`;
  await mkdir(dir, { recursive: true });

  // 48dp for the launcher icon, 108dp for the adaptive foreground canvas.
  const legacy = renderPng(Math.round(48 * factor));
  const foreground = renderPng(Math.round(108 * factor), {
    scale: 72 / 108,
    cutout: true,
  });

  await writeFile(`${dir}/ic_launcher.png`, legacy);
  await writeFile(`${dir}/ic_launcher_round.png`, legacy);
  await writeFile(`${dir}/ic_launcher_foreground.png`, foreground);
  console.log(`wrote ${dir}/ic_launcher{,_round,_foreground}.png`);
}
