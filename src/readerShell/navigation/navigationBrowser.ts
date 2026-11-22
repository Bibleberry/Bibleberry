import { z } from 'zod'
import { areChallengeOriginsEqual } from '../../cms/reader/challengeOrigin.ts'
import type { DeepLinkIngressOutcome } from '../../deepLinkIngress/types.ts'
import {
  parseNavigationHash,
  projectNavigationHash,
  type NavigationRouteOptions,
} from './navigationHash.ts'
import {
  createNavigationState,
  focusSchema,
  navigationReducer,
  problemSchema,
  restorationsSchema,
  routeSchema,
  sessionChallengeReturn,
  stacksSchema,
  tabSchema,
  type NavigationAction,
  type NavigationState,
} from './navigationModel.ts'

const version = 1
const navigationId = z.int().positive()
const receiptSchema = z.object({ version: z.literal(version), sessionId: z.string().min(1), navId: navigationId })
const historyStateSchema = z.object({ r06Navigation: receiptSchema })
const frameSchema = z.object({
  activeTab: tabSchema,
  stack: z.array(routeSchema),
  focused: focusSchema.nullable(),
  problem: problemSchema.nullable(),
})
type Frame = Readonly<Omit<z.infer<typeof frameSchema>, 'stack'> & { stack: NavigationState['stacks']['today'] }>

const entrySchema = z.object({ frame: frameSchema, hash: z.string(), previousId: navigationId.nullable() })
interface Entry extends Readonly<Omit<z.infer<typeof entrySchema>, 'frame'>> {
  readonly frame: Frame
}

const sessionSchema = z.object({
  version: z.literal(version),
  sessionId: z.string().min(1),
  nextId: navigationId,
  stacks: stacksSchema,
  restoration: restorationsSchema,
  entries: z.record(z.string().regex(/^[1-9]\d*$/), entrySchema),
})

export interface BrowserNavigation {
  readonly state: NavigationState
  readonly sessionId: string
  readonly nextId: number
  readonly currentId: number | null
  readonly entries: Readonly<Partial<Record<number, Entry>>>
}

export type NavigationHistoryEffect =
  | { readonly type: 'none' | 'back' }
  | {
      readonly type: 'push' | 'replace'
      readonly hash: string
      readonly state: Readonly<z.infer<typeof historyStateSchema>>
    }

export interface NavigationUpdate {
  readonly navigation: BrowserNavigation
  readonly history: NavigationHistoryEffect
}

export interface BrowserAddress {
  readonly hash: string
  /** The actual window.history.state for this entry, read independently of the URL. */
  readonly historyState?: unknown
}

export type ChallengeAuthorization =
  | { readonly slug: string; readonly status: 'authorized'; readonly documentId?: string }
  | { readonly slug: string; readonly status: 'unavailable' }

export type BrowserRestore =
  | (NavigationUpdate & { readonly status: 'ready' })
  | { readonly status: 'challengeAuthorizationRequired'; readonly slug: string; readonly expectedDocumentId?: string }

/** Supply a fresh session ID (e.g. crypto.randomUUID) and only this tab's sessionStorage value. */
export function createBrowserNavigation(newSessionId: string, stored?: string | null): BrowserNavigation {
  const fresh = { state: createNavigationState(), sessionId: newSessionId, nextId: 1, currentId: null, entries: {} }
  if (!stored) return fresh
  try {
    const result = sessionSchema.safeParse(JSON.parse(stored))
    if (!result.success) return fresh
    const { sessionId, nextId, entries, stacks, restoration } = result.data
    if (Object.keys(entries).some(id => Number(id) >= nextId)) return fresh
    // The current location must be resolved separately before restoring any active frame.
    return { sessionId, nextId, currentId: null, entries, state: { ...fresh.state, stacks, restoration } }
  } catch {
    return fresh
  }
}

export function serializeBrowserNavigation(navigation: BrowserNavigation): string {
  const { sessionId, nextId, entries, state: { stacks, restoration } } = navigation
  return JSON.stringify({ version, sessionId, nextId, entries, stacks, restoration })
}

