/**
 * The PKCE loopback sign-in shared by the Step-0 spikes.
 *
 * Extracted so scripts/spike.mjs and scripts/spike-player.mjs run the same
 * flow rather than keeping two copies of it that drift apart. The scopes differ
 * between the two, so they are a parameter rather than a constant here.
 *
 * `signIn` returns the raw token response, refresh token included, because a
 * caller may need it in memory. **Do not print it.** Both spikes used to, as a
 * convenience for poking at the API by hand afterwards, which left a live
 * credential for a child's Spotify account sitting in terminal scrollback and
 * in any file the output was piped to. Deleting the file afterwards does not
 * revoke the grant — it stays valid for six months.
 *
 * Register http://127.0.0.1:8888/callback as a redirect URI in the dashboard
 * first. Loopback HTTP is permitted; `localhost` is explicitly banned.
 */

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

export const PORT = 8888;
export const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;

const base64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Opens a URL in the user's browser. Best effort; harmless if it fails.
 *
 * SPIKE_NO_BROWSER suppresses it, so the loopback routes can be exercised
 * without a window appearing.
 */
export function openBrowser(url) {
  if (process.env.SPIKE_NO_BROWSER) return;
  // The URL must be quoted, and quoted by us. `cmd` treats `&` as a command
  // separator, and Node only quotes arguments containing spaces — so an
  // unquoted OAuth URL arrives at the browser truncated at its first
  // parameter, and Spotify then reports a missing response_type and an
  // unmatched redirect_uri. Verbatim args keep our quotes intact.
  spawn('cmd', ['/c', 'start', '""', `"${url}"`], {
    windowsVerbatimArguments: true,
    detached: true,
    stdio: 'ignore',
  }).on('error', () => {});
}

/**
 * Runs the authorization-code + PKCE flow.
 *
 * `routes` lets a caller serve extra paths from the same loopback server — the
 * player spike needs one, because the SDK requires a secure context and
 * 127.0.0.1 is the only one available without TLS.
 *
 * The server is handed back still listening; the caller closes it when done.
 */
export async function signIn(clientId, scopes, routes = {}) {
  const verifier = base64url(randomBytes(64));
  const challenge = base64url(createHash('sha256').update(verifier).digest());

  const authUrl =
    'https://accounts.spotify.com/authorize?' +
    new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      scope: scopes.join(' '),
    });

  let server;
  const code = await new Promise((resolve, reject) => {
    server = createServer(async (req, res) => {
      const url = new URL(req.url, REDIRECT_URI);

      const route = routes[url.pathname];
      if (route) {
        await route(req, res, url);
        return;
      }

      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }

      const returned = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<h1>${returned ? 'Done — back to the terminal.' : 'Failed: ' + error}</h1>`,
      );
      if (returned) resolve(returned);
      else reject(new Error(error ?? 'no code returned'));
    });
    server.listen(PORT, '127.0.0.1');

    console.log('\nOpen this URL and sign in as the account you want to test:\n');
    console.log(authUrl + '\n');
    openBrowser(authUrl);
  });

  const tokens = await exchange(clientId, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });

  return { ...tokens, server };
}

export async function exchange(clientId, body) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, ...body }),
  });
  if (!res.ok) throw new Error(`token: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Thin Web API caller that never throws on a non-2xx, so spikes can report it. */
export async function api(accessToken, path, init = {}) {
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
