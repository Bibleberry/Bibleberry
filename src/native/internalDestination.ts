import {
  isValidChallengeYearMonth,
  serializeChallengeOriginToSearchParams,
  type ChallengeOrigin,
} from '../cms/reader/challengeOrigin.ts'
import {
  resolveTrustedChallengeReturn,
  type ChallengeEntry,
} from './trustedChallengeOrigin.ts'

export type InternalDestination =
  | { readonly type: 'month'; readonly yearMonth: string }
  | {
      readonly type: 'releasedChallenge'
      readonly slug: string
      readonly origin: ChallengeOrigin
      /**
       * `inSession` when `origin` came from app-recorded session state; `external` when the
       * Challenge was entered without one (cold link, reload of a typed URL, native ingress).
       * Optional only for `buildInternalDestination` callers; the parser always sets it.
       */
      readonly entry?: ChallengeEntry
    }

export interface InternalDestinationOptions {
  readonly monthScreenEnabled: boolean
  readonly releasedChallengeRouteEnabled: boolean
  readonly currentYearMonth?: string
  /**
   * The only trusted origin source: the value the app itself recorded for this history entry
   * (`history.state.challengeOrigin`). Never pass anything derived from a URL.
   */
  readonly challengeOrigin?: unknown
}

const CHALLENGE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CHALLENGE_QUERY_KEYS = new Set(['origin', 'yearMonth'])

function hasOnlyKeys(
  value: object,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[] = allowedKeys,
): boolean {
  const keys = Reflect.ownKeys(value)
  return keys.every(key => typeof key === 'string' && allowedKeys.includes(key)) &&
    requiredKeys.every(key => Object.hasOwn(value, key))
}

function isCanonicalYearMonth(value: unknown): value is string {
  return isValidChallengeYearMonth(value) && value === value.trim()
}

function isValidDestinationOrigin(origin: unknown): origin is ChallengeOrigin {
  if (!origin || typeof origin !== 'object' || Array.isArray(origin)) return false

  const candidate = origin as Record<string, unknown>
  if (candidate.kind === 'hub') {
    return hasOnlyKeys(origin, ['kind'])
  }

  if (candidate.kind === 'month') {
    return hasOnlyKeys(origin, ['kind', 'yearMonth']) &&
      isCanonicalYearMonth(candidate.yearMonth)
  }

  if (candidate.kind === 'shelf' || candidate.kind === 'library') {
    return hasOnlyKeys(origin, ['kind', 'yearMonth'], ['kind']) &&
      (!Object.hasOwn(candidate, 'yearMonth') || candidate.yearMonth === undefined ||
        isCanonicalYearMonth(candidate.yearMonth))
  }

  return false
}

function parseChallengeQuery(query: string): URLSearchParams | null {
  const params = new URLSearchParams(query)
  const seen = new Set<string>()

  for (const key of params.keys()) {
    if (!CHALLENGE_QUERY_KEYS.has(key) || seen.has(key)) return null
    seen.add(key)
  }

  return params
}

/**
 * Builds a canonical local hash for an existing Month or released-Challenge destination.
 * The parser remains responsible for feature gates and released-content authorization.
 */
export function buildInternalDestination(destination: InternalDestination): string | null {
  if (!destination || typeof destination !== 'object' || Array.isArray(destination)) return null

  if (destination.type === 'month') {
    return hasOnlyKeys(destination, ['type', 'yearMonth']) &&
      isCanonicalYearMonth(destination.yearMonth)
      ? `#/month/${destination.yearMonth}`
      : null
  }

  if (destination.type === 'releasedChallenge') {
    if (
      !hasOnlyKeys(destination, ['type', 'slug', 'origin', 'entry'], ['type', 'slug', 'origin']) ||
      (destination.entry !== undefined &&
        destination.entry !== 'inSession' &&
        destination.entry !== 'external') ||
      typeof destination.slug !== 'string' ||
      !CHALLENGE_SLUG_PATTERN.test(destination.slug) ||
      !isValidDestinationOrigin(destination.origin)
    ) {
      return null
    }

    return `#/challenge/${destination.slug}?${serializeChallengeOriginToSearchParams(destination.origin)}`
  }

  return null
}

/**
 * Parses only existing, feature-gated internal Month and released-Challenge hashes.
 * It does not accept or resolve public URLs, schemes, or external destinations.
 *
 * Challenge `?origin=` / `yearMonth` hash parameters are still accepted (legacy link format)
 * but are untrusted and never become the return origin; see `trustedChallengeOrigin.ts`.
 */
export function parseInternalDestination(
  candidate: unknown,
  options: InternalDestinationOptions,
): InternalDestination | null {
  if (
    typeof candidate !== 'string' ||
    !candidate.startsWith('#/') ||
    candidate.includes('\\') ||
    [...candidate].some(character => {
      const code = character.charCodeAt(0)
      return code < 0x20 || code === 0x7f
    })
  ) {
    return null
  }

  const queryIndex = candidate.indexOf('?')
  const route = queryIndex < 0 ? candidate.slice(2) : candidate.slice(2, queryIndex)
  const query = queryIndex < 0 ? '' : candidate.slice(queryIndex + 1)

  if (route === 'month' || route === 'month/') {
    const yearMonth = options.currentYearMonth
    return options.monthScreenEnabled &&
      queryIndex < 0 &&
      typeof yearMonth === 'string' &&
      isValidChallengeYearMonth(yearMonth) &&
      yearMonth === yearMonth.trim()
      ? { type: 'month', yearMonth }
      : null
  }

  if (route.startsWith('month/')) {
    const yearMonth = route.slice('month/'.length)
    return options.monthScreenEnabled &&
      queryIndex < 0 &&
      isValidChallengeYearMonth(yearMonth) &&
      yearMonth === yearMonth.trim()
      ? { type: 'month', yearMonth }
      : null
  }

  if (!route.startsWith('challenge/')) return null
  if (!options.releasedChallengeRouteEnabled && !options.monthScreenEnabled) return null

  const slug = route.slice('challenge/'.length)
  if (!CHALLENGE_SLUG_PATTERN.test(slug)) return null

  // Validated for shape only (unknown or repeated keys still fail closed); values are ignored.
  if (!parseChallengeQuery(query)) return null

  const { origin, entry } = resolveTrustedChallengeReturn(options.challengeOrigin)
  return { type: 'releasedChallenge', slug, origin, entry }
}
