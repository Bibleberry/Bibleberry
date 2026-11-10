export const DEFAULT_RELEASE_TIME_ZONE = 'America/New_York' // Matches CMS_EDITORIAL_TIME_ZONE

export const YEAR_MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/
export const ISO_CIVIL_DATE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/

const RAW_OFFSET_PATTERN = /^(?:[+-]\d+(?::?\d+)?|(?:GMT|UTC)[+-].*)$/i
const MAX_TIMEZONE_LENGTH = 64

export function parseYearMonth(yearMonth: string): { year: number; month: number } | null {
  if (typeof yearMonth !== 'string' || !YEAR_MONTH_PATTERN.test(yearMonth)) {
    return null
  }
  const year = Number(yearMonth.slice(0, 4))
  const month = Number(yearMonth.slice(5, 7))
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }
  return { year, month }
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function formatCivilDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function isValidCivilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_CIVIL_DATE_PATTERN.test(value)) {
    return false
  }
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  return day >= 1 && day <= daysInMonth(year, month)
}

/**
 * Deterministic advance preview start date:
 * - Preceding month's 28th for ordinary months (Dec 28 for Jan)
 * - February 27th when target month is March (for both 28- and 29-day Februaries)
 */
export function computeAdvancePreviewStartDate(year: number, month: number): string {
  if (month === 1) return `${String(year - 1).padStart(4, '0')}-12-28`
  if (month === 3) return `${String(year).padStart(4, '0')}-02-27`
  return `${String(year).padStart(4, '0')}-${String(month - 1).padStart(2, '0')}-28`
}

export interface AuthorizedReaderDateResolution {
  readonly authorizedLocalDate: string
  readonly effectiveTimeZone: string
  readonly usedFallback: boolean
}

/**
 * Validates that a candidate timezone header is a supported IANA timezone ID
 * (such as `America/New_York`, `UTC`, or `Etc/GMT+12`) and not a raw offset,
 * blank string, malformed zone, or oversized string (>64 chars).
 */
export function isValidIanaTimeZone(candidate: string | null | undefined): candidate is string {
  if (typeof candidate !== 'string') return false
  const trimmed = candidate.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_TIMEZONE_LENGTH) return false
  if (RAW_OFFSET_PATTERN.test(trimmed)) return false

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed })
    return true
  } catch {
    return false
  }
}

/**
 * Formats an authoritative server UTC instant into a civil `YYYY-MM-DD` date
 * in the specified IANA timezone without shifting across DST transitions.
 */
export function formatIsoDateInTimeZone(date: Date, timeZone: string): string {
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError('Invalid server UTC timestamp')
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  const day = parts.find(part => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error(`Unable to format civil date for timezone "${timeZone}"`)
  }

  return `${year}-${month}-${day}`
}

/**
 * Resolves the reader's authorized local civil date (`YYYY-MM-DD`) strictly from
 * authoritative server UTC time and a validated `X-Bibleberry-Timezone` header,
 * falling back deterministically to `America/New_York`.
 */
export function resolveAuthorizedReaderDate(
  serverNowUtc: Date,
  reportedTimeZoneHeader: string | null | undefined,
): AuthorizedReaderDateResolution {
  const validHeader = isValidIanaTimeZone(reportedTimeZoneHeader)
  const effectiveTimeZone = validHeader
    ? reportedTimeZoneHeader.trim()
    : DEFAULT_RELEASE_TIME_ZONE

  return {
    authorizedLocalDate: formatIsoDateInTimeZone(serverNowUtc, effectiveTimeZone),
    effectiveTimeZone,
    usedFallback: !validHeader,
  }
}
