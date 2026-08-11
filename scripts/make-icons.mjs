#!/usr/bin/env node
/**
 * Generates the PWA launcher icons into public/.
 *
 * Hand-rolled PNG encoding keeps this dependency-free — the icon is a flat
 * rounded square with a music note, so per-pixel maths is enough and pulling in
 * an image library for two files would be overkill.
 */

import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';

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

function renderPng(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let pos = 0;
  for (let py = 0; py < size; py++) {
    raw[pos++] = 0; // filter type: none
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) / size;
      const y = (py + 0.5) / size;
      const colour = !inRoundedSquare(x, y, 0.22)
        ? [15, 17, 21] // page background, so maskable padding blends in
        : inNote(x, y)
          ? FG
          : BG;
      raw[pos++] = colour[0];
      raw[pos++] = colour[1];
      raw[pos++] = colour[2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
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
