/**
 * What to tell a kid when this phone refuses to become a player, and whether
 * signing in again would actually help.
 *
 * Pure and separate from the UI, like devices/allowlist.ts next door, because
 * the interesting part is a policy rather than a layout — in particular the one
 * rule below that stops a kid being sent round a loop that cannot end.
 */

import type { HelpTopicId } from '../help/topics';
import { t } from '../strings';
// Type-only, so this module stays importable without the SDK or a DOM.
import type { WebPlaybackFailure } from './webPlayback';

export interface SelfFailure {
  kind: WebPlaybackFailure;
  message: string;
  /** The Hilfe topic this failure deep-links to. */
  topic: HelpTopicId;
  /** Whether to offer „Neu anmelden" alongside the message. */
  offerReauth: boolean;
}

export function describeFailure(kind: WebPlaybackFailure): SelfFailure {
  switch (kind) {
    /**
     * The one case a fresh authorization fixes — and it covers two situations
     * the SDK cannot tell apart: a grant that is genuinely dead, and a grant
     * that is perfectly alive but predates the `streaming` scope. Signing in
     * again is the cure for both, which is why the offer can be made without
     * knowing which one it is.
     */
    case 'auth':
      return {
        kind,
        message: t.player.selfErrors.auth,
        topic: 'anmelden',
        offerReauth: true,
      };

    /**
     * Never offers it. Signing in again cannot buy a Premium subscription, so
     * the button would send a kid through the password dance to arrive back at
     * exactly this message. It points at a grown-up instead, because only one
     * can fix it.
     */
    case 'premium':
      return {
        kind,
        message: t.player.selfErrors.premium,
        topic: 'anmelden',
        offerReauth: false,
      };

    // The SDK never arrived. Nothing to do with the account.
    case 'offline':
    case 'timeout':
      return {
        kind,
        message: t.player.selfErrors.offline,
        topic: 'kein-internet',
        offerReauth: false,
      };

    case 'unsupported':
      return {
        kind,
        message: t.player.selfErrors.unsupported,
        topic: 'handy-abspielen',
        offerReauth: false,
      };
  }
}
