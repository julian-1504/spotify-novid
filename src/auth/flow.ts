/** Kicking off and completing the OAuth redirect dance. */

import { CLIENT_ID, redirectUri, SCOPES } from '../config';
import { t } from '../strings';
import { challengeFor, randomVerifier } from './pkce';
import { exchangeCode } from './tokens';

const AUTHORIZE_ENDPOINT = 'https://accounts.spotify.com/authorize';
// sessionStorage, not localStorage: this is single-use and must not outlive the
// redirect it belongs to.
const VERIFIER_KEY = 'novid.pkce.verifier';
const STATE_KEY = 'novid.pkce.state';

export async function beginLogin(): Promise<void> {
  if (!CLIENT_ID) {
    throw new Error(
      'VITE_SPOTIFY_CLIENT_ID is not set. Copy .env.example to .env and add your client ID.',
    );
  }

  const verifier = randomVerifier();
  const state = randomVerifier().slice(0, 32);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
    state,
    scope: SCOPES.join(' '),
  });

  window.location.assign(`${AUTHORIZE_ENDPOINT}?${params}`);
}

/** Handles the `/callback` route. Throws with a readable message on failure. */
export async function completeLogin(search: string): Promise<void> {
  const params = new URLSearchParams(search);

  const error = params.get('error');
  if (error) {
    throw new Error(
      error === 'access_denied' ? t.login.cancelled : `Spotify: ${error}`,
    );
  }

  const code = params.get('code');
  const state = params.get('state');
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const expectedState = sessionStorage.getItem(STATE_KEY);

  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);

  if (!code || !verifier) {
    throw new Error(t.login.incomplete);
  }
  if (!state || state !== expectedState) {
    throw new Error(t.login.unverified);
  }

  await exchangeCode(code, verifier, redirectUri());
}
