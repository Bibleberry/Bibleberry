import {
  DEFAULT_CHALLENGE_ORIGIN,
  parseChallengeOrigin,
  type ChallengeOrigin,
} from '../cms/reader/challengeOrigin.ts'

/**
 * Trusted Challenge return-origin contract (Harbor Signal, R06 G04-A).
 *
 * A Challenge's return origin decides where explicit `Exit` / `Finish` go. It may only come
 * from navigation state the app itself recorded during this session: the `challengeOrigin`
 * value an in-app opener (Today Hub Continue, Month Screen, ...) writes into
 * `window.history.state`, or the equivalent in-memory value a navigation model holds.
 * `history.state` is written only by same-origin script and survives reload and Back/Forward
 * for that history entry, so it is the in-session record.
 *
 * Everything else is untrusted ingress metadata and is never used as a return target:
 * - hash query parameters such as `#/challenge/<slug>?origin=month&yearMonth=2026-10`
 * - the page query string (`location.search`)
 * - external https / custom-scheme URLs handled by `src/deepLinkIngress`
 * - native app-open URLs (cold start or resume)
 *
 * Those values can still be parsed for backward-compatible link formats, but a Challenge
 * opened without an in-session origin is an **external entry**: its origin is
 * `DEFAULT_CHALLENGE_ORIGIN` (`{ kind: 'hub' }`) and `Exit` / `Finish` return to Today.
 *
 * Consumers (the legacy `App.tsx` shell today, the R06 navigation model later) should:
 * 1. Call `resolveTrustedChallengeReturn(sessionOrigin)` with only the value they recorded
 *    themselves, never with anything derived from a URL.
 * 2. Treat `entry: 'external'` as "return to Today", and must not promote an external entry
 *    to an in-session one by writing its default origin back into session state.
 * 3. Keep content authorization independent of origin: an origin never makes unreleased,
 *    embargoed or withdrawn content readable.
 */

export type ChallengeEntry = 'inSession' | 'external'

export interface TrustedChallengeReturn {
  readonly origin: ChallengeOrigin
  readonly entry: ChallengeEntry
}

export const EXTERNAL_CHALLENGE_RETURN: TrustedChallengeReturn = Object.freeze({
  origin: DEFAULT_CHALLENGE_ORIGIN,
  entry: 'external',
})

const KNOWN_ORIGIN_KINDS = new Set(['hub', 'month', 'shelf', 'library'])

/**
 * Resolves the return origin from in-session navigation state only.
 *
 * `sessionOrigin` must be the value the app recorded itself (for example
 * `history.state.challengeOrigin`). A missing or malformed value means the Challenge was not
 * opened by in-app navigation, so the result is an external entry that returns to Today.
 */
export function resolveTrustedChallengeReturn(sessionOrigin: unknown): TrustedChallengeReturn {
  if (!sessionOrigin || typeof sessionOrigin !== 'object' || Array.isArray(sessionOrigin)) {
    return EXTERNAL_CHALLENGE_RETURN
  }

  const kind = (sessionOrigin as Record<string, unknown>).kind
  if (typeof kind !== 'string' || !KNOWN_ORIGIN_KINDS.has(kind)) {
    return EXTERNAL_CHALLENGE_RETURN
  }

  const origin = parseChallengeOrigin(sessionOrigin)
  // A Month origin without a valid month degrades to the Hub default; that is no longer
  // the destination the opener recorded, so do not claim it as in-session.
  if (kind === 'month' && origin.kind !== 'month') {
    return EXTERNAL_CHALLENGE_RETURN
  }

  return Object.freeze({ origin, entry: 'inSession' })
}
