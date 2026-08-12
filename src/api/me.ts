/**
 * Who is signed in.
 *
 * Deliberately not routed through `apiRequest`: that resolves the bearer token
 * from storage via the active account, and this call happens at the one moment
 * when there is no account to resolve — straight after the OAuth exchange, when
 * the profile is what tells us which account to file the new tokens under.
 * Taking the token as an argument breaks that chicken-and-egg.
 */

import type { UserProfile } from './types';

const ME_ENDPOINT = 'https://api.spotify.com/v1/me';

export async function fetchProfile(accessToken: string): Promise<UserProfile> {
  const res = await fetch(ME_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Could not read the Spotify profile (${res.status})`);
  }

  return (await res.json()) as UserProfile;
}

/** What the switcher shows: a real name where there is one, else the id. */
export const profileName = (profile: UserProfile): string =>
  profile.display_name?.trim() || profile.id;
