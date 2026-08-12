#!/usr/bin/env node
/**
 * Step-0 feasibility check. Run this BEFORE trusting the app's config.
 *
 *   node scripts/spike.mjs <client-id> [episode-id]
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
 * For the separate question of whether the *phone itself* can be a playback
 * device — which is what gets podcasts onto a box that refuses them over
 * Connect — see scripts/spike-player.mjs.
 *
 * The sign-in flow lives in ./spike-auth.mjs, shared with that script.
 */

import { api, signIn } from './spike-auth.mjs';

const CLIENT_ID = process.argv[2] ?? process.env.VITE_SPOTIFY_CLIENT_ID;
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-private',
];

// Keep in sync with src/config.ts.
const ALLOWED_TYPES = ['speaker', 'castaudio', 'avr'];
const BLOCKED_TYPES = ['tv', 'castvideo', 'stb', 'game_console', 'computer', 'smartphone'];

if (!CLIENT_ID) {
  console.error('Usage: node scripts/spike.mjs <client-id> [episode-id]');
  process.exit(1);
}

const { access_token: accessToken, server } = await signIn(CLIENT_ID, SCOPES);
server.close();

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
    console.log('      Note: a 204 only means the command was accepted. Confirm by ear —');
    console.log('      a box that refuses mixed media reports success and stays silent.');
  } else {
    console.log(`    ✗ Failed (${play.status}):`, JSON.stringify(play.body));
    console.log('      Podcasts must fall back to playing the show from episode 1.');
  }
}

console.log('');
process.exit(0);
