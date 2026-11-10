import {
  buildMonthlySlots,
  computeAdvancePreviewStartDate,
  parseYearMonth,
} from '../schemaTypes/monthlyHelpers'
import {NOV2_TEMPLATE_ID, SERIES_DOCUMENT_ID, SERIES_TEMPLATE_ID, nov2InitialValue} from './nov2'

export const MONTHLY_PUBLICATION_TEMPLATE_ID = 'monthly-publication-by-year-month'
export const MONTHLY_PREVIEW_NEWS_TEMPLATE_ID = 'monthly-preview-news-by-year-month'

export const initialValueTemplates = [
  {
    id: SERIES_TEMPLATE_ID,
    title: '26-Day Biblical Gratitude Challenge',
    description: 'Fixed series identity for the November 2 pilot.',
    schemaType: 'challengeSeries',
    value: {
      _type: 'challengeSeries',
      title: '26-Day Biblical Gratitude Challenge',
      slug: {_type: 'slug', current: SERIES_DOCUMENT_ID},
    },
  },
  {
    id: NOV2_TEMPLATE_ID,
    title: 'November 2 — Rejoice Always',
    description: 'Seven-screen proposed adaptation. Opens as an unpublished draft with review and release requirements intact.',
    schemaType: 'challenge',
    value: nov2InitialValue,
  },
  {
    id: MONTHLY_PUBLICATION_TEMPLATE_ID,
    title: 'Monthly Publication (pre-populated civil calendar slots)',
    description: 'Creates a draft monthly publication with exact 28–31 ordered day slots.',
    schemaType: 'monthlyPublication',
    parameters: [{name: 'yearMonth', title: 'Publication month (YYYY-MM)', type: 'string'}],
    value: (params?: {yearMonth?: string}) => {
      const parsed = (typeof params?.yearMonth === 'string' && parseYearMonth(params.yearMonth)) || {
        year: 2027,
        month: 3,
      }
      const yearMonth = `${String(parsed.year).padStart(4, '0')}-${String(parsed.month).padStart(2, '0')}`
      return {
        _type: 'monthlyPublication',
        yearMonth,
        year: parsed.year,
        month: parsed.month,
        editorialStatus: 'draft',
        withdrawn: false,
        slots: buildMonthlySlots(parsed.year, parsed.month),
        rosterFinalization: {
          _type: 'rosterFinalization',
          isFinalized: false,
          rosterVersion: 1,
          finalizedChallengeIds: [],
          priorRosters: [],
        },
        discoveries: [],
      }
    },
  },
  {
    id: MONTHLY_PREVIEW_NEWS_TEMPLATE_ID,
    title: 'Monthly Advance Preview News',
    description: 'Creates a monthlyPreview newsArticle pre-set with the Feb 27 / preceding-28th preview start date.',
    schemaType: 'newsArticle',
    parameters: [{name: 'yearMonth', title: 'Target month (YYYY-MM)', type: 'string'}],
    value: (params?: {yearMonth?: string}) => {
      const parsed = (typeof params?.yearMonth === 'string' && parseYearMonth(params.yearMonth)) || {
        year: 2027,
        month: 3,
      }
      const yearMonth = `${String(parsed.year).padStart(4, '0')}-${String(parsed.month).padStart(2, '0')}`
      return {
        _type: 'newsArticle',
        category: 'monthlyPreview',
        publishOnDate: computeAdvancePreviewStartDate(parsed.year, parsed.month),
        relatedMonth: {
          _type: 'reference',
          _ref: `month-${yearMonth}`,
          _weak: true,
        },
        withdrawn: false,
      }
    },
  },
]
