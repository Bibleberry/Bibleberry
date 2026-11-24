import { z } from 'zod'
import { isValidChallengeYearMonth } from '../../cms/reader/challengeOrigin.ts'
import { buildInternalDestination } from '../../native/internalDestination.ts'
import { resolveTrustedChallengeReturn } from '../../native/trustedChallengeOrigin.ts'

export const READER_TABS = ['today', 'library', 'collections', 'more'] as const
export const tabSchema = z.enum(READER_TABS)
export type ReaderTab = z.infer<typeof tabSchema>

const yearMonthSchema = z.string().refine(value => isValidChallengeYearMonth(value) && value === value.trim())

export const routeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('month'), yearMonth: yearMonthSchema }),
  z.object({ kind: z.enum(['browseMonths', 'notebook', 'savedScripture']) }),
  z.object({
    kind: z.literal('news'),
    category: z.enum(['all', 'ministryUpdate', 'announcement', 'monthlyPreview']),
  }),
  // Host-owned screens and identifiers are session-only until they have a public route contract.
  z.object({ kind: z.literal('detail'), screen: z.string().min(1), id: z.string().min(1).optional() }),
])

export type NestedRoute = Readonly<z.infer<typeof routeSchema>>
export type ReaderRoute = NestedRoute | { readonly kind: 'landing'; readonly tab: ReaderTab }

export const restorationSchema = z.object({
  scrollTop: z.number().nonnegative(),
  focusId: z.string().optional(),
  monthPreview: z.literal(true).optional(),
})
export type RouteRestoration = Readonly<z.infer<typeof restorationSchema>>

const challengeOriginSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hub') }),
  z.object({ kind: z.literal('month'), yearMonth: yearMonthSchema }),
  z.object({ kind: z.enum(['shelf', 'library']), yearMonth: yearMonthSchema.optional() }),
])

export const focusSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('challenge'),
    slug: z.string(),
    origin: challengeOriginSchema,
    entry: z.enum(['inSession', 'external']),
    expectedDocumentId: z.string().min(1).optional(),
  }),
  z.object({ kind: z.enum(['monthIntro', 'intro']) }),
  z.object({ kind: z.literal('tutorial'), shownTab: tabSchema }),
])

export const problemSchema = z.enum(['invalidRoute', 'challengeUnavailable', 'externalMonth'])
export type NavigationProblem = z.infer<typeof problemSchema>
export type FocusedMode = Readonly<z.infer<typeof focusSchema>>
export const stacksSchema = z.record(tabSchema, z.array(routeSchema))
export const restorationsSchema = z.record(z.string(), restorationSchema)

export interface NavigationState {
  readonly activeTab: ReaderTab
  readonly stacks: Readonly<Record<ReaderTab, readonly NestedRoute[]>>
  readonly restoration: Readonly<Partial<Record<string, RouteRestoration>>>
  readonly focused: FocusedMode | null
  readonly problem: NavigationProblem | null
}

export type NavigationAction =
  | { readonly type: 'selectTab'; readonly tab: ReaderTab }
  | { readonly type: 'push'; readonly route: NestedRoute }
  | { readonly type: 'pop' }
  | { readonly type: 'saveRestoration'; readonly value: RouteRestoration }
  // Trusted in-app selection. The Challenge host still owns content authorization.
  | { readonly type: 'openChallenge'; readonly slug: string; readonly expectedDocumentId?: string }
  // Dispatch only after the gateway has authorized this browser or native destination.
  | { readonly type: 'enterExternalChallenge'; readonly slug: string }
  | { readonly type: 'exitChallenge' | 'finishChallenge' }
  | { readonly type: 'openMonthIntro' | 'openIntro' | 'openTutorial' | 'closeGuidance' }
  | { readonly type: 'showTutorialTab'; readonly tab: ReaderTab }
  | { readonly type: 'unavailable'; readonly problem: NavigationProblem }
  | { readonly type: 'returnToToday' }

export function createNavigationState(): NavigationState {
  return {
    activeTab: 'today',
    stacks: { today: [], library: [], collections: [], more: [] },
    restoration: {},
    focused: null,
    problem: null,
  }
}

export function activeRoute(state: NavigationState): ReaderRoute {
  return state.stacks[state.activeTab].at(-1) ?? { kind: 'landing', tab: state.activeTab }
}

function restorationKey(state: NavigationState): string {
  const route = activeRoute(state)
  const prefix = state.activeTab
  switch (route.kind) {
    case 'month': return `month:${route.yearMonth}`
    case 'news': return `${prefix}:news:${route.category}`
    case 'detail': return `${prefix}:detail:${JSON.stringify([route.screen, route.id])}`
    default: return `${prefix}:${route.kind}`
  }
}

