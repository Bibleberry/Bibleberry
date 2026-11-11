import { validateEarnedCardSnapshot } from '../../participation/awards.ts'
import { parseLocalCalendarDate, parsePublicationYearMonth } from '../../participation/identity.ts'
import type {
  EarnedScriptureCardSnapshot,
  LocalCalendarDate,
  MonthlyAwardKind,
} from '../../participation/types.ts'

/**
 * Pure presentation helpers for `EarnedScriptureCardViewer` (R14-5).
 * Performs zero storage, network, or browser-clock reads.
 */

export function resolveValidatedCardSnapshot(
  card: EarnedScriptureCardSnapshot,
): EarnedScriptureCardSnapshot | null {
  const expectedMonth = parsePublicationYearMonth(card?.publicationYearMonth)
  if (!expectedMonth) return null
  return validateEarnedCardSnapshot(card, expectedMonth)
}

export function formatEarnedCardMonthHeading(yearMonth: string): string {
  const valid = parsePublicationYearMonth(yearMonth)
  if (!valid) return yearMonth
  const year = Number(valid.slice(0, 4))
  const month = Number(valid.slice(5, 7))
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 15)))
}

export function formatEarnedCardDate(earnedOn?: LocalCalendarDate): string | null {
  const validDate = parseLocalCalendarDate(earnedOn)
  if (!validDate) return null
  const year = Number(validDate.slice(0, 4))
  const month = Number(validDate.slice(5, 7))
  const day = Number(validDate.slice(8, 10))
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function getEarnedCardKindLabel(kind?: MonthlyAwardKind): string {
  return kind === 'fullMonth' ? 'Full-Month Scripture Card' : 'Thematic Scripture Card'
}
