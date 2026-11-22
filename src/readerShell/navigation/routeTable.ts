import { formatCivilYearMonthFromDate } from '../../components/month/monthScreenModel.ts'
import {
  applyNavigationAction,
  restoreBrowserLocation,
  type BrowserAddress,
  type BrowserNavigation,
  type NavigationUpdate,
} from './navigationBrowser.ts'
import type { NavigationRouteOptions } from './navigationHash.ts'
import { activeRoute, type NavigationState, type ReaderRoute, type ReaderTab } from './navigationModel.ts'

export function readerRouteOptions(): NavigationRouteOptions {
  return {
    currentYearMonth: formatCivilYearMonthFromDate(),
    monthScreenEnabled: true,
    releasedChallengeRouteEnabled: true,
    historicalLibraryEnabled: true,
    fieldNotebookEnabled: true,
    savedScriptureEnabled: true,
    newsReaderEnabled: true,
  }
}

export function resolveReaderLocation(
  navigation: BrowserNavigation,
  address: BrowserAddress,
  options: NavigationRouteOptions,
): NavigationUpdate {
  const result = restoreBrowserLocation(navigation, address, options)
  if (result.status === 'ready') return result

  // WP-03a and WP-07a will supply the focused host and gateway authorization.
  const unavailable = restoreBrowserLocation(navigation, address, options, {
    slug: result.slug,
    status: 'unavailable',
  })
  if (unavailable.status === 'ready') return unavailable
  return applyNavigationAction(navigation, { type: 'unavailable', problem: 'challengeUnavailable' })
}

function screenKey(tab: ReaderTab, route: ReaderRoute): string {
  switch (route.kind) {
    case 'landing': return tab
    case 'month': return `${tab}:month:${route.yearMonth}`
    case 'detail': return `${tab}:detail:${route.screen}`
    default: return `${tab}:${route.kind}`
  }
}

export function activeScreenKey(state: NavigationState): string {
  if (state.problem || state.focused) return 'unavailable'
  return screenKey(state.activeTab, activeRoute(state))
}
