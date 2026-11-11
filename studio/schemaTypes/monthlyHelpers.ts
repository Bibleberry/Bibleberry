export const ALLOWED_REVIEWER_ROLES = [
  'theological_editorial',
  'technical_synthetic',
] as const

export type AllowedReviewerRole = (typeof ALLOWED_REVIEWER_ROLES)[number]

export const ALLOWED_CARD_CATEGORIES = [
  'monthlyThematic',
  'monthlyFull',
  'foundation',
  'tutorial',
  'specialExperience',
] as const

export type AllowedCardCategory = (typeof ALLOWED_CARD_CATEGORIES)[number]

export const ALLOWED_CARD_EDITORIAL_STATUSES = [
  'draft',
  'inReview',
  'approved',
] as const

export type AllowedCardEditorialStatus = (typeof ALLOWED_CARD_EDITORIAL_STATUSES)[number]

export const REVIEWED_BLOCK_TYPES = new Set([
  'comparisonBlock',
  'visualCardsBlock',
  'connectedSequenceBlock',
  'reflectionBlock',
  'optionalStudyBlock',
])

export const YEAR_MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/
export const ISO_CIVIL_DATE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/
export const SLUG_TOKEN_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const CARD_PLACEHOLDER_PATTERN = /^card-[a-z0-9]+(?:-[a-z0-9]+)*$/
export const CARD_ID_PATTERN = CARD_PLACEHOLDER_PATTERN
export const ASSET_REVISION_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,31}$/
export const SHA256_PATTERN = /^[0-9a-f]{64}$/

export function stripDraftPrefix(id: string): string {
  return id.replace(/^drafts\./, '')
}

export function deterministicCardIdFromSlug(slug: string): string {
  return `card-${slug}`
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function parseYearMonth(yearMonth: string): {year: number; month: number} | null {
  if (!YEAR_MONTH_PATTERN.test(yearMonth)) return null
  const year = Number(yearMonth.slice(0, 4))
  const month = Number(yearMonth.slice(5, 7))
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }
  return {year, month}
}

export function formatCivilDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function isValidCivilDate(dateStr: string): boolean {
  if (!ISO_CIVIL_DATE_PATTERN.test(dateStr)) return false
  const parts = dateStr.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  return day >= 1 && day <= daysInMonth(year, month)
}

/**
 * Deterministic advance preview start date:
 * - Preceding month's 28th for ordinary months
 * - February 27th when target month is March (for both 28- and 29-day Februaries)
 */
export function computeAdvancePreviewStartDate(year: number, month: number): string {
  if (month === 1) return `${year - 1}-12-28`
  if (month === 3) return `${year}-02-27`
  return `${year}-${String(month - 1).padStart(2, '0')}-28`
}

export function buildMonthlySlots(year: number, month: number) {
  const totalDays = daysInMonth(year, month)
  return Array.from({length: totalDays}, (_, index) => {
    const dayOfMonth = index + 1
    const padded = String(dayOfMonth).padStart(2, '0')
    return {
      _key: `day-${padded}`,
      _type: 'monthlyCalendarSlot',
      dayOfMonth,
      date: formatCivilDate(year, month, dayOfMonth),
      slotStatus: 'scheduled',
    }
  })
}