function frameFor(state: NavigationState): Frame {
  const { activeTab, stacks, focused, problem } = state
  return { activeTab, stack: stacks[activeTab], focused, problem }
}

function restoreFrame(state: NavigationState, frame: Frame): NavigationState {
  const { activeTab, stack, focused, problem } = frame
  return { ...state, activeTab, stacks: { ...state.stacks, [activeTab]: stack }, focused, problem }
}

function sameFrame(left: Frame, right: Frame): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function currentEntry(navigation: BrowserNavigation): Entry | undefined {
  return navigation.currentId === null ? undefined : navigation.entries[navigation.currentId]
}

function noHistory(navigation: BrowserNavigation, state = navigation.state): NavigationUpdate {
  return { navigation: state === navigation.state ? navigation : { ...navigation, state }, history: { type: 'none' } }
}

function writeEntry(navigation: BrowserNavigation, state: NavigationState, type: 'push' | 'replace'): NavigationUpdate {
  const old = currentEntry(navigation)
  const replaceId = type === 'replace' && old ? navigation.currentId : null
  const navId = replaceId ?? navigation.nextId
  const nextId = replaceId === null ? navigation.nextId + 1 : navigation.nextId
  const previousId = type === 'replace' ? old?.previousId ?? null : old ? navigation.currentId : null
  const hash = projectNavigationHash(state)
  const entry = { hash, previousId, frame: frameFor(state) }
  return {
    navigation: { ...navigation, state, currentId: navId, nextId, entries: { ...navigation.entries, [navId]: entry } },
    history: { type, hash, state: { r06Navigation: { version, sessionId: navigation.sessionId, navId } } },
  }
}

const closeActions = new Set(['pop', 'exitChallenge', 'finishChallenge', 'closeGuidance'])

/** Apply a trusted UI intent after the shell has resolved the current browser entry. */
export function applyNavigationAction(navigation: BrowserNavigation, action: NavigationAction): NavigationUpdate {
  const state = navigationReducer(navigation.state, action)
  if (action.type === 'saveRestoration' || state === navigation.state || sameFrame(frameFor(state), frameFor(navigation.state))) {
    return noHistory(navigation, state)
  }
  if (closeActions.has(action.type)) {
    const previousId = currentEntry(navigation)?.previousId
    const previous = previousId && navigation.entries[previousId]
    const external = navigation.state.focused?.kind === 'challenge' && navigation.state.focused.entry === 'external'
    if (!external && previous && sameFrame(previous.frame, frameFor(state))) {
      // The following POP restores the entry. The effect itself never records a Finish.
      return { navigation, history: { type: 'back' } }
    }
    return writeEntry(navigation, state, 'replace')
  }
  const replace = action.type === 'showTutorialTab' || action.type === 'returnToToday' || action.type === 'unavailable'
  return writeEntry(navigation, state, replace ? 'replace' : 'push')
}

function matchEntry(navigation: BrowserNavigation, address: BrowserAddress) {
  const candidate = historyStateSchema.safeParse(address.historyState)
  if (!candidate.success) return undefined
  const { sessionId, navId } = candidate.data.r06Navigation
  const entry = navigation.entries[navId]
  if (sessionId !== navigation.sessionId || !entry || entry.hash !== address.hash) return undefined
  const state = restoreFrame(navigation.state, entry.frame)
  if (projectNavigationHash(state) !== address.hash) return undefined
  if (state.focused?.kind === 'challenge') {
    const trusted = state.focused.entry === 'inSession' ? sessionChallengeReturn(state) : undefined
    if (trusted && (trusted.entry !== 'inSession' || !areChallengeOriginsEqual(trusted.origin, state.focused.origin))) {
      return undefined
    }
    if (!trusted && (state.focused.origin.kind !== 'hub' || state.focused.expectedDocumentId !== undefined)) {
      return undefined
    }
  }
  return { ...navigation, state, currentId: navId }
}

