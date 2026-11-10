export const DEFAULT_RELEASE_TIME_ZONE = 'America/New_York' // Matches CMS_EDITORIAL_TIME_ZONE

const RAW_OFFSET_PATTERN = /^(?:[+-]\d+(?::?\d+)?|(?:GMT|UTC)[+-].*)$/i
const MAX_TIMEZONE_LENGTH = 64

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
