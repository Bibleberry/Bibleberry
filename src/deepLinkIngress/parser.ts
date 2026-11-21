import {
  DEFAULT_CHALLENGE_ORIGIN,
  isValidChallengeYearMonth,
} from '../cms/reader/challengeOrigin.ts'
import {
  buildInternalDestination,
  parseInternalDestination,
} from '../native/internalDestination.ts'
import type {
  ExternalDeepLinkParseOptions,
  ExternalDeepLinkParseResult,
  ExternalDeepLinkRejectionReason,
  ExternalLinkIngressPolicy,
} from './types.ts'

const CHALLENGE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CUSTOM_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*$/
const FORBIDDEN_CUSTOM_SCHEMES = new Set([
  'http',
  'https',
  'javascript',
  'data',
  'file',
  'vbscript',
  'blob',
  'about',
])
const ALLOWED_CHALLENGE_QUERY_KEYS = new Set(['origin', 'yearMonth'])
const ALLOWED_ORIGINS = new Set(['hub', 'month', 'shelf', 'library'])
const ENCODED_TRICK_PATTERN = /%(?:2e|2f|5c|00|25)/i

function getDestinationOptions(options: ExternalDeepLinkParseOptions) {
  return {
    monthScreenEnabled: options.monthScreenEnabled,
    releasedChallengeRouteEnabled: options.releasedChallengeRouteEnabled,
    currentYearMonth: options.currentYearMonth,
  }
}

