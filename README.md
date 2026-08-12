# Music & Podcasts — an audio-only Spotify client

A small installable web app (PWA) that gives kids search, albums, artists,
playlists and podcasts from Spotify, plays them on the speakers around the
house, and offers no way whatsoever to watch video.

It is a **Spotify Connect remote control**. It never handles an audio or video
stream itself — it browses the catalogue and tells a speaker what to play.

## How "no video" is guaranteed

Three independent layers:

1. **The app renders no video.** There is no `<video>`, no `<iframe>`, no
   embed. `npm run check:novideo` scans both `src/` and the built bundle, and
   fails if one ever appears. Scanning source is the layer that matters: JSX
   compiles to `jsx("iframe", …)`, so a bundle-only scan has to know exactly
   what the compiler emits, whereas an `<iframe>` in a `.tsx` file is plain text
   no bundler can rename. `scripts/no-video-patterns.test.mjs` asserts the
   patterns still catch every form, so the check cannot quietly rot into a
   no-op.
2. **Playback targets are restricted to audio-only devices** by the build-time
   allowlist in `src/config.ts`. A TV, a video Chromecast, or a games console is
   never offered as a target. The filter is allowlist-first, so an unrecognised
   device type is hidden rather than offered.
3. **A speaker has no screen.** A video podcast played to one is just audio.

The allowlist lives in a committed file rather than an in-app settings screen on
purpose: a settings screen would let a kid add the living-room TV back.

## Setup

### 1. Create the Spotify app

At <https://developer.spotify.com/dashboard>, create an app and add these
redirect URIs:

- `http://127.0.0.1:5173/callback` — local development
- `http://127.0.0.1:8888/callback` — the spike script below
- `https://your-domain/callback` — production

Spotify requires HTTPS for real hosts and explicitly bans `localhost`; the
`127.0.0.1` loopback form is the permitted local exception.

Then add every family member's Spotify account to the app's user allowlist.
**Development Mode allows a maximum of five users**, and the app owner must keep
an active Premium subscription or the whole thing stops working.

### 2. Run the Step-0 checks before trusting anything

```bash
npm install
npm run spike -- <your-client-id>
```

This signs in, then reports:

1. whether the account is Premium (playback control is Premium-only),
2. **every Connect device the account can see, with its exact `type` string**,
3. optionally, whether podcast episode playback works
   (`npm run spike -- <client-id> <episode-id>`).

Check (2) is the important one. Spotify only documents three device type
strings, so paste what your speakers actually report into
`ALLOWED_DEVICE_TYPES` in `src/config.ts`. A real Chromecast Audio reports
`"CastAudio"` — mixed case — which is why the allowlist compares
case-insensitively.

Both open questions from the design have since been confirmed against real
hardware: a Chromecast Audio is discovered and controllable, and playing a
podcast episode by URI works (so the show-from-episode-1 fallback in
`playEpisode` is a safety net, not the normal path). If a kid's account sees no devices at
all, connect to the speaker once from the official Spotify app with that
account — the Web API only lists devices the account already knows about.

For the tightest possible setting, put your speakers' device IDs into
`ALLOWED_DEVICE_IDS` and nothing else will ever be selectable.

### 2b. Register each speaker, once per account

A speaker is not permanently attached to a Spotify account. It only appears in
the Web API after that account has connected to it at least once — normally when
the official Spotify app discovers it on the local network and hands over
credentials. Until then `/me/player/devices` returns an empty list and this app
has nothing to play to.

To register one:

1. Open the official Spotify app signed in as the account in question.
2. Start playing anything.
3. Use the Connect / devices button and pick the speaker.
4. Once audio is coming out of it, the speaker shows up in this app.

**Do this once for every family member's account.** Device visibility is
per-account, so a speaker registered by the parent's login is still invisible to
a kid's login until that kid's account connects to it too. Same applies to any
newly added speaker.

If the picker is empty, the app now tells you which of the two problems you have:
*"No speaker found"* means Spotify reported no devices at all (nothing switched
on, or not yet registered as above), while *"No speaker available"* means devices
were found but every one was rejected — and it lists each with the reason, e.g.
`Living room TV (tv — can show video)`.

### 3. Run it

```bash
cp .env.example .env     # then set VITE_SPOTIFY_CLIENT_ID
npm run dev              # http://127.0.0.1:5173
```

### 4. Deploy

Any static host with HTTPS works (Cloudflare Pages, Netlify, GitHub Pages). It
is a pure static build with no backend — PKCE means there is no client secret to
protect.

```bash
npm run build            # output in dist/
```

