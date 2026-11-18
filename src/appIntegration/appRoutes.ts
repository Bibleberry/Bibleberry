import type { NewsFilterCategory } from '../components/news/newsModel.ts'

/**
 * Controlled App-Shell Integration Routes (Issue #132 / R05-UI-1).
 *
 * Provides typed, feature-gated route parsing and destination builders for Field Notebook,
 * Saved Scripture, Historical Library, and Ministry News without modifying central native
 * navigation or altering approved information architecture.
 */

export const NOTEBOOK_ROUTE_HASH = '#/notebook'
export const NOTEBOOK_ROUTE_ALIASES = Object.freeze(['#/notebook', '#/field-notebook'] as const)

export const SAVED_SCRIPTURE_ROUTE_HASH = '#/saved-scripture'
export const SAVED_SCRIPTURE_ROUTE_ALIASES = Object.freeze(['#/saved-scripture', '#/savedScripture'] as const)

export const LIBRARY_ROUTE_HASH = '#/library'
export const LIBRARY_ROUTE_ALIASES = Object.freeze(['#/library'] as const)

export const NEWS_ROUTE_HASH = '#/news'
export const NEWS_ROUTE_ALIASES = Object.freeze(['#/news', '#/ministry-news'] as const)

const VALID_NEWS_CATEGORIES: readonly NewsFilterCategory[] = [
  'all',
  'ministryUpdate',
  'announcement',
  'monthlyPreview',
]

export type AppIntegrationRoute = 'notebook' | 'savedScripture' | 'library' | 'news'

export interface AppIntegrationRouteOptions {
  readonly fieldNotebookEnabled: boolean
  readonly savedScriptureEnabled: boolean
  readonly historicalLibraryEnabled?: boolean
  readonly newsReaderEnabled?: boolean
}

/**
 * Returns whether the Field Notebook route is enabled via environment feature gate.
 */
export function isFieldNotebookRouteEnabled(): boolean {
  return typeof import.meta !== 'undefined' && import.meta.env?.VITE_ENABLE_FIELD_NOTEBOOK === 'true'
}

/**
 * Returns whether the Saved Scripture collection route is enabled via environment feature gate.
 */
export function isSavedScriptureRouteEnabled(): boolean {
  return typeof import.meta !== 'undefined' && import.meta.env?.VITE_ENABLE_SAVED_SCRIPTURE === 'true'
}

/**
 * Returns whether the Historical Library route is enabled via environment feature gate.
 */
export function isHistoricalLibraryRouteEnabled(): boolean {
  return typeof import.meta !== 'undefined' && import.meta.env?.VITE_ENABLE_HISTORICAL_LIBRARY === 'true'
}

/**
 * Returns whether the Ministry News reader route is enabled via environment feature gate.
 */
export function isNewsReaderRouteEnabled(): boolean {
  return typeof import.meta !== 'undefined' && import.meta.env?.VITE_ENABLE_NEWS_READER === 'true'
}

/**
 * Returns whether Hub earned Scripture Card announcements are enabled.
 * Defaults to true when Field Notebook is enabled unless explicitly disabled via VITE_ENABLE_HUB_CARD_ANNOUNCEMENTS='false'.
 */
export function isHubCardAnnouncementsEnabled(
  fieldNotebookEnabled: boolean = isFieldNotebookRouteEnabled(),
): boolean {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ENABLE_HUB_CARD_ANNOUNCEMENTS === 'false') {
    return false
  }
  const explicit = typeof import.meta !== 'undefined' && import.meta.env?.VITE_ENABLE_HUB_CARD_ANNOUNCEMENTS === 'true'
  return explicit || fieldNotebookEnabled
}

/**
 * Parses only existing, feature-gated internal collection hashes.
 * Fails closed (returns null) if the corresponding feature flag is disabled.
 */
export function parseAppIntegrationRoute(
  candidate: unknown,
  options: AppIntegrationRouteOptions,
): AppIntegrationRoute | null {
  if (
    typeof candidate !== 'string' ||
    !candidate.startsWith('#/') ||
    candidate.includes('\\') ||
    [...candidate].some(character => {
      const code = character.charCodeAt(0)
      return code < 0x20 || code === 0x7f
    })
  ) {
    return null
  }

  const queryIndex = candidate.indexOf('?')
  const route = queryIndex < 0 ? candidate : candidate.slice(0, queryIndex)
  const normalized = route.replace(/\/$/, '')

  if (options.fieldNotebookEnabled) {
    if (NOTEBOOK_ROUTE_ALIASES.includes(normalized as (typeof NOTEBOOK_ROUTE_ALIASES)[number])) {
      return 'notebook'
    }
  }

  if (options.savedScriptureEnabled) {
    if (SAVED_SCRIPTURE_ROUTE_ALIASES.includes(normalized as (typeof SAVED_SCRIPTURE_ROUTE_ALIASES)[number])) {
      return 'savedScripture'
    }
  }

  if (options.historicalLibraryEnabled) {
    if (LIBRARY_ROUTE_ALIASES.includes(normalized as (typeof LIBRARY_ROUTE_ALIASES)[number])) {
      return 'library'
    }
  }

  if (options.newsReaderEnabled) {
    if (NEWS_ROUTE_ALIASES.includes(normalized as (typeof NEWS_ROUTE_ALIASES)[number])) {
      return 'news'
    }
  }

  return null
}

/**
 * Parses an optional `?category=...` query parameter from a `#/news` hash.
 * Defaults to `'all'` when missing or unrecognized.
 */
export function parseNewsCategoryQuery(candidate: unknown): NewsFilterCategory {
  if (typeof candidate !== 'string') return 'all'
  const queryIndex = candidate.indexOf('?')
  if (queryIndex < 0) return 'all'
  const params = new URLSearchParams(candidate.slice(queryIndex + 1))
  const category = params.get('category')
  if (category && VALID_NEWS_CATEGORIES.includes(category as NewsFilterCategory)) {
    return category as NewsFilterCategory
  }
  return 'all'
}

export function buildNotebookRoute(): string {
  return NOTEBOOK_ROUTE_HASH
}

export function buildSavedScriptureRoute(): string {
  return SAVED_SCRIPTURE_ROUTE_HASH
}

export function buildLibraryRoute(): string {
  return LIBRARY_ROUTE_HASH
}

export function buildNewsRoute(category?: NewsFilterCategory): string {
  if (category && category !== 'all' && VALID_NEWS_CATEGORIES.includes(category)) {
    return `${NEWS_ROUTE_HASH}?category=${encodeURIComponent(category)}`
  }
  return NEWS_ROUTE_HASH
}