interface NormalizedPolicy {
  readonly allowedHttpsHosts: ReadonlySet<string>
  readonly allowedCustomSchemes: ReadonlySet<string>
  readonly allowedCustomSchemeHosts: ReadonlySet<string>
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

function normalizePolicy(policy: ExternalLinkIngressPolicy | undefined): NormalizedPolicy {
  const allowedHttpsHosts = new Set<string>()
  for (const host of policy?.allowedHttpsHosts ?? []) {
    if (typeof host !== 'string') continue
    const normalized = host.trim().toLowerCase()
    if (
      normalized.length > 0 &&
      !normalized.includes('*') &&
      !normalized.includes('/') &&
      !normalized.includes(':') &&
      !hasControlCharacters(normalized) &&
      !/\s/.test(normalized)
    ) {
      allowedHttpsHosts.add(normalized)
    }
  }

  const allowedCustomSchemes = new Set<string>()
  for (const scheme of policy?.allowedCustomSchemes ?? []) {
    if (typeof scheme !== 'string') continue
    const normalized = scheme.trim().toLowerCase().replace(/:$/, '')
    if (
      CUSTOM_SCHEME_PATTERN.test(normalized) &&
      !FORBIDDEN_CUSTOM_SCHEMES.has(normalized)
    ) {
      allowedCustomSchemes.add(normalized)
    }
  }

  const allowedCustomSchemeHosts = new Set<string>()
  for (const host of policy?.allowedCustomSchemeHosts ?? []) {
    if (typeof host !== 'string') continue
    const normalized = host.trim().toLowerCase()
    if (
      normalized.length > 0 &&
      !normalized.includes('*') &&
      !normalized.includes('/') &&
      !normalized.includes(':') &&
      !hasControlCharacters(normalized) &&
      !/\s/.test(normalized)
    ) {
      allowedCustomSchemeHosts.add(normalized)
    }
  }

  return {
    allowedHttpsHosts,
    allowedCustomSchemes,
    allowedCustomSchemeHosts,
  }
}

function extractRawPathBeforeNormalization(rawUrl: string): string {
  const schemeEnd = rawUrl.indexOf(':')
  if (schemeEnd < 0) return ''

  let afterScheme = rawUrl.slice(schemeEnd + 1)
  const queryIndex = afterScheme.indexOf('?')
  if (queryIndex >= 0) afterScheme = afterScheme.slice(0, queryIndex)
  const hashIndex = afterScheme.indexOf('#')
  if (hashIndex >= 0) afterScheme = afterScheme.slice(0, hashIndex)

  if (afterScheme.startsWith('//')) {
    const authorityEnd = afterScheme.indexOf('/', 2)
    return authorityEnd >= 0 ? afterScheme.slice(authorityEnd) : ''
  }

  return afterScheme
}

function hasEncodedOrTraversalTrick(rawPath: string): boolean {
  if (ENCODED_TRICK_PATTERN.test(rawPath)) return true
  if (rawPath.includes('//')) return true

  const segments = rawPath.split('/')
  for (const segment of segments) {
    if (segment === '.' || segment === '..') return true
  }

  return false
}

function reject(
  rawUrl: unknown,
  reason: ExternalDeepLinkRejectionReason,
): ExternalDeepLinkParseResult {
  return {
    status: 'rejected',
    rawUrl,
    reason,
  }
}

function validateChallengeQueryParams(
  params: URLSearchParams,
): ExternalDeepLinkRejectionReason | null {
  const seen = new Set<string>()
  for (const key of params.keys()) {
    if (!ALLOWED_CHALLENGE_QUERY_KEYS.has(key) || seen.has(key)) {
      return 'invalidQuery'
    }
    seen.add(key)
  }

  const origin = params.get('origin')
  const yearMonth = params.get('yearMonth')

  if (origin === null) {
    return yearMonth !== null ? 'invalidQuery' : null
  }

  if (!ALLOWED_ORIGINS.has(origin)) {
    return 'invalidQuery'
  }

  if (origin === 'hub') {
    return yearMonth !== null ? 'invalidQuery' : null
  }

  if (origin === 'month') {
    if (yearMonth === null) return 'invalidQuery'
    return isValidChallengeYearMonth(yearMonth) && yearMonth === yearMonth.trim()
      ? null
      : 'invalidMonth'
  }

  if (yearMonth !== null) {
    return isValidChallengeYearMonth(yearMonth) && yearMonth === yearMonth.trim()
      ? null
      : 'invalidMonth'
  }

  return null
}

/**
 * Platform-neutral URL ingress parser for external Month and released-Challenge links.
 *
 * Accepts an explicitly injected host/scheme policy, rejects malformed URLs, unauthorized
 * hosts/schemes, encoded-path tricks, and arbitrary destinations, and delegates final
 * destination construction to `src/native/internalDestination.ts`.
 */
export function parseExternalDeepLink(
  rawUrl: unknown,
  options: ExternalDeepLinkParseOptions,
): ExternalDeepLinkParseResult {
  if (
    typeof rawUrl !== 'string' ||
    rawUrl.length === 0 ||
    rawUrl !== rawUrl.trim() ||
    rawUrl.includes('\\') ||
    hasControlCharacters(rawUrl)
  ) {
    return reject(rawUrl, 'malformedUrl')
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    return reject(rawUrl, 'malformedUrl')
  }

  if (parsedUrl.username !== '' || parsedUrl.password !== '') {
    return reject(rawUrl, 'malformedUrl')
  }

  if (parsedUrl.hash !== '') {
    return reject(rawUrl, 'unsupportedRoute')
  }

  const policy = normalizePolicy(options.policy)
  const scheme = parsedUrl.protocol.slice(0, -1).toLowerCase()
  const host = parsedUrl.hostname.toLowerCase()
  const rawPathBeforeNorm = extractRawPathBeforeNormalization(rawUrl)

  if (hasEncodedOrTraversalTrick(rawPathBeforeNorm)) {
    return reject(rawUrl, 'encodedPathTrick')
  }

  let routePath: string
  if (scheme === 'https') {
    if (parsedUrl.port !== '' || !policy.allowedHttpsHosts.has(host)) {
      return reject(rawUrl, 'unauthorizedHostOrScheme')
    }
    routePath = parsedUrl.pathname
  } else if (policy.allowedCustomSchemes.has(scheme)) {
    if (policy.allowedCustomSchemeHosts.size > 0) {
      if (!policy.allowedCustomSchemeHosts.has(host)) {
        return reject(rawUrl, 'unauthorizedHostOrScheme')
      }
      routePath = parsedUrl.pathname
    } else if (host === '') {
      routePath = parsedUrl.pathname
    } else if (host === 'month' || host === 'challenge') {
      routePath = `/${host}${parsedUrl.pathname}`
    } else {
      return reject(rawUrl, 'unauthorizedHostOrScheme')
    }
  } else {
    return reject(rawUrl, 'unauthorizedHostOrScheme')
  }

  if (hasEncodedOrTraversalTrick(routePath)) {
    return reject(rawUrl, 'encodedPathTrick')
  }

  if (routePath === '/month' || routePath === '/month/') {
    if (parsedUrl.search !== '') {
      return reject(rawUrl, 'invalidQuery')
    }
    if (!options.monthScreenEnabled) {
      return reject(rawUrl, 'featureDisabled')
    }
    const destination = parseInternalDestination('#/month', getDestinationOptions(options))
    if (!destination) {
      return reject(rawUrl, 'invalidMonth')
    }
    const internalHash = buildInternalDestination(destination)
    if (!internalHash) {
      return reject(rawUrl, 'invalidMonth')
    }
    return {
      status: 'parsed',
      rawUrl,
      normalizedUrl: parsedUrl.toString(),
      scheme,
      destination,
      internalHash,
      origin: null,
    }
  }

  if (routePath.startsWith('/month/')) {
    const yearMonth = routePath.slice('/month/'.length)
    if (yearMonth.includes('/')) {
      return reject(rawUrl, 'unsupportedRoute')
    }
    if (parsedUrl.search !== '') {
      return reject(rawUrl, 'invalidQuery')
    }
    if (!isValidChallengeYearMonth(yearMonth) || yearMonth !== yearMonth.trim()) {
      return reject(rawUrl, 'invalidMonth')
    }
    if (!options.monthScreenEnabled) {
      return reject(rawUrl, 'featureDisabled')
    }
    const destination = parseInternalDestination(
      `#/month/${yearMonth}`,
      getDestinationOptions(options),
    )
    if (!destination) {
      return reject(rawUrl, 'invalidMonth')
    }
    const internalHash = buildInternalDestination(destination)
    if (!internalHash) {
      return reject(rawUrl, 'invalidMonth')
    }
    return {
      status: 'parsed',
      rawUrl,
      normalizedUrl: parsedUrl.toString(),
      scheme,
      destination,
      internalHash,
      origin: null,
    }
  }

  if (routePath.startsWith('/challenge/')) {
    const slug = routePath.slice('/challenge/'.length)
    if (slug.length === 0 || slug.includes('/') || !CHALLENGE_SLUG_PATTERN.test(slug)) {
      return reject(rawUrl, 'invalidChallengeSlug')
    }
    if (!options.releasedChallengeRouteEnabled && !options.monthScreenEnabled) {
      return reject(rawUrl, 'featureDisabled')
    }

    // Legacy `origin` / `yearMonth` parameters are validated so malformed links still fail
    // closed, but an external link never chooses its return origin (G04-A): it is always an
    // external entry with the default origin, and Exit/Finish return to Today.
    const queryFailure = validateChallengeQueryParams(parsedUrl.searchParams)
    if (queryFailure !== null) {
      return reject(rawUrl, queryFailure)
    }

    const candidateHash = buildInternalDestination({
      type: 'releasedChallenge',
      slug,
      origin: DEFAULT_CHALLENGE_ORIGIN,
    })
    if (!candidateHash) {
      return reject(rawUrl, 'invalidChallengeSlug')
    }

    const destination = parseInternalDestination(candidateHash, getDestinationOptions(options))
    if (
      !destination ||
      destination.type !== 'releasedChallenge' ||
      destination.entry !== 'external'
    ) {
      return reject(rawUrl, 'featureDisabled')
    }

    return {
      status: 'parsed',
      rawUrl,
      normalizedUrl: parsedUrl.toString(),
      scheme,
      destination,
      internalHash: candidateHash,
      origin: null,
    }
  }

  return reject(rawUrl, 'unsupportedRoute')
}
