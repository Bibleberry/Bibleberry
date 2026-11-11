import type {StructureBuilder} from 'sanity/structure'
import {
  MONTHLY_PREVIEW_NEWS_TEMPLATE_ID,
  MONTHLY_PUBLICATION_TEMPLATE_ID,
} from './initialValues/templates'
import {computeAdvancePreviewStartDate, daysInMonth, parseYearMonth} from './schemaTypes/monthlyHelpers'

export const MONTH_PLANNING_YEARS = [2026, 2027, 2028, 2029, 2030] as const

export type DeterministicMonthTarget = {
  yearMonth: string
  year: number
  month: number
  dayCount: number
  monthDocumentId: string
  monthTemplateId: string
  previewNewsDocumentId: string
  previewNewsTemplateId: string
  previewStartDate: string
}

export function deterministicMonthDocumentId(yearMonth: string): string {
  const parsed = parseYearMonth(yearMonth)
  if (!parsed || parsed.year < 2026 || parsed.year > 2100) {
    throw new Error(`Invalid YYYY-MM publication month "${yearMonth}". Expected 2026-01 through 2100-12.`)
  }
  return `month-${yearMonth}`
}

export function deterministicPreviewNewsDocumentId(yearMonth: string): string {
  const parsed = parseYearMonth(yearMonth)
  if (!parsed || parsed.year < 2026 || parsed.year > 2100) {
    throw new Error(`Invalid YYYY-MM preview news target "${yearMonth}". Expected 2026-01 through 2100-12.`)
  }
  return `news-preview-${yearMonth}`
}

export function parseDeterministicMonthTarget(
  rawInput: string,
): {ok: true; target: DeterministicMonthTarget} | {ok: false; error: string} {
  const trimmed = rawInput.trim()
  const parsed = parseYearMonth(trimmed)
  if (!parsed || parsed.year < 2026 || parsed.year > 2100) {
    return {
      ok: false,
      error: 'Enter a valid YYYY-MM month between 2026-01 and 2100-12 (for example, 2027-03).',
    }
  }
  const yearMonth = `${String(parsed.year).padStart(4, '0')}-${String(parsed.month).padStart(2, '0')}`
  return {
    ok: true,
    target: {
      yearMonth,
      year: parsed.year,
      month: parsed.month,
      dayCount: daysInMonth(parsed.year, parsed.month),
      monthDocumentId: `month-${yearMonth}`,
      monthTemplateId: MONTHLY_PUBLICATION_TEMPLATE_ID,
      previewNewsDocumentId: `news-preview-${yearMonth}`,
      previewNewsTemplateId: MONTHLY_PREVIEW_NEWS_TEMPLATE_ID,
      previewStartDate: computeAdvancePreviewStartDate(parsed.year, parsed.month),
    },
  }
}

/**
 * Deterministic editor node for a monthlyPublication document (`month-YYYY-MM`).
 * Always sets the exact documentId and passes `{yearMonth}` to the parameterized template.
 * Reopens existing draft or published documents at `month-YYYY-MM` without duplicates.
 */
export function resolveMonthlyPublicationDocumentNode(S: StructureBuilder, yearMonth: string) {
  const documentId = deterministicMonthDocumentId(yearMonth)
  return S.document()
    .id(documentId)
    .schemaType('monthlyPublication')
    .documentId(documentId)
    .initialValueTemplate(MONTHLY_PUBLICATION_TEMPLATE_ID, {yearMonth})
}

/**
 * Deterministic editor node for a monthlyPreview newsArticle document (`news-preview-YYYY-MM`).
 * Always sets the exact documentId and passes `{yearMonth}` to initialize `publishOnDate` and `relatedMonth`.
 */
export function resolvePreviewNewsDocumentNode(S: StructureBuilder, yearMonth: string) {
  const documentId = deterministicPreviewNewsDocumentId(yearMonth)
  return S.document()
    .id(documentId)
    .schemaType('newsArticle')
    .documentId(documentId)
    .initialValueTemplate(MONTHLY_PREVIEW_NEWS_TEMPLATE_ID, {yearMonth})
}

/**
 * Dynamic child resolver used by the custom YYYY-MM opener pane (`ChildLink`) and direct lookups.
 */
export function resolveDeterministicMonthChild(S: StructureBuilder, childId: string) {
  const monthMatch = /^month-(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(childId)
  if (monthMatch) {
    return resolveMonthlyPublicationDocumentNode(S, monthMatch[1])
  }

  const newsMatch = /^news-preview-(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(childId)
  if (newsMatch) {
    return resolvePreviewNewsDocumentNode(S, newsMatch[1])
  }

  throw new Error(
    `Unsupported deterministic monthly child ID "${childId}". Expected month-YYYY-MM or news-preview-YYYY-MM.`,
  )
}

export function listYearMonthKeys(year: number): string[] {
  return Array.from({length: 12}, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
}