/**
 * The future shell is the single history owner under the existing BrowserRouter wrapper.
 * Apply returned effects through window.history and preserve unrelated history.state
 * fields on replacement. Feed the actual URL and state back on mount (including reload) and on POP or
 * hash changes. The same managed address is safe to resolve twice. Let the browser own
 * traversal across external boundaries. Persist the serialized session in sessionStorage;
 * use the live session in memory if storage is unavailable. Keep these decisions out of
 * router hooks and route components.
 *
 * If authorization is required, show a pending view and obtain the current gateway result
 * before rendering a Challenge. Discard superseded results (including same-slug requests)
 * when the location changes, then resolve the current address with the matching verdict.
 */
export function restoreBrowserLocation(
  navigation: BrowserNavigation,
  address: BrowserAddress,
  options: NavigationRouteOptions,
  authorization?: ChallengeAuthorization,
): BrowserRestore {
  const matched = matchEntry(navigation, address)
  const target = parseNavigationHash(address.hash, options)
  const replace = (state: NavigationState): BrowserRestore => ({
    status: 'ready', ...writeEntry(matched ?? { ...navigation, currentId: null }, state, 'replace'),
  })
  const unavailable = (problem: 'invalidRoute' | 'challengeUnavailable' | 'externalMonth') => replace(
    navigationReducer(navigation.state, { type: 'unavailable', problem }),
  )
  if (target.kind === 'challenge') {
    const focused = matched?.state.focused
    const expectedDocumentId = focused?.kind === 'challenge' ? focused.expectedDocumentId : undefined
    if (authorization?.slug !== target.slug) {
      return { status: 'challengeAuthorizationRequired', slug: target.slug, expectedDocumentId }
    }
    if (authorization.status !== 'authorized' || (expectedDocumentId && authorization.documentId !== expectedDocumentId)) {
      if (matched && focused?.kind === 'challenge' && focused.entry === 'inSession') {
        return replace({ ...matched.state, focused: null, problem: 'challengeUnavailable' })
      }
      return unavailable('challengeUnavailable')
    }
    if (matched && focused?.kind === 'challenge') return { status: 'ready', ...noHistory(matched) }
    return replace(navigationReducer(navigation.state, { type: 'enterExternalChallenge', slug: target.slug }))
  }
  if (target.kind === 'invalid') return unavailable(target.challenge ? 'challengeUnavailable' : 'invalidRoute')
  if (matched) return { status: 'ready', ...noHistory(matched) }
  if (target.kind === 'month') return unavailable('externalMonth')
  return replace({
    ...navigation.state,
    activeTab: target.tab,
    stacks: { ...navigation.state.stacks, [target.tab]: target.route ? [target.route] : [] },
    focused: null,
    problem: null,
  })
}

/** The native controller has already performed gateway authorization. Never read history origin for its events. */
export function applyNativeIngress(
  navigation: BrowserNavigation,
  outcome: DeepLinkIngressOutcome,
  options: NavigationRouteOptions,
): NavigationUpdate {
  if (outcome.status === 'ignoredDuplicate') return noHistory(navigation)
  if (outcome.status === 'navigated') {
    const target = parseNavigationHash(outcome.internalHash, options)
    const { destination, info } = outcome
    if (target.kind === 'month' && destination.type === 'month' && info.contentKind === 'month' &&
      target.yearMonth === destination.yearMonth && target.yearMonth === info.yearMonth) {
      return applyNavigationAction(navigation, { type: 'unavailable', problem: 'externalMonth' })
    }
    if (target.kind === 'challenge' && destination.type === 'releasedChallenge' &&
      info.contentKind === 'releasedChallenge' && destination.entry === 'external' &&
      target.slug === destination.slug && target.slug === info.slug) {
      const action = { type: 'enterExternalChallenge', slug: target.slug } as const
      if (outcome.sourceEvent.trigger === 'coldStart') {
        return writeEntry(navigation, navigationReducer(navigation.state, action), 'replace')
      }
      return applyNavigationAction(navigation, action)
    }
  }
  return applyNavigationAction(navigation, { type: 'unavailable', problem: 'challengeUnavailable' })
}