**Set `VITE_SPOTIFY_CLIENT_ID` in the host's build environment**, not just locally.
`.env` is deliberately not in the repo, so a CI build without that variable produces
a bundle with an empty client ID and the app fails at the first login attempt with
*"VITE_SPOTIFY_CLIENT_ID is not set"* — a failure that does not reproduce locally,
where `.env` is present.

The client ID ends up in the published JavaScript, because Vite inlines `VITE_`-prefixed
variables at build time. That is expected and not a leak: PKCE public clients have no
client secret, and the ID is already visible in the authorize URL during every sign-in.
It is not worth rotating if you spot it in the bundle. What actually protects the app is
the redirect URI allowlist in the dashboard — a client ID used with an unregistered
redirect URI is rejected outright.

`public/_redirects` already configures the SPA fallback for Cloudflare Pages and
Netlify. It is not optional: `/callback` is a client-side route with no file
behind it, so without the fallback the host 404s in the middle of signing in —
a failure that does not reproduce in dev. On other hosts, configure the
equivalent rewrite yourself.

Then add the production `/callback` URL to the dashboard. On the kid's phone,
open the site in Chrome and use **Add to Home screen**.

#### Deploying from GitHub Actions

`.github/workflows/deploy.yml` does the above for Cloudflare Pages. It is
**manual only** — Actions tab → *Deploy to Cloudflare Pages* → **Run workflow**,
then pick `preview` or `production`. Nothing deploys on push or merge.

The workflow lints, tests, builds and runs `check:novideo` before uploading, so a
deploy cannot ship a bundle containing a video surface. It uses
Direct Upload, meaning the bundle is built in Actions and pushed as static
assets; Cloudflare never builds, and since the app has no Pages Functions it
consumes no Workers request quota.

##### One-time setup

**Create the Pages project first.** It has to exist before the first workflow
run: `wrangler pages deploy` cannot create a project non-interactively.

Easiest from the CLI, which is immune to the dashboard reshuffling described
below:

```powershell
$env:CLOUDFLARE_API_TOKEN = "<token>"
$env:CLOUDFLARE_ACCOUNT_ID = "<account id>"
npx wrangler pages project create spotify-novid --production-branch=main
```

`--production-branch=main` is load-bearing: the workflow passes `--branch=main`
for a production deploy, and Pages only counts a deploy as production when that
branch matches the project's production branch. Mismatch them and every run
lands as a preview without saying so. If you use a different name, change
`PRODUCTION_BRANCH` in the workflow to match.

The workflow also refuses a `production` run from any branch other than that one,
so the live site only ever ships what is on `main`.

In the dashboard the entry is under **Compute & AI → Workers & Pages** →
**Create** → **Pages** → **Upload assets**. Cloudflare's own docs still say to
"go to the Workers & Pages page" as a top-level item, which is stale — and the
entry is account-scoped, so it disappears entirely while you are inside a
domain's settings. <https://dash.cloudflare.com/?to=/:account/workers-and-pages>
goes straight there.

Either way choose Direct Upload rather than the Git integration: the Git
integration would have Cloudflare build the app, which bypasses the gates above.

**Create the API token.**

1. Go to <https://dash.cloudflare.com/profile/api-tokens> (profile icon → **My
   Profile** → **API Tokens**). To have the token survive you being removed from
   the account, use **Manage Account → API Tokens** instead for an account-owned
   token; the remaining steps are identical.
2. **Create Token**.
3. Scroll past the templates to **Create Custom Token** → **Get started**. None
   of the templates fit, and all of them grant more than a deploy needs.
4. Name it something recognisable later, e.g. `github-actions-spotify-novid`.
   This name is all you get when auditing tokens in six months.
5. Under **Permissions**, add exactly one row: **Account** → **Cloudflare Pages**
   → **Edit**. The first dropdown must be *Account*, not *User* or *Zone*.
   Nothing else is needed.
6. Under **Account Resources**, select **Include** and your specific account
   rather than leaving *All accounts*.
7. Leave **Client IP Address Filtering** empty. GitHub-hosted runners come from a
   large rotating IP range, so pinning IPs here breaks deploys unpredictably.
8. Leave **TTL** empty unless you want the token to expire. An expiry is good
   hygiene, but the failure mode is a deploy that suddenly 403s months later with
   no obvious cause — set a calendar reminder if you use one.
9. **Continue to summary**. It should read *"Cloudflare Pages: Edit — for account
   \<yours\>"*. If it lists more than that, go back.
10. **Create Token**, then copy the value immediately. It is shown once and can
    only be regenerated, never retrieved.