export function activeRestoration(state: NavigationState): RouteRestoration | undefined {
  return state.restoration[restorationKey(state)]
}

export function globalNavigation(state: NavigationState): 'visible' | 'hidden' | 'guided' {
  if (state.focused?.kind === 'tutorial') return 'guided'
  return state.focused ? 'hidden' : 'visible'
}

export function sessionChallengeReturn(state: NavigationState) {
  const route = activeRoute(state)
  if (route.kind === 'month') {
    return resolveTrustedChallengeReturn({ kind: 'month', yearMonth: route.yearMonth })
  }
  if (state.activeTab === 'library' && (route.kind === 'landing' || route.kind === 'browseMonths')) {
    return resolveTrustedChallengeReturn({ kind: route.kind === 'landing' ? 'shelf' : 'library' })
  }
  return resolveTrustedChallengeReturn(
    route.kind === 'landing' && route.tab === 'today' ? { kind: 'hub' } : undefined,
  )
}

function returnToToday(state: NavigationState, problem: NavigationProblem | null = null): NavigationState {
  return { ...state, activeTab: 'today', stacks: { ...state.stacks, today: [] }, focused: null, problem }
}

export function navigationReducer(state: NavigationState, action: NavigationAction): NavigationState {
  const { activeTab, stacks, focused, problem } = state
  switch (action.type) {
    case 'selectTab': {
      if (focused) return state
      if (action.tab !== activeTab) return { ...state, activeTab: action.tab, problem: null }
      const landing = { ...state, stacks: { ...stacks, [activeTab]: [] }, problem: null }
      return { ...landing, restoration: { ...state.restoration, [restorationKey(landing)]: { scrollTop: 0 } } }
    }
    case 'push': {
      const route = routeSchema.safeParse(action.route)
      if (focused || problem || !route.success) return state
      if (JSON.stringify(stacks[activeTab].at(-1)) === JSON.stringify(route.data)) return state
      return { ...state, stacks: { ...stacks, [activeTab]: [...stacks[activeTab], route.data] } }
    }
    case 'pop':
      if (focused?.kind === 'challenge' && focused.entry === 'external') return state
      if (focused || problem) return { ...state, focused: null, problem: null }
      if (stacks[activeTab].length === 0) return state
      return { ...state, stacks: { ...stacks, [activeTab]: stacks[activeTab].slice(0, -1) } }
    case 'saveRestoration': {
      const value = restorationSchema.safeParse(action.value)
      if (focused || problem || !value.success) return state
      return { ...state, restoration: { ...state.restoration, [restorationKey(state)]: value.data } }
    }
    case 'openChallenge': {
      if (focused || problem) return state
      const trusted = sessionChallengeReturn(state)
      if (trusted.entry !== 'inSession' || (action.expectedDocumentId !== undefined && !action.expectedDocumentId)) {
        return state
      }
      if (!buildInternalDestination({ type: 'releasedChallenge', slug: action.slug, origin: trusted.origin })) {
        return state
      }
      const { slug, expectedDocumentId } = action
      return { ...state, focused: { kind: 'challenge', slug, ...trusted, expectedDocumentId } }
    }
    case 'enterExternalChallenge': {
      const external = resolveTrustedChallengeReturn(undefined)
      if (!buildInternalDestination({ type: 'releasedChallenge', slug: action.slug, origin: external.origin })) {
        return returnToToday(state, 'challengeUnavailable')
      }
      return {
        ...returnToToday(state),
        focused: { kind: 'challenge', slug: action.slug, ...external },
      }
    }
    case 'exitChallenge':
    case 'finishChallenge':
      if (focused?.kind !== 'challenge') return state
      return focused.entry === 'external' ? returnToToday(state) : { ...state, focused: null }
    case 'openMonthIntro':
      return !focused && !problem && activeRoute(state).kind === 'month'
        ? { ...state, focused: { kind: 'monthIntro' } }
        : state
    case 'openIntro':
    case 'openTutorial':
      if (focused || problem || activeRoute(state).kind !== 'landing' || (activeTab !== 'today' && activeTab !== 'more')) {
        return state
      }
      return { ...state, focused: action.type === 'openIntro' ? { kind: 'intro' } : { kind: 'tutorial', shownTab: activeTab } }
    case 'showTutorialTab':
      return focused?.kind === 'tutorial' && focused.shownTab !== action.tab
        ? { ...state, focused: { ...focused, shownTab: action.tab } }
        : state
    case 'closeGuidance':
      return focused && focused.kind !== 'challenge' ? { ...state, focused: null } : state
    case 'unavailable':
      return returnToToday(state, action.problem)
    case 'returnToToday':
      return returnToToday(state)
  }
}
