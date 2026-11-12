import type {StructureBuilder} from 'sanity/structure'
import {MonthlyReadinessInspector} from './components/MonthlyReadinessInspector'
import {
  MONTHLY_PREVIEW_NEWS_TEMPLATE_ID,
  MONTHLY_PUBLICATION_TEMPLATE_ID,
  SCRIPTURE_CARD_TEMPLATE_ID,
} from './initialValues/templates'
import {
  computeAdvancePreviewStartDate,
  daysInMonth,
  deterministicCardIdFromSlug,
  parseYearMonth,
  SLUG_TOKEN_PATTERN,
} from './schemaTypes/monthlyHelpers'

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

export type DeterministicCardTarget = {
  slug: string
  cardDocumentId: string
  cardTemplateId: string
}

export function deterministicCardDocumentId(slug: string): string {
  const trimmed = slug.trim()
  if (!SLUG_TOKEN_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid Scripture Card slug "${slug}". Expected lowercase hyphenated characters (for example, 2027-03-vineyard-imagery).`,
    )
  }
  return deterministicCardIdFromSlug(trimmed)
}

export function parseDeterministicCardTarget(
  rawInput: string,
): {ok: true; target: DeterministicCardTarget} | {ok: false; error: string} {
  const trimmed = rawInput.trim()
  if (!trimmed) {
    return {
      ok: false,
      error: 'Enter a lowercase hyphenated Card slug (for example, 2027-03-vineyard-imagery).',
    }
  }
  if (trimmed.startsWith('card-')) {
    return {
      ok: false,
      error: 'Enter the slug without the "card-" prefix (for example, 2027-03-vineyard-imagery).',
    }
  }
  if (!SLUG_TOKEN_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error: 'Card slug must use lowercase letters, numbers, and single hyphens only (for example, 2027-03-vineyard-imagery).',
    }
  }
  return {
    ok: true,
    target: {
      slug: trimmed,
      cardDocumentId: deterministicCardIdFromSlug(trimmed),
      cardTemplateId: SCRIPTURE_CARD_TEMPLATE_ID,
    },
  }
}

/**
 * Deterministic editor node for a scriptureCard document (`card-<slug>`).
 * Reopens existing draft or published documents at `card-<slug>` without creating duplicates.
 */
export function resolveScriptureCardDocumentNode(S: StructureBuilder, slug: string) {
  const documentId = deterministicCardDocumentId(slug)
  return S.document()
    .id(documentId)
    .schemaType('scriptureCard')
    .documentId(documentId)
    .initialValueTemplate(SCRIPTURE_CARD_TEMPLATE_ID, {slug: slug.trim()})
}

/**
 * Dynamic child resolver used by the custom card-<slug> opener pane (`ChildLink`).
 */
export function resolveDeterministicCardChild(S: StructureBuilder, childId: string) {
  const match = /^card-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(childId)
  if (match) {
    return resolveScriptureCardDocumentNode(S, match[1])
  }
  throw new Error(
    `Unsupported deterministic Scripture Card child ID "${childId}". Expected card-<slug>.`,
  )
}

/**
 * Dynamic child resolver used by the MonthlyReadinessInspector pane (`ChildLink`)
 * to open linked month, preview news, Scripture Card, or Challenge editors in an adjacent pane.
 */
export function resolveMonthlyReadinessChild(S: StructureBuilder, childId: string) {
  if (/^month-(\d{4}-(?:0[1-9]|1[0-2]))$/.test(childId) || /^news-preview-(\d{4}-(?:0[1-9]|1[0-2]))$/.test(childId)) {
    return resolveDeterministicMonthChild(S, childId)
  }

  if (/^card-([a-z0-9]+(?:-[a-z0-9]+)*)$/.test(childId)) {
    return resolveDeterministicCardChild(S, childId)
  }

  const challengeMatch = /^challenge:([a-zA-Z0-9._-]+)$/.exec(childId)
  if (challengeMatch) {
    const challengeId = challengeMatch[1].replace(/^drafts\./, '')
    return S.document()
      .id(`challenge-${challengeId}`)
      .schemaType('challenge')
      .documentId(challengeId)
  }

  throw new Error(
    `Unsupported readiness inspector child ID "${childId}". Expected month-YYYY-MM, news-preview-YYYY-MM, card-<slug>, or challenge:<id>.`,
  )
}

/**
 * Deterministic read-only readiness inspector pane for either a specific YYYY-MM month
 * or an interactive month selector.
 */
export function resolveMonthlyReadinessNode(S: StructureBuilder, yearMonth?: string) {
  const base = S.component(MonthlyReadinessInspector)
    .id(yearMonth ? `readiness-inspector-${yearMonth}` : 'monthly-readiness-inspector')
    .title(yearMonth ? `Editorial readiness report (${yearMonth})` : 'Inspect monthly readiness (YYYY-MM)')
    .child(childId => resolveMonthlyReadinessChild(S, childId))

  if (yearMonth) {
    deterministicMonthDocumentId(yearMonth)
    return base.options({yearMonth})
  }
  return base
}