**Find the Account ID.** Simplest is to read it out of the dashboard URL — it is
the hex string in `dash.cloudflare.com/<account-id>/...`. It is also shown with a
copy button in the right-hand sidebar of the Workers & Pages page.

**Add three repository secrets** under Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | from step 10 above |
| `CLOUDFLARE_ACCOUNT_ID` | from the sidebar |
| `VITE_SPOTIFY_CLIENT_ID` | your Spotify client ID |

Or with the `gh` CLI, which prompts for each value:

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set VITE_SPOTIFY_CLIENT_ID
```

The client ID is a secret here only for tidiness — it is public either way, as
explained above; storing it beside the Cloudflare credentials just keeps all
three in one place.

To sanity-check the token without deploying:

```bash
curl -s -H "Authorization: Bearer <token>" \
  https://api.cloudflare.com/client/v4/user/tokens/verify
```

`"status": "active"` means the token is live. That only proves it is valid, not
that it carries the Pages permission — the real confirmation is the first
`preview` run, which fails at the wrangler step with a 403 if the permission is
wrong.

A `preview` run deploys as `preview-<branch>`, so from `main` it lands on
<https://preview-main.spotify-novid.pages.dev>. The prefix is what keeps a
preview from ever matching the production branch — without it, a preview run on
a single-branch repo deploys straight to the live site.

Sign-in will not work on a preview unless that exact `/callback` URL is also
registered in the Spotify dashboard, since Spotify rejects unregistered redirect
URIs. Each deploy additionally gets a random per-deployment URL, which cannot be
registered in advance; only the `preview-<branch>` alias is stable enough. So
either register `https://preview-main.spotify-novid.pages.dev/callback`, or treat
previews as signed-out UI checks.

Note the site will be on a public URL. That is not a security problem — a
stranger only ever reaches a login screen, and Development Mode admits only your
five allowlisted accounts — but anyone with the link can see that screen. Put it
behind Cloudflare Access if that bothers you.

## The Hilfe tab

The app is in German, aimed at roughly 10–13 year olds, so the kids can fix the
common faults without fetching an adult. The third nav tab has:

- a **live status panel** — Internet / Angemeldet / Box as ✅ or ❌, plus a
  „Nochmal suchen“ button that refetches the device list;
- **eight troubleshooting topics** (`src/help/topics.ts`), each a short intro and
  3–4 numbered steps.

Error states deep-link into the matching topic via `/hilfe?thema=<id>`, so a kid
who taps „Was kann ich tun?“ in the empty speaker picker lands on the answer
rather than a list. A test walks the source for those links and fails if one
points at a topic that no longer exists.

Two deliberate choices worth knowing:

- **The "no speaker" topic stops at "ask a grown-up."** The real fix is the
  handoff described above, which needs the official Spotify app — the app the
  kids are not meant to be using. So they get the three checks they *can* do
  (switched on, right Wi-Fi, search again) and then hand over.
- **There is a topic explaining that missing video is intentional.** Otherwise a
  kid reasonably concludes the app is broken and reports it as a bug.

All user-facing text lives in `src/strings.ts` — reword anything there to suit
your own kids; code comments and identifiers stay English.

## Sessions

Kids sign in once. Closing the app, switching apps and rebooting the phone do
not trigger a login: the refresh token is persisted and swapped for a new access
token silently at launch.

**Except every six months.** Spotify expires refresh tokens six months after the
*original* authorization, and refreshing does not reset that clock. When it
happens the app shows an "ask a parent" screen, because re-authorizing means
entering the Spotify password.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on `127.0.0.1:5173` |
| `npm run build` | Production build into `dist/` |
| `npm test` | Unit tests (device allowlist) |
| `npm run check:novideo` | Fails if any video surface is in `src/` or `dist/` |
| `npm run spike -- <client-id>` | Step-0 account/device/podcast checks |
| `node scripts/make-icons.mjs` | Regenerate PWA launcher icons |

## Things worth knowing

- **This is an alternative, not a lock.** Nothing here stops a kid opening
  `open.spotify.com` or reinstalling the Spotify app. Enforcement is a device
  policy question (Family Link, DNS filtering), not an app one.
- **Five users maximum**, and no hobbyist path past it — extended API quota now
  requires a registered business and 250k monthly active users.
- **The official Spotify app must stay installed somewhere**, because that is
  what registers speakers against an account in the first place.
- **Built against the February 2026 API.** Batch fetch endpoints, browse, artist
  top tracks and `/playlists/{id}/tracks` are gone; search caps at 10 results per
  page. Don't reintroduce them from older documentation.
