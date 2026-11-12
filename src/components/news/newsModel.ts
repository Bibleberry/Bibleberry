import type { NewsArticle, NewsCategory, NewsDestination } from '../../cms/reader/newsProvider.ts'

export type NewsFilterCategory = 'all' | NewsCategory

export const NEWS_FILTER_OPTIONS: readonly { readonly id: NewsFilterCategory; readonly label: string }[] = [
  { id: 'all', label: 'All News' },
  { id: 'ministryUpdate', label: 'Ministry Updates' },
  { id: 'announcement', label: 'Announcements' },
  { id: 'monthlyPreview', label: 'Monthly Previews' },
] as const

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/**
 * Formats an ISO civil date string (YYYY-MM-DD) into an accessible, human-readable date.
 * Uses UTC date parts to avoid client timezone shifting bugs.
 */
export function formatNewsDate(isoCivilDate: string): string {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(isoCivilDate)) {
    return isoCivilDate
  }
  const year = Number(isoCivilDate.slice(0, 4))
  const month = Number(isoCivilDate.slice(5, 7))
  const day = Number(isoCivilDate.slice(8, 10))

  const monthName = MONTH_NAMES[month - 1] ?? ''
  return `${monthName} ${day}, ${year}`
}

/**
 * Human-readable label for a news category.
 */
export function formatNewsCategory(category: NewsCategory): string {
  switch (category) {
    case 'monthlyPreview':
      return 'Monthly Preview'
    case 'ministryUpdate':
      return 'Ministry Update'
    case 'announcement':
      return 'Announcement'
    default:
      return 'Ministry News'
  }
}

/**
 * Formats a monthly preview year-month (YYYY-MM) heading.
 */
export function formatMonthPreviewHeading(yearMonth: string): string {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(yearMonth)) {
    return yearMonth
  }
  const year = Number(yearMonth.slice(0, 4))
  const month = Number(yearMonth.slice(5, 7))
  const monthName = MONTH_NAMES[month - 1] ?? ''
  return `${monthName} ${year}`
}

/**
 * Determines whether a link URL is external to Bibleberry.
 * Any non-hash URL, absolute HTTP(S) URL, or scheme is external.
 */
export function isExternalLink(href: string): boolean {
  const trimmed = href.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('#/') || trimmed.startsWith('#')) return false
  return true
}

/**
 * Filters articles based on selected category.
 */
export function filterNewsArticles(
  articles: readonly NewsArticle[],
  filter: NewsFilterCategory,
): readonly NewsArticle[] {
  if (filter === 'all') {
    return articles
  }
  return articles.filter(article => article.category === filter)
}

/**
 * Determines whether a destination is a safe, authorized internal destination.
 */
export function isAuthorizedInternalDestination(
  destination?: NewsDestination,
): destination is { kind: 'month'; monthId: string } {
  if (!destination || typeof destination !== 'object') return false
  if (destination.kind !== 'month') return false
  return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(destination.monthId)
}
