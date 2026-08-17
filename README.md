# Klangkiste — an audio-only Spotify client

A small web app that gives kids search, albums, artists, playlists and podcasts
from Spotify, plays them on the speakers around the house, and offers no way
whatsoever to watch video. It runs in any browser, and ships as an Android app
(`android/`) for phones under Family Link — see *[The Android app](#the-android-app)*
for why that wrapper is not optional there.

It is a **Spotify Connect remote control**. It never handles an audio or video
stream itself — it browses the catalogue and tells a speaker what to play.

## How "no video" is guaranteed

Four layers. Read the fourth before trusting the first — since the app gained
the ability to play on the phone itself, the static check no longer sees
everything that runs.

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
4. **A runtime DOM guard** (`src/player/domGuard.ts`) watches the live document
   for the whole session and stops the app dead if a `<video>` element or any
   iframe other than the SDK's appears.

The allowlist lives in a committed file rather than an in-app settings screen on
purpose: a settings screen would let a kid add the living-room TV back.

### Why layer 4 had to exist

Layer 1 scans `src/` and `dist/`. That covered everything until the app started
using the **Web Playback SDK** to play on the phone itself. The SDK is fetched
from `sdk.scdn.co` at runtime and injects a cross-origin iframe — so it appears
in neither directory, and `npm run check:novideo` would go on printing ✓ while a
frame this project never compiled sat in the page. Worse, Spotify can change
what is inside that frame without anyone here rebuilding anything.

So the guarantee gained a half that runs in the browser. It allows exactly one
iframe origin, matched by parsed origin rather than by `startsWith` — a prefix
test would accept `https://sdk.scdn.co.attacker.example`. When it trips it tears
playback down and shows a stop screen, rather than logging and continuing.

**Its limit, which cannot be engineered away:** same-origin policy means the
*inside* of Spotify's frame is not inspectable. Layer 4 guarantees this
document, not that one. What makes that tolerable is layer 3 — a speaker has no
screen, and that holds no matter what any script does. It is the only layer that
survives an adversarial SDK, which is why it is worth keeping even though it
looks like the most obvious of the four.

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

### 2a. Can the phone itself be the box?

Podcasts are the one thing Connect cannot deliver everywhere: Spotify classifies
them as *mixed media* and withholds them from audio-only devices, so an Echo Dot
accepts the command, reports that it is playing, and stays silent. The way out
under consideration is the Web Playback SDK — the phone becomes the Connect
device, and the box is reached over Bluetooth instead of over Spotify.

That rests on an assumption: a browser is not an audio-only device, so mixed
media should not be withheld from it. Settle it before building on it.

```bash
npm run spike:player -- <client-id> <episode-id> [track-id]
```

It boots the SDK, reports the exact `type` the phone-device presents to
`/me/player/devices`, plays a music track as a control, then plays a podcast
episode — and prints one of three verdicts. It also reports what the SDK puts in
the page, which is the part `npm run check:novideo` structurally cannot see: the
SDK is fetched from `sdk.scdn.co` at runtime, so it appears in neither `src/` nor
`dist/`.

**Run it on a kid's actual phone**, not just a desktop — that is the case that
matters and the one the SDK is flakiest on. EME needs a secure context and a LAN
IP over plain HTTP is not one, so forward the port with `chrome://inspect` →
*Port forwarding* (8888 → `127.0.0.1:8888`) and the phone will treat it as
localhost.

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
install the Android app — *[The Android app](#the-android-app)*. **Add to Home
screen** in Chrome also works and needs nothing further, but on a phone managed
by Family Link it produces an icon that Chrome's own screen-time limit governs;
that is the whole reason the wrapper exists.

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

A preview build also says so in the tab: its title is „Prev-Klangkiste“, and
installed to a home screen it is called „Prev-Klangkiste“. Production is untouched.
The distinction is made at build time from the `DEPLOY_TARGET` variable the
workflow passes to `npm run build`, so it holds on the random per-deployment URL
too — not just on the `preview-<branch>` alias.

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

## The Android app

`android/` is a second front door onto the same deployment: one Activity, one
WebView, pointed at the URL you just deployed. It is not a fork of the web app
and not an offline copy — a Cloudflare deploy updates it too, and a content
change never needs a new APK. Everything in `src/` is untouched by it, and the
site keeps working in any browser exactly as before.

### Why it exists

Because of Family Link, and only that. Chrome's **Add to home screen** mints a
WebAPK, which does appear in Family Link as its own app with its own limit — but
that package is a shell. Launching it hands off to a Chrome activity that does
the rendering, so the foreground package is `com.android.chrome`, and Family
Link enforces on the foreground package. The consequences on a supervised phone:

- Chrome blocked or the device locked → the app is blocked with it.
- The app's own limit set to unlimited, or marked always-allowed → ignored,
  because Chrome's limit is the one being applied.

No manifest change fixes this. `display: standalone`, a manifest `id`, maskable
icons — none of them decide which package owns the activity. Rendering in our
own Activity does, and that is the whole content of this wrapper: to Family Link
the app is then `de.julian.klangkiste`, its limit applies, and always-allow
works. A Trusted Web Activity would *not* have helped, for what it is worth: it
renders through Chrome's Custom Tab activity and lands in the same place.

If the phones are not managed by Family Link, skip all of this and use **Add to
home screen**.

### Get it from GitHub

The normal way to get an APK onto a phone. **Actions → Build the Android app →
Run workflow**, which publishes to [Releases][releases] — no GitHub account
needed to download, so the phone's own browser can fetch it and tap to install.

Manual trigger only, for the reason `deploy.yml` is: a release APK is what ends
up on the kids' phones, so publishing one is a decision someone makes.

| Target | Package | Shows as | Published as | Opens |
|---|---|---|---|---|
| `preview` | `de.julian.klangkiste.preview` | Prev-Klangkiste | prerelease `preview-<branch>-<run>` | whatever `site_url` you give it |
| `release` | `de.julian.klangkiste` | Klangkiste | release `v<version>` | the production site |

```
https://github.com/julian-1504/spotify-novid/releases/download/v1.1.0/klangkiste-1.1.0.apk
```

A release additionally requires a `version` like `1.1.0` and must be run from
`main` — same rule as a production deploy. `versionCode` comes from the run
number, so it only ever climbs.

> **A preview is a second app, not a newer one.** The `.preview` suffix makes it
> a separate package, so it installs *beside* the real Klangkiste — which is the
> point when testing, but it also means Family Link sees another app with its
> own limit, independent of the real one. Give it a limit too, or uninstall it
> when you are done. Otherwise it is an unlimited second copy of the app, which
> is precisely what this wrapper exists to prevent.

Whatever `site_url` a preview points at must have `/callback` registered in the
Spotify dashboard. That is why it is typed in rather than derived from the
branch: Cloudflare slugs and truncates branch names to 28 characters, so a
branch like `claude/pwa-family-link-chrome-lq75uh` yields a host nobody can
predict — and an unpredictable host cannot be registered in advance.

Before the first run, four repository secrets (Settings → Secrets and variables
→ Actions), all from the keystore described under *[Build it](#build-it)*:

| Secret | What |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 klangkiste.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | its store password |
| `ANDROID_KEY_ALIAS` | `klangkiste` |
| `ANDROID_KEY_PASSWORD` | its key password |

Publishing the APK to a public repo is safe: it holds no secret. There is no
`assets/` directory and no bundled web code — the app is a WebView onto the
deployed site — so the Spotify client ID never reaches it. The only
project-specific string compiled in is `SITE_URL`, which is in this repo
already. Anyone who installs it still has to sign in with their own account.

Both channels build the **release** variant, and the workflow refuses to publish
anything that fails a check on the built APK: debuggable, unsigned, signed with
the debug key, carrying any permission outside the five it is allowed
(`INTERNET` plus the four `PlaybackService` needs), not `targetSdk 34`,
wrong package, or a `SITE_URL` that does not match what was asked for. Debuggable
is the one that matters most — `adb run-as` into a debuggable app reads its data
directory, and that is where the WebView keeps a refresh token per account.

[releases]: https://github.com/julian-1504/spotify-novid/releases

### Build it

Locally, as a fallback or while changing the wrapper. Needs the Android SDK —
install Android Studio and open `android/`, or point `ANDROID_HOME` at a
command-line SDK. Then, from `android/`:

```bash
./gradlew assembleRelease     # app/build/outputs/apk/release/app-release.apk
./gradlew assemblePreview     # the .preview package, as CI's preview channel builds it
./gradlew assembleDebug       # local-only shortcut, installs beside the other two
```

`assembleDebug` is for a cable and a laptop, and stays that way: a debug build is
`android:debuggable`, which lets anyone with adb access read the app's data
directory — every account's Spotify refresh token. `preview` exists so a test
build need not make that trade; it inherits from `release` and differs only in
package id and which site it opens.

The site, version name and version code are all Gradle properties, so neither a
preview nor a release needs a source change:

```bash
./gradlew assemblePreview \
  -Pklangkiste.siteUrl=https://preview-main.spotify-novid.pages.dev \
  -Pklangkiste.versionName=1.2.3 -Pklangkiste.versionCode=42
```

The defaults live in `android/gradle.properties`, so a bare `./gradlew
assembleRelease` on a fresh clone still works.

Whatever URL you point it at must have its `/callback` registered in the Spotify
dashboard: the app's origin is that URL, not the APK, so `src/config.ts` derives
the same redirect URI it would in a browser.

A release build needs `android/keystore.properties`, untracked, holding paths
relative to `android/`:

```properties
storeFile=klangkiste.jks
storePassword=…
keyAlias=klangkiste
keyPassword=…
```

Create the keystore once with `keytool -genkeypair -v -keystore klangkiste.jks
-alias klangkiste -keyalg RSA -keysize 2048 -validity 10000`. It lives at
`android/klangkiste.jks`, in the working tree beside the build that uses it and
ignored by `*.jks`. CI does not read that copy — it decodes its own from
`ANDROID_KEYSTORE_BASE64` into the runner's temp directory, and an absolute
`storeFile` works just as well.

Two things about that file, both unrecoverable if got wrong:

- **Back it up somewhere off this machine.** Every later APK must be signed with
  the same key or it installs as a *different app* — new package identity, empty
  storage, and a Family Link entry that has to be configured again.
- **`git clean -xdf` will delete it**, because `-x` takes ignored files too. That
  is the cost of keeping it in the tree.

It must never be committed; the repo is public and a leaked signing key cannot be
un-leaked. `.gitignore` covers it, and a `pre-commit` hook refuses any staged
`.jks`, `.keystore` or `keystore.properties` as a backstop — that hook is local,
since `.git/hooks` is not cloned, so recreate it after a fresh clone.

### Put it on a phone

Sideloading, i.e. installing the file directly rather than from the Play Store:
open the [Releases][releases] page in the phone's browser and tap the `.apk`, or
`adb install -r app-release.apk` over USB from a laptop. Android will ask to
allow "install unknown apps" for whatever is doing the installing; on a Family
Link phone that prompt needs the parent to approve it on the device once.

Then, once:

- Remove the old home-screen PWA icon, so there is one icon and not two.
- Sign each account in again. The WebView has its own storage, so nothing
  carries over from Chrome — this is the „Frag bitte einen Erwachsenen" flow,
  once per account. Use the Spotify email and password at that prompt:
  *Continue with Google* is refused inside an embedded WebView.
- In Family Link, give „Klangkiste" whatever limit it should have. That is the
  point of the exercise — confirm it is enforced, and confirm the app still
  opens with Chrome blocked.

### What the wrapper is careful about

`MainActivity.kt` is short, and nearly every line in it is load-bearing; the
comments say why. Two are worth repeating here:

- **Navigation is confined to an allowlist** — the deployed site, plus Spotify's
  sign-in and 2FA hosts. Anything else opens in the system browser. Without that
  the wrapper is a browser with no content filter and no screen-time limit on a
  supervised phone, which would be a worse hole than the one being fixed.
  `open.spotify.com` is deliberately *not* on the list: it is the full Spotify
  web player, and it plays video.
- **`PROTECTED_MEDIA_ID` is granted** in `onPermissionRequest`. Spotify streams
  are DRM-protected, and a WebView denies Widevine unless asked; without it the
  phone quietly stops working as a box. Nothing else is granted.
- **The app is never allowed to become a cached process while it plays.**
  `PlaybackService` is a foreground service of type `mediaPlayback`, and
  `setRendererPriorityPolicy(RENDERER_PRIORITY_IMPORTANT, false)` stops Android
  waiving the renderer's priority the moment the WebView goes invisible. Both
  exist for the same reason: when this phone is the box, the Web Playback SDK
  runs *in the page*, so a frozen app is a stopped playlist. See below.

The no-video guarantee is unchanged by any of this: `npm run check:novideo` and
`src/player/domGuard.ts` cover the same surface, and the wrapper adds no content
entry point beyond the allowlist above.

## Playing on the phone (and why)

Spotify classifies podcasts as **mixed media** and withholds them from
audio-only Connect devices. An Echo Dot therefore accepts the play command,
reports that it is playing, and stays silent. Nothing in the Web API fixes that:
the app's `uris:[spotify:episode:…]` call is the supported one, and it succeeds.
The audio simply never comes out.

So the phone can be the playback device instead. `„Dieses Handy"` sits at the
top of the box picker; choosing it boots the Web Playback SDK, which registers
as an ordinary Connect device. **The box is then reached over Bluetooth**, as a
plain speaker Spotify never sees — which is why the restriction stops applying.
`npm run spike:player` confirmed an episode playing this way, with position
advancing and `type: "episode"`.

Everything downstream is unchanged: the SDK device is driven through the same
`/me/player/*` endpoints as any speaker, so `playEpisode`, seeking and the
pollers needed no changes at all.

Five things worth knowing:

- **The pairing is a one-off a kid must be told about.** Until the phone is
  paired to a box, the sound comes out of the phone. The now-playing bar says so
  and the Hilfe tab has two topics for it (`handy-abspielen`, `bluetooth`).
- **The SDK device reports `type: "Computer"`**, which `BLOCKED_DEVICE_TYPES`
  blocks on purpose. It is admitted by matching *both* the id the SDK minted
  this session *and* that type — an id-only exception would admit whatever
  device happened to carry a wrong id, a TV included. `computer` stays blocked,
  so every other desktop is still refused.
- **The phone now streams, not the box.** That spends the phone's battery and,
  away from wifi, its mobile data. Connect had the box stream directly.
- **The chosen phone is stored as a sentinel**, not as a device id. The SDK
  mints a new id every session, so storing the live one would have the
  miss-counter forget the choice about thirty seconds into every launch.
- **In the Android app a media notification appears while this phone plays** —
  cover, title and Zurück / Pause / Weiter, on the lock screen too. It is not
  decoration. The SDK lives in the page, so with the screen off Android used to
  freeze the app at the first track boundary: the song finished, the next one
  never started, and a kid had to unlock and press play for every single track.
  The notification is the visible half of the foreground service that prevents
  that (`android/…/PlaybackService.kt`), and the page's half is
  `src/player/nativeHost.ts`, fed by the SDK's own `player_state_changed` —
  `/me/player` is deliberately not polled while the app is hidden. In a browser
  none of it exists and nothing changes.

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

**And once, when you deploy the phone-as-player build.** It adds the `streaming`
scope (plus the two `user-read-*` scopes the SDK requires alongside it), and a
refresh token does not carry a scope that was not requested originally. So every
account has to sign in once more — the same "ask a parent" screen, for all five
at once. Worth deploying at a time when you are around to type passwords.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on `127.0.0.1:5173` |
| `npm run build` | Production build into `dist/` |
| `npm test` | Unit tests (device allowlist) |
| `npm run check:novideo` | Fails if any video surface is in `src/` or `dist/` |
| `npm run spike -- <client-id>` | Step-0 account/device/podcast checks |
| `npm run spike:player -- <client-id> <episode-id>` | Step-0 check: can the phone itself be the playback device? |
| `npm run spike:playlist -- <client-id>` | What this account may read of a playlist it does not own. Finds one to compare by searching; name your own with ids, `spotify:` URIs or share links |
| `node scripts/make-icons.mjs` | Regenerate the launcher icons, both the PWA's and the Android app's |
| `cd android && ./gradlew assembleRelease` | Build the Android APK locally — see [The Android app](#the-android-app) |
| Actions → **Build the Android app** | Publish an APK to Releases, preview or release — see [Get it from GitHub](#get-it-from-github) |

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
- **A playlist this account does not own cannot be listed at all — but it can be
  played.** `/playlists/{id}/items` answers a bare 403 for one it neither owns
  nor collaborates on, and `/playlists/{id}` then arrives with no `items` and no
  `tracks`: not the songs, not even a count. Neither `market`, nor `fields`, nor
  `additional_types` changes that on either endpoint. Playback is untouched —
  `context_uri` plus an `offset.position` plays such a playlist in order,
  `/me/player/queue` names the next twenty songs once it is running, and
  `offset.uri` jumps to one of them without losing the playlist. So the screen
  says what it cannot do, leaves *Abspielen* working, and lists the queue behind
  it as „Was als Nächstes kommt" — a list on the wrong side of the play button,
  which is the only side available. All of this was measured, not read:
  `npm run spike:playlist` re-runs the whole check, and is the thing to run
  before assuming any of it still holds.
