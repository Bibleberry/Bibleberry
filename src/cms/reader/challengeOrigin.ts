/**
 * Typed, storage-free origin/return context for ordinary CMS Challenges (R08A-5).
 *
 * Captures the surface from which a reader opened a Challenge so explicit `Finish`
 * and exit controls return directly to the caller's context without relying on
 * arbitrary URLs or `window.history.back()`, and without bypassing content-release checks.
 */

export type ChallengeOrigin =
  | { readonly kind: 'hub' }
  | { readonly kind: 'month'; readonly yearMonth: string }
  | { readonly kind: 'shelf'; readonly yearMonth?: string }
  | { readonly kind: 'library'; readonly yearMonth?: string }

export const DEFAULT_CHALLENGE_ORIGIN: ChallengeOrigin = Object.freeze({ kind: 'hub' })

const YEAR_MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/

export function isValidChallengeYearMonth(value: unknown): value is string {
  return typeof value === 'string' && YEAR_MONTH_PATTERN.test(value.trim())
}

function normalizeYearMonth(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return YEAR_MONTH_PATTERN.test(trimmed) ? trimmed : undefined
}

/**
 * Validates untrusted origin metadata (e.g., from `history.state` or URL parameters).
 * Unknown or malformed origins gracefully fall back to `{ kind: 'hub' }`.
 * A `month` origin without a valid `YYYY-MM` identifier also falls back to `{ kind: 'hub' }`.
 */
export function parseChallengeOrigin(candidate: unknown): ChallengeOrigin {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return DEFAULT_CHALLENGE_ORIGIN
  }

  const record = candidate as Record<string, unknown>
  const kind = record.kind

  if (kind === 'hub') {
    return DEFAULT_CHALLENGE_ORIGIN
  }

  if (kind === 'month') {
    const yearMonth = normalizeYearMonth(record.yearMonth)
    return yearMonth ? Object.freeze({ kind: 'month', yearMonth }) : DEFAULT_CHALLENGE_ORIGIN
  }

  if (kind === 'shelf') {
    const yearMonth = normalizeYearMonth(record.yearMonth)
    return yearMonth
      ? Object.freeze({ kind: 'shelf', yearMonth })
      : Object.freeze({ kind: 'shelf' })
  }

  if (kind === 'library') {
    const yearMonth = normalizeYearMonth(record.yearMonth)
    return yearMonth
      ? Object.freeze({ kind: 'library', yearMonth })
      : Object.freeze({ kind: 'library' })
  }

  return DEFAULT_CHALLENGE_ORIGIN
}

export function parseChallengeOriginFromSearchParams(params: URLSearchParams): ChallengeOrigin {
  const kind = params.get('origin')
  if (!kind) return DEFAULT_CHALLENGE_ORIGIN
  const yearMonth = params.get('yearMonth') ?? undefined
  return parseChallengeOrigin({ kind, yearMonth })
}

export function serializeChallengeOriginToSearchParams(origin: ChallengeOrigin): string {
  const normalized = parseChallengeOrigin(origin)
  const params = new URLSearchParams()
  params.set('origin', normalized.kind)
  if ('yearMonth' in normalized && normalized.yearMonth) {
    params.set('yearMonth', normalized.yearMonth)
  }
  return params.toString()
}

export function areChallengeOriginsEqual(
  left: ChallengeOrigin | undefined,
  right: ChallengeOrigin | undefined,
): boolean {
  if (!left || !right) return left === right
  if (left.kind !== right.kind) return false
  const leftYm = 'yearMonth' in left ? left.yearMonth : undefined
  const rightYm = 'yearMonth' in right ? right.yearMonth : undefined
  return leftYm === rightYm
}

function formatYearMonthDisplay(yearMonth: string): string {
  const year = Number(yearMonth.slice(0, 4))
  const month = Number(yearMonth.slice(5, 7))
  // Pin to mid-month UTC so browser timezone offsets never shift the civil month.
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 15)))
}

export function formatChallengeOriginLabel(
  origin: ChallengeOrigin,
  options: { readonly hubLabel?: string } = {},
): string {
  const normalized = parseChallengeOrigin(origin)
  switch (normalized.kind) {
    case 'hub':
      return options.hubLabel ?? 'Return to Hub'
    case 'month':
      return `Return to ${formatYearMonthDisplay(normalized.yearMonth)}`
    case 'shelf':
      return normalized.yearMonth
        ? `Return to Shelf · ${formatYearMonthDisplay(normalized.yearMonth)}`
        : 'Return to Shelf'
    case 'library':
      return normalized.yearMonth
        ? `Return to Library · ${formatYearMonthDisplay(normalized.yearMonth)}`
        : 'Return to Library'
  }
}
