#!/usr/bin/env node
/**
 * Step-0 feasibility check. Run this BEFORE trusting the app's config.
 *
 *   node scripts/spike.mjs <client-id>
 *
 * It answers the three questions the design rests on:
 *
 *   1. Is this account Premium? (playback control is Premium-only)
 *   2. Which Connect devices does this account actually see, and what are their
 *      exact `type` strings? Spotify only documents 'computer', 'smartphone'
 *      and 'speaker', so the real values have to be observed and pasted into
 *      src/config.ts.
 *   3. Does playing a podcast episode by URI work? The API documents
 *      /me/player/play as track-only.
 *
 * Register http://127.0.0.1:8888/callback as a redirect URI in the dashboard
 * first. Loopback HTTP is permitted; `localhost` is explicitly banned.
 */

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

const CLIENT_ID = process.argv[2] ?? process.env.VITE_SPOTIFY_CLIENT_ID;
const REDIRECT_URI = 'http://127.0.0.1:8888/callback';
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-private',
].join(' ');

// Keep in sync with src/config.ts.
const ALLOWED_TYPES = ['speaker', 'castaudio', 'avr'];
const BLOCKED_TYPES = ['tv', 'castvideo', 'stb', 'game_console', 'computer', 'smartphone'];

if (!CLIENT_ID) {
  console.error('Usage: node scripts/spike.mjs <client-id>');
  process.exit(1);
}

const base64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const verifier = base64url(randomBytes(64));
const challenge = base64url(createHash('sha256').update(verifier).digest());

const authUrl =
  'https://accounts.spotify.com/authorize?' +
  new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
  });

/** Waits for the OAuth redirect and returns the authorization code. */
function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<h1>${code ? 'Done — back to the terminal.' : 'Failed: ' + error}</h1>`,
      );
      server.close();
      code ? resolve(code) : reject(new Error(error ?? 'no code returned'));
    });
    server.listen(8888, '127.0.0.1');
  });
}

async function token(body) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
  });
  if (!res.ok) throw new Error(`token: ${res.status} ${await res.text()}`);
  return res.json();
}

async function api(accessToken, path, init = {}) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, body: text ? JSON.parse(text) : null };
}

console.log('\nOpen this URL and sign in as the account you want to test:\n');
console.log(authUrl + '\n');
// Best effort; harmless if it fails.
spawn('cmd', ['/c', 'start', '', authUrl], { detached: true, stdio: 'ignore' }).on(
  'error',
  () => {},
);

const code = await waitForCode();
const { access_token: accessToken, refresh_token: refreshToken } = await token({
  grant_type: 'authorization_code',
  code,
  redirect_uri: REDIRECT_URI,
  code_verifier: verifier,
});

// --- 1. Premium check -------------------------------------------------------
const me = await api(accessToken, '/me');
console.log(`\n[1] Account: ${me.body?.display_name} (${me.body?.id})`);
console.log(`    Product : ${me.body?.product}`);
if (me.body?.product !== 'premium') {
  console.log('    ⚠ NOT PREMIUM — playback control will not work for this account.');
} else {
  console.log('    ✓ Premium, playback control available.');
}

// --- 2. Device enumeration --------------------------------------------------
const devices = await api(accessToken, '/me/player/devices');
const list = devices.body?.devices ?? [];
console.log(`\n[2] Connect devices visible to this account: ${list.length}`);

if (list.length === 0) {
  console.log('    ⚠ None. Switch a speaker on, and connect to it once from the');
  console.log('      official Spotify app with THIS account — the Web API only');
  console.log('      lists devices the account already knows about.');
}

for (const d of list) {
  const type = (d.type ?? '').toLowerCase();
  const verdict = BLOCKED_TYPES.includes(type)
    ? 'BLOCKED (can show video)'
    : ALLOWED_TYPES.includes(type)
      ? 'allowed'
      : 'HIDDEN (type not in allowlist — add it to src/config.ts if it is a speaker)';
  console.log(`    - ${d.name}`);
  console.log(`      type=${d.type}  id=${d.id}  restricted=${d.is_restricted}`);
  console.log(`      => ${verdict}`);
}

// --- 3. Podcast episode playback -------------------------------------------
const episodeId = process.argv[3];
const target = list.find((d) => ALLOWED_TYPES.includes((d.type ?? '').toLowerCase()));

console.log('\n[3] Podcast episode playback');
if (!episodeId) {
  console.log('    Skipped. Re-run with an episode id to test:');
  console.log('      node scripts/spike.mjs <client-id> <episode-id>');
} else if (!target) {
  console.log('    Skipped — no allowed speaker to play to.');
} else {
  const play = await api(accessToken, `/me/player/play?device_id=${target.id}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [`spotify:episode:${episodeId}`] }),
  });
  if (play.ok || play.status === 204) {
    console.log(`    ✓ uris:[spotify:episode:…] works — playing on ${target.name}.`);
  } else {
    console.log(`    ✗ Failed (${play.status}):`, JSON.stringify(play.body));
    console.log('      Podcasts must fall back to playing the show from episode 1.');
  }
}

console.log('\nRefresh token (for further manual testing):\n' + refreshToken + '\n');
process.exit(0);
