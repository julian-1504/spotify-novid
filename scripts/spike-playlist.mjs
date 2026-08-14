#!/usr/bin/env node
/**
 * Can this app list the songs of a playlist somebody else made?
 *
 *   node scripts/spike-playlist.mjs <client-id> [playlist…] [--search=…] [--play]
 *
 * `/playlists/{id}/items` answers 403 for a playlist the account neither owns
 * nor collaborates on (found while fixing 8e4e9ef), while `/playlists/{id}`
 * itself answers 200 — which is why such a playlist draws its cover and name
 * over an empty list. The question this spike settles is whether that 200
 * carries the entries themselves, because then the screen can list them from
 * the response it already fetches and never touch the refused endpoint.
 *
 * It answers, per playlist:
 *
 *   1. What `GET /playlists/{id}` actually returns — is there an `items` array
 *      beside the count, how long is it, and under which key?
 *   2. What `GET /playlists/{id}/items` answers, verbatim.
 *   3. Whether market / fields / additional_types change that answer.
 *   4. Whether the embedded page's `next` URL can be followed.
 *   5. With --play: whether the playlist can still be *played* by context URI
 *      and started at a position. A list that cannot be played is worse than
 *      no list.
 *
 * Given no playlists it finds three itself — one of this account's own, one
 * somebody else made, one Spotify made — so a bare run answers the question
 * with the difference between them in a single output. Naming them instead
 * works too: raw ids, spotify: URIs and open.spotify.com links all parse, since
 * a shared link is what you actually have to hand.
 *
 * The sign-in flow lives in ./spike-auth.mjs, shared with the other spikes.
 * As there: the token is never printed.
 */

import { api, signIn } from './spike-auth.mjs';

const args = process.argv.slice(2);
const PLAY = args.includes('--play');
const flag = (name, fallback) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const positional = args.filter((a) => !a.startsWith('--'));
const CLIENT_ID = positional[0] ?? process.env.VITE_SPOTIFY_CLIENT_ID;
const PLAYLISTS = positional.slice(1);
/*
 * Given no playlists to look at, the spike goes and finds them the way a kid
 * does: it searches. That is the whole point — the playlists this question is
 * about are the ones nobody in the family made, and they arrive through the
 * search screen. `--search=` changes what it looks for.
 */
const SEARCH = flag('search', 'Hörspiel');

// Read-only apart from --play, so the write scopes are only asked for when the
// run actually intends to make noise in the house.
const SCOPES = [
  'user-read-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  ...(PLAY
    ? [
        'user-read-playback-state',
        'user-modify-playback-state',
        'user-read-currently-playing',
      ]
    : []),
];

if (!CLIENT_ID) {
  console.error(
    'Usage: node scripts/spike-playlist.mjs <client-id> [playlist…] [--search=…] [--play]',
  );
  process.exit(1);
}

/** A raw id, a spotify:playlist: URI or an open.spotify.com link, as an id. */
function playlistId(arg) {
  const match = arg.match(/playlist[:/]([A-Za-z0-9]+)/);
  return match ? match[1] : arg;
}

/** The absolute `next` URL has to be fetched as given — it is not a path. */
async function follow(accessToken, url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, body: text ? JSON.parse(text) : null };
}

const { access_token: accessToken, server } = await signIn(CLIENT_ID, SCOPES);
server.close();

const me = await api(accessToken, '/me');
const myId = me.body?.id;
console.log(`\nSigned in as ${me.body?.display_name} (${myId})`);

/**
 * Three playlists worth comparing, found rather than typed in: one of this
 * account's own, one somebody else made, and one Spotify made.
 *
 * The third is what tells the two possible causes apart. If the account's own
 * playlist works and both of the others are refused, the gate is ownership. If
 * only Spotify's own is refused, it is the editorial rule, and playlists other
 * families made are readable after all.
 */
async function discover() {
  const found = [];

  const mine = await api(accessToken, '/me/playlists?limit=50');
  const own = (mine.body?.items ?? [])
    .filter(Boolean)
    .find((p) => p.owner?.id === myId);
  if (own) found.push(own.id);
  else console.log('    (no playlist of this account\'s own to compare against)');

  const hits = await api(
    accessToken,
    `/search?q=${encodeURIComponent(SEARCH)}&type=playlist&limit=10`,
  );
  const results = (hits.body?.playlists?.items ?? []).filter(Boolean);
  const foreign = results.find(
    (p) => p.owner?.id !== myId && p.owner?.id !== 'spotify',
  );
  const editorial = results.find((p) => p.owner?.id === 'spotify');
  if (foreign) found.push(foreign.id);
  if (editorial) found.push(editorial.id);

  console.log(`\nSearched „${SEARCH}" — ${results.length} playlists back.`);
  console.log(`  own      : ${own ? `${own.name} (${own.id})` : '—'}`);
  console.log(
    `  foreign  : ${foreign ? `${foreign.name} by ${foreign.owner?.display_name} (${foreign.id})` : '— none found, try --search=…'}`,
  );
  console.log(
    `  editorial: ${editorial ? `${editorial.name} (${editorial.id})` : '— none in these results'}`,
  );

  return found;
}

