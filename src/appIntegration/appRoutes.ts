/**
 * Controlled App-Shell Integration Routes (Issue #132 / R05-UI-1).
 *
 * Provides typed, feature-gated route parsing and destination builders for Field Notebook
 * and Saved Scripture collections without modifying central native navigation or altering
 * approved information architecture.
 */

export const NOTEBOOK_ROUTE_HASH = '#/notebook'
export const NOTEBOOK_ROUTE_ALIASES = Object.freeze(['#/notebook', '#/field-notebook'] as const)

export const SAVED_SCRIPTURE_ROUTE_HASH = '#/saved-scripture'
export const SAVED_SCRIPTURE_ROUTE_ALIASES = Object.freeze(['#/saved-scripture', '#/savedScripture'] as const)

export type AppIntegrationRoute = 'notebook' | 'savedScripture'

export interface AppIntegrationRouteOptions {
  readonly fieldNotebookEnabled: boolean
  readonly savedScriptureEnabled: boolean
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

  return null
}

export function buildNotebookRoute(): string {
  return NOTEBOOK_ROUTE_HASH
}

export function buildSavedScriptureRoute(): string {
  return SAVED_SCRIPTURE_ROUTE_HASH
}
