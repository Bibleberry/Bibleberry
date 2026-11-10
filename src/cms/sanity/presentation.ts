import type { CmsCalendarSlot, CmsScripture } from './types.ts'

export const CMS_EDITORIAL_TIME_ZONE = 'America/New_York'

const ISO_CALENDAR_DATE_REGEX = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/**
 * Format a civil calendar date (YYYY-MM-DD) for display.
 * Never parses YYYY-MM-DD via UTC datetime / new Date(str) to avoid
 * shifting the displayed day backward in Western timezones.
 */
export function formatCmsCalendarDate(publicationDate: string): string {
  const match = ISO_CALENDAR_DATE_REGEX.exec(publicationDate.trim())
  if (!match) {
    return publicationDate
  }
  const monthNum = parseInt(match[2], 10)
  const dayNum = parseInt(match[3], 10)
  const monthName = MONTH_NAMES[monthNum - 1] ?? match[2]
  return `${monthName} ${dayNum}`
}

export function formatCmsReleaseDate(releaseAtUtc: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    timeZone: CMS_EDITORIAL_TIME_ZONE,
  }).format(new Date(releaseAtUtc))
}

/**
 * Present the schedule date for either a calendar-slotted Challenge or a legacy UTC-released Challenge.
 */
export function presentCmsScheduleDate(schedule: {
  calendarSlot?: CmsCalendarSlot | null
  releaseAtUtc?: string | null
}): string {
  if (schedule.calendarSlot?.publicationDate) {
    return formatCmsCalendarDate(schedule.calendarSlot.publicationDate)
  }
  if (schedule.releaseAtUtc) {
    return formatCmsReleaseDate(schedule.releaseAtUtc)
  }
  return ''
}

export type CmsScripturePresentation =
  | { status: 'provided'; passage: string }
  | { status: 'referenceOnly' }

export function presentCmsScripture(scripture: CmsScripture): CmsScripturePresentation {
  return scripture.textStatus === 'provided' && scripture.usageRightsConfirmed && scripture.passage
    ? { status: 'provided', passage: scripture.passage }
    : { status: 'referenceOnly' }
}