const targets = PLAYLISTS.length ? PLAYLISTS : await discover();

if (targets.length === 0) {
  console.error('\nNothing to look at. Pass a playlist link, or try --search=…');
  process.exit(1);
}

const findings = [];

for (const arg of targets) {
  const id = playlistId(arg);
  console.log(`\n${'='.repeat(72)}\nPlaylist ${id}`);

  const finding = { id, name: '?', foreign: null, embedded: null, items: null };
  findings.push(finding);

  // --- 1. The detail response, and what it carries ---------------------------
  const detail = await api(accessToken, `/playlists/${id}`);
  console.log(`\n[1] GET /playlists/${id} -> ${detail.status}`);
  if (!detail.ok) {
    console.log('    ', JSON.stringify(detail.body));
    console.log('    Nothing else to ask about this one.');
    continue;
  }

  const playlist = detail.body;
  finding.name = playlist.name;
  finding.foreign = playlist.owner?.id !== myId;
  console.log(`    name  : ${playlist.name}`);
  console.log(
    `    owner : ${playlist.owner?.id} (${playlist.owner?.display_name}) — ` +
      (finding.foreign ? 'FOREIGN, this is the interesting case' : 'own'),
  );
  console.log(`    public=${playlist.public} collaborative=${playlist.collaborative}`);

  // Which key the contents came under, and whether it is a page or just a count.
  // February 2026 renamed `tracks` to `items` one level up; both are read here
  // for the same reason src/api/catalog.ts reads both.
  for (const key of ['items', 'tracks']) {
    const page = playlist[key];
    if (page === undefined) {
      console.log(`    ${key}: absent`);
      continue;
    }
    console.log(`    ${key}: keys = ${Object.keys(page).join(', ')}`);
    console.log(
      `           total=${page.total} limit=${page.limit} offset=${page.offset}`,
    );
    console.log(`           next = ${page.next ?? 'null'}`);
    if (Array.isArray(page.items)) {
      console.log(`    >>> ${page.items.length} ENTRIES EMBEDDED in the detail response`);
      const first = page.items[0];
      if (first) {
        const wrapper = 'item' in first ? 'item' : 'track' in first ? 'track' : '?';
        const entry = first.item ?? first.track;
        console.log(
          `        entry wrapper key = "${wrapper}", type = ${entry?.type}, ` +
            `name = ${entry?.name}`,
        );
        console.log(`        entry keys = ${Object.keys(first).join(', ')}`);
        // An embedded entry may well be trimmed compared to what /items returns,
        // and TrackRow reads every one of these: a missing `artists` throws on
        // `.map` and takes the screen down, a missing `type` renders an episode
        // as a song.
        const NEEDED = [
          'type',
          'id',
          'uri',
          'name',
          'duration_ms',
          'explicit',
          'artists',
          'album',
        ];
        const missing = NEEDED.filter((k) => entry?.[k] === undefined);
        console.log(
          `        fields the rows need: ${
            missing.length ? `MISSING ${missing.join(', ')}` : 'all present'
          }`,
        );
        console.log(`        first entry verbatim:\n${JSON.stringify(first, null, 2)}`);
        // Null entries keep their place in a playlist; count them, because the
        // screen has to tell "nothing readable" from "nothing there".
        const holes = page.items.filter((e) => !(e.item ?? e.track)).length;
        console.log(`        null entries in this page: ${holes}`);
      }
      finding.embedded = { key, count: page.items.length, total: page.total, next: page.next };
    } else {
      console.log(`    ${key}: count only, no entries`);
    }
  }

  // --- 1b. The same response, asked for differently --------------------------
  //
  // A foreign playlist answers 200 and carries no contents whatsoever — not the
  // entries, not even the count an own playlist brings. Before concluding the
  // contents are withheld outright, ask the detail endpoint itself the way the
  // items endpoint was asked: a `fields` projection, a market, additional_types.
  // The variants in [3] were all aimed at /items and never at this.
  if (!finding.embedded) {
    console.log('\n[1b] The playlist object, asked differently');
    const asks = [
      ['fields=items(…)', 'fields=items(items(item(id,name,type,uri,duration_ms,explicit,artists(name),album(images))),total,limit,offset,next)'],
      ['fields=tracks(…)', 'fields=tracks(items(track(id,name,type,uri)),total)'],
      ['fields=name,items', 'fields=name,items'],
      ['market=from_token', 'market=from_token'],
      ['additional_types', 'additional_types=track,episode'],
    ];
    for (const [label, q] of asks) {
      const res = await api(accessToken, `/playlists/${id}?${q}`);
      const bucket = res.body?.items ?? res.body?.tracks;
      const entries = Array.isArray(bucket?.items) ? bucket.items.length : null;
      console.log(
        `    ${label.padEnd(18)} -> ${res.status} ` +
          (entries !== null
            ? `✓ ${entries} ENTRIES — this is the way in`
            : bucket?.total !== undefined
              ? `count only (${bucket.total})`
              : 'still no contents'),
      );
    }
  }

  // --- 2. The endpoint the app uses today ------------------------------------
  const query = 'limit=50&offset=0&additional_types=track,episode';
  const items = await api(accessToken, `/playlists/${id}/items?${query}`);
  finding.items = items.status;
  console.log(`\n[2] GET /playlists/${id}/items?${query} -> ${items.status}`);
  if (items.ok) {
    console.log(`    ✓ Allowed. ${items.body?.items?.length} entries, total ${items.body?.total}.`);
  } else {
    const verbatim = JSON.stringify(items.body);
    console.log('    ✗ Refused, verbatim:', verbatim);
    // src/api/client.ts turns a 403 whose body mentions Premium into
    // PremiumRequiredError, and the fallback deliberately does not fire for
    // that one. If this refusal says "premium", the check has to change.
    if (items.status === 403) {
      console.log(
        `    body matches client.ts's /premium/i test: ${
          /premium/i.test(verbatim) ? 'YES — isForbidden must be revisited' : 'no'
        }`,
      );
    }
    // The tile subtitle asks the same endpoint for one entry; it 403s here too.
    const one = await api(accessToken, `/playlists/${id}/items?limit=1`);
    console.log(`    …and the count-only request (limit=1) -> ${one.status}`);
  }

  // --- 3. Does any parameter lift the refusal? -------------------------------
  console.log('\n[3] Same request, varied');
  if (items.ok) {
    console.log('    Skipped — [2] was allowed, there is nothing to lift.');
  } else {
    const variants = [
      ['market=from_token', 'limit=50&offset=0&additional_types=track,episode&market=from_token'],
      ['fields only', `limit=50&offset=0&fields=${encodeURIComponent('total,items(item(name,uri,type))')}`],
      ['no additional_types', 'limit=50&offset=0'],
      ['bare, no query at all', ''],
    ];
    for (const [label, q] of variants) {
      const res = await api(accessToken, `/playlists/${id}/items${q ? `?${q}` : ''}`);
      const verdict = res.ok
        ? `✓ ALLOWED — ${res.body?.items?.length} entries. This beats the fallback.`
        : `✗ ${res.status}`;
      console.log(`    ${label.padEnd(22)} ${verdict}`);
    }
  }

  // --- 4. Can the embedded page be walked past its first page? ---------------
  //
  // Two ways it might: the detail object may take offset/limit itself, or its
  // `next` may be followable. Either one is the difference between showing the
  // first hundred songs and showing all of them.
  console.log('\n[4] Getting past the first embedded page');
  const next = finding.embedded?.next;
  if (!finding.embedded) {
    console.log('    Skipped — no embedded page to walk.');
  } else {
    const paged = await api(accessToken, `/playlists/${id}?offset=100&limit=50`);
    const pagedPage = paged.body?.items ?? paged.body?.tracks;
    finding.detailPages = pagedPage?.offset === 100;
    console.log(
      `    GET /playlists/${id}?offset=100&limit=50 -> ${paged.status}, ` +
        `page offset=${pagedPage?.offset}, ${pagedPage?.items?.length ?? 0} entries` +
        (finding.detailPages
          ? '  ✓ the detail object pages — the fallback can walk'
          : '  (offset ignored — the embedded page is all there is)'),
    );
  }

  if (finding.embedded && !next) {
    console.log('    No `next` — the embedded page is the whole playlist.');
  } else if (finding.embedded && next) {
    const walked = await follow(accessToken, next);
    console.log(`    ${next}`);
    console.log(
      `    -> ${walked.status}` +
        (walked.ok
          ? ` ✓ followable, ${walked.body?.items?.length} more entries`
          : ` ✗ ${JSON.stringify(walked.body)}`),
    );
    finding.nextFollowable = walked.ok;
  }

  // --- 5. Playing it, if asked -----------------------------------------------
  console.log('\n[5] Playback by context URI');
  if (!PLAY) {
    console.log('    Skipped. Re-run with --play to test (it makes noise).');
  } else if (!finding.foreign) {
    console.log('    Skipped — playing an own playlist proves nothing new.');
  } else {
    const devices = await api(accessToken, '/me/player/devices');
    const target = (devices.body?.devices ?? [])[0];
    if (!target) {
      console.log('    Skipped — no Connect device available.');
    } else {
      const res = await api(accessToken, `/me/player/play?device_id=${target.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          context_uri: `spotify:playlist:${id}`,
          offset: { position: 2 },
        }),
      });
      if (res.ok || res.status === 204) {
        // 202/204 only means the command was taken. What is actually playing is
        // the answer worth having, so ask.
        await new Promise((r) => setTimeout(r, 2000));
        const state = await api(accessToken, '/me/player?additional_types=track,episode');
        console.log(`    ✓ Accepted on ${target.name} (${res.status}).`);
        console.log(`      Now playing: ${state.body?.item?.name ?? '(nothing)'}`);
        console.log(`      Context    : ${state.body?.context?.uri ?? '(none)'}`);
        console.log('      Expected the THIRD song of the playlist.');

        // The last place the songs of a refused playlist might be readable:
        // once it is playing, the queue is Spotify telling us what comes next.
        // Not a list of the playlist, and it costs a kid pressing play first —
        // but if this answers, a „was kommt" list is possible where a real one
        // is not.
        const queue = await api(accessToken, '/me/player/queue');
        const upcoming = queue.body?.queue ?? [];
        console.log(`\n      GET /me/player/queue -> ${queue.status}`);
        if (queue.ok) {
          console.log(`      ${upcoming.length} upcoming, in order:`);
          for (const song of upcoming.slice(0, 10)) {
            console.log(`        - ${song?.name} (${song?.type})`);
          }
        } else {
          console.log('      ', JSON.stringify(queue.body));
        }

        /*
         * And the tap. A song read off the queue has no position in the
         * playlist — the queue never says where in it anything sits — so the
         * only way to start it and keep the playlist running is to name it.
         * This is what every row of the „Was kommt" list does.
         */
        const tapped = upcoming[3] ?? upcoming[0];
        if (tapped?.uri) {
          console.log(`\n      Tapping the queue song „${tapped.name}"`);
          const jump = await api(accessToken, `/me/player/play?device_id=${target.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              context_uri: `spotify:playlist:${id}`,
              offset: { uri: tapped.uri },
            }),
          });
          if (jump.ok || jump.status === 204) {
            await new Promise((r) => setTimeout(r, 2000));
            const after = await api(accessToken, '/me/player?additional_types=track,episode');
            const landed = after.body?.item?.uri === tapped.uri;
            console.log(
              `      -> ${jump.status}, now playing: ${after.body?.item?.name}` +
                (landed
                  ? '  ✓ offset.uri works on a foreign context'
                  : '  ✗ landed somewhere else — the tap needs another way'),
            );
            console.log(`      Context still: ${after.body?.context?.uri ?? '(none)'}`);
          } else {
            console.log(`      ✗ Refused (${jump.status}):`, JSON.stringify(jump.body));
          }
        }
      } else {
        console.log(`    ✗ Refused (${res.status}):`, JSON.stringify(res.body));
      }
    }
  }
}

// --- Summary ----------------------------------------------------------------
console.log(`\n${'='.repeat(72)}\nSummary\n`);
for (const f of findings) {
  const where = f.foreign === null ? 'unreadable' : f.foreign ? 'foreign' : 'own';
  const embedded = f.embedded
    ? `${f.embedded.count} of ${f.embedded.total} embedded under "${f.embedded.key}"` +
      (f.detailPages ? ', pages further' : '') +
      (f.nextFollowable === undefined
        ? ''
        : f.nextFollowable
          ? ', next followable'
          : ', next refused')
    : 'no entries embedded';
  console.log(`  ${f.name} (${where})`);
  console.log(`    /items -> ${f.items ?? '—'} | detail response: ${embedded}`);
}
console.log(
  '\nThe fix is on if a FOREIGN playlist shows /items -> 403 and entries embedded.\n' +
    'If a foreign playlist embeds nothing, no API path exists and the screen has\n' +
    'to say so instead — see the plan.\n',
);

process.exit(0);
