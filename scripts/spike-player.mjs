#!/usr/bin/env node
/**
 * Step-0 feasibility check for making the *phone itself* a playback device.
 *
 *   node scripts/spike-player.mjs <client-id> <episode-id> [track-id]
 *
 * The app's problem: Spotify classifies podcasts as "mixed media" and withholds
 * them from audio-only Connect devices, so an Echo Dot accepts the command,
 * reports that it is playing, and stays silent. The proposed way out is the Web
 * Playback SDK — the phone becomes the Connect device, and the box is reached
 * over Bluetooth instead of over Spotify.
 *
 * That rests on an assumption worth testing before any of it is built: a
 * browser is not an audio-only device, so mixed media should not be withheld
 * from it. This script settles it, and answers five further questions:
 *
 *   1. Does the SDK boot and emit `ready` with a device id?
 *   2. What exact `type` and `name` does that device report to
 *      /me/player/devices? src/config.ts's allowlist turns on that string.
 *   3. Does a music track play through it? (the control — it separates "the SDK
 *      is broken" from "the SDK refuses podcasts")
 *   4. DOES A PODCAST EPISODE PLAY THROUGH IT? The decisive one.
 *   5. What does the SDK put in our DOM, and does it set navigator.mediaSession?
 *
 * TESTING ON A PHONE, which is the case that actually matters:
 * EME/Widevine needs a secure context, and a LAN IP over plain HTTP is not one,
 * so pointing the phone at this machine's address will not work. Use Chrome
 * DevTools port forwarding (chrome://inspect -> Port forwarding, map 8888 to
 * 127.0.0.1:8888) so the phone sees it as localhost, which *is* a secure
 * context. Sign in on the phone, then tap the button on the page.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { api, openBrowser, PORT, signIn } from './spike-auth.mjs';
import { renderReport } from './spike-player-report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const CLIENT_ID = process.argv[2] ?? process.env.VITE_SPOTIFY_CLIENT_ID;
const EPISODE_ID = process.argv[3];
let TRACK_ID = process.argv[4];

/**
 * `streaming` is what the SDK needs and what the app does not currently ask
 * for; `user-read-email` and `user-read-private` are required alongside it.
 */
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
];

if (!CLIENT_ID || !EPISODE_ID) {
  console.error(
    'Usage: node scripts/spike-player.mjs <client-id> <episode-id> [track-id]',
  );
  console.error('\nThe episode id is required — it is the whole point of the spike.');
  process.exit(1);
}

let resolveReport;
const reported = new Promise((r) => (resolveReport = r));

// Assigned once sign-in completes. The /token route closes over it and cannot
// run before then — the harness page is only opened afterwards.
let accessToken;

const routes = {
  '/player': async (req, res) => {
    const html = await readFile(join(HERE, 'spike-player.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  },
  '/token': (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        accessToken,
        trackUri: `spotify:track:${TRACK_ID}`,
        episodeUri: `spotify:episode:${EPISODE_ID}`,
      }),
    );
  },
  '/report': (req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.writeHead(204).end();
      resolveReport(JSON.parse(body));
    });
  },
};

const session = await signIn(CLIENT_ID, SCOPES, routes);
const { server } = session;
accessToken = session.access_token;

// A control track, so a podcast failure can be told apart from a dead SDK.
if (!TRACK_ID) {
  const found = await api(accessToken, '/search?q=kinderlieder&type=track&limit=1');
  TRACK_ID = found.body?.tracks?.items?.[0]?.id;
  if (TRACK_ID) {
    console.log(`\nNo track id given; using "${found.body.tracks.items[0].name}".`);
  } else {
    console.log('\n⚠ No track id given and the search fallback found nothing.');
    console.log('  The music control will fail; pass a track id to fix that.');
  }
}

const url = `http://127.0.0.1:${PORT}/player`;
console.log(`\nOpen the harness and tap "Test starten":\n\n  ${url}\n`);
console.log('On a phone, forward port 8888 with chrome://inspect first — EME needs');
console.log('a secure context, and a LAN IP over HTTP is not one.\n');
openBrowser(url);

const report = await reported;
server.close();

// Never let a formatting bug destroy an interactive session's findings.
try {
  console.log(renderReport(report));
} catch (err) {
  console.log('\n⚠ Could not format the report:', err.message);
  console.log('Raw findings:\n');
  console.log(JSON.stringify(report, null, 2));
}

console.log('');
process.exit(0);

