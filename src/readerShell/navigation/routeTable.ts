import { formatCivilYearMonthFromDate } from '../../components/month/monthScreenModel.ts'
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

function screenKey(tab: ReaderTab, route: ReaderRoute): string {
  switch (route.kind) {
    case 'landing': return tab
    case 'month': return `${tab}:month:${route.yearMonth}`
    case 'detail': return route.screen === 'newsArticle'
      ? JSON.stringify([tab, route.screen, route.id])
      : `${tab}:detail:${route.screen}`
    default: return `${tab}:${route.kind}`
  }
}

export function activeScreenKey(state: NavigationState): string {
  if (state.focused?.kind === 'challenge') return `challenge:${state.focused.slug}`
  if (!state.problem && state.focused?.kind === 'intro' && state.activeTab === 'more') return 'more:intro'
  if (state.problem || state.focused) return 'unavailable'
  return screenKey(state.activeTab, activeRoute(state))
}
