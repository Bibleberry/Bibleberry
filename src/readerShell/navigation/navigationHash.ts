import {
  buildLibraryRoute,
  buildNewsRoute,
  buildNotebookRoute,
  buildSavedScriptureRoute,
  buildShelfRoute,
  parseAppIntegrationRoute,
  parseNewsCategoryQuery,
  type AppIntegrationRouteOptions,
} from '../../appIntegration/appRoutes.ts'
import { DEFAULT_CHALLENGE_ORIGIN } from '../../cms/reader/challengeOrigin.ts'
import {
  buildInternalDestination,
  parseInternalDestination,
  type InternalDestinationOptions,
} from '../../native/internalDestination.ts'
import type { NavigationState, NestedRoute, ReaderTab } from './navigationModel.ts'

export type NavigationRouteOptions = Omit<InternalDestinationOptions, 'challengeOrigin'> & AppIntegrationRouteOptions

export type NavigationHashTarget =
  | { readonly kind: 'tab'; readonly tab: ReaderTab; readonly route?: NestedRoute }
  | { readonly kind: 'month'; readonly yearMonth: string }
  | { readonly kind: 'challenge'; readonly slug: string }
  | { readonly kind: 'invalid'; readonly challenge: boolean }

const tabHashes: Record<ReaderTab, string> = {
  today: '#/',
  library: buildShelfRoute(),
  collections: '#/collections',
  more: '#/more',
}

/** Only the existing Harbor Signal parser interprets Month/Challenge URL syntax. */
export function parseNavigationHash(hash: string, options: NavigationRouteOptions): NavigationHashTarget {
  const destination = parseInternalDestination(hash, {
    currentYearMonth: options.currentYearMonth,
    monthScreenEnabled: options.monthScreenEnabled,
    releasedChallengeRouteEnabled: options.releasedChallengeRouteEnabled,
  })
  if (destination?.type === 'releasedChallenge') return { kind: 'challenge', slug: destination.slug }
  if (destination?.type === 'month') return { kind: 'month', yearMonth: destination.yearMonth }

  switch (parseAppIntegrationRoute(hash, options)) {
    case 'library': return { kind: 'tab', tab: 'library', route: { kind: 'browseMonths' } }
    case 'shelf': return { kind: 'tab', tab: 'library' }
    case 'notebook': return { kind: 'tab', tab: 'collections', route: { kind: 'notebook' } }
    case 'savedScripture': return { kind: 'tab', tab: 'collections', route: { kind: 'savedScripture' } }
    case 'news': return { kind: 'tab', tab: 'more', route: { kind: 'news', category: parseNewsCategoryQuery(hash) } }
  }

  if (hash === '' || hash === '#' || hash === tabHashes.today || /^#\/(?:teaching|entry)\/[\w.-]+$/.test(hash)) {
    return { kind: 'tab', tab: 'today' }
  }
  if (hash === tabHashes.collections) return { kind: 'tab', tab: 'collections' }
  if (hash === tabHashes.more) return { kind: 'tab', tab: 'more' }
  return { kind: 'invalid', challenge: /^#\/challenge(?:[/?]|$)/.test(hash) }
}

function buildRouteHash(route: NestedRoute): string | null {
  switch (route.kind) {
    case 'month': return buildInternalDestination({ type: 'month', yearMonth: route.yearMonth })
    case 'browseMonths': return buildLibraryRoute()
    case 'notebook': return buildNotebookRoute()
    case 'savedScripture': return buildSavedScriptureRoute()
    case 'news': return buildNewsRoute(route.category)
    case 'detail': return null
  }
}

/** Session-only screens keep their nearest addressable hash and have their own history entry. */
export function projectNavigationHash(state: NavigationState): string {
  if (state.focused?.kind === 'challenge') {
    const built = buildInternalDestination({
      type: 'releasedChallenge', slug: state.focused.slug, origin: DEFAULT_CHALLENGE_ORIGIN,
    })
    // Keep the shared slug validation and omit legacy origin metadata from the projection.
    if (built) return built.split('?')[0]
  }
  const stack = state.stacks[state.activeTab]
  for (let index = stack.length - 1; index >= 0; index--) {
    const hash = buildRouteHash(stack[index])
    if (hash) return hash
  }
  return tabHashes[state.activeTab]
}
