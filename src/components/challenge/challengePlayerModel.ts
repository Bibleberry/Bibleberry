import { presentCmsScripture } from '../../cms/sanity/presentation.ts'
import type { CmsChallenge, CmsScreen, CmsScripture } from '../../cms/sanity/types.ts'

/**
 * Pure, storage-free navigation and presentation rules for the shared multi-screen Challenge
 * player.
 *
 * Hosts persist a stable screen identity (for CMS content, the Sanity screen `_key`), never an
 * array position. These helpers translate that identity into a safe position and decide which
 * explicit actions and reader/diagnostic labels apply. They never read or write browser storage.
 */

export type ChallengePlayerChallenge = Pick<
  CmsChallenge,
  'title' | 'summary' | 'primaryScripture' | 'screens' | 'companionLinks'
>

export type ChallengePlayerLabels = {
  scriptureCollection?: string
  progressHeading?: string
  progress?: string
  navigation?: string
  startChallenge?: string
}

export type ChallengePlayerCopy = {
  scriptureCollection: string
  progressHeading: string
  progressAriaLabel: string
  navigationAriaLabel: string
  completionMessage: string
  navigationNote: string
  previousButton: string
  nextButton: string
  startChallengeButton: string
  startFromBeginningButton: string
  readAgainButton: string
  finishButton: string
  completedButton: string
}

export function resolveChallengePlayerCopy(options: {
  diagnostics?: boolean
  returnOnFinish?: boolean
  labels?: ChallengePlayerLabels
} = {}): ChallengePlayerCopy {
  const { diagnostics = false, returnOnFinish = false, labels = {} } = options
  return {
    scriptureCollection: labels.scriptureCollection ?? 'My Scripture',
    progressHeading: labels.progressHeading ?? (diagnostics ? 'Required screens' : 'Challenge screens'),
    progressAriaLabel: labels.progress ?? (diagnostics ? 'Required Challenge screen position' : 'Challenge screen position'),
    navigationAriaLabel: labels.navigation ?? 'Challenge screen navigation',
    completionMessage: diagnostics
      ? 'You explicitly completed the required screens. Optional content remains available to revisit.'
      : 'You completed this Challenge. Optional content remains available to revisit.',
    navigationNote: diagnostics
      ? 'Optional studies, reflection choices, and companion links never change required progress. Revisiting does not automatically complete a Challenge.'
      : 'Optional studies, reflection choices, and companion links are never required. Revisiting does not automatically complete a Challenge.',
    previousButton: diagnostics ? 'Back' : 'Previous',
    nextButton: diagnostics ? 'Continue' : 'Next',
    startChallengeButton: labels.startChallenge ?? 'Start Challenge',
    startFromBeginningButton: 'Start from Beginning',
    readAgainButton: 'Read Again',
    finishButton: diagnostics ? 'Complete Challenge' : 'Finish',
    completedButton: diagnostics || !returnOnFinish ? 'Challenge complete' : 'Finish',
  }
}

export type ScripturePanelCopy = {
  ariaLabel: 'Primary Scripture' | 'Scripture focus'
  sectionLabel: string
  status: 'provided' | 'referenceOnly'
  passage?: string
  citationLabel: string
  referenceOnlyNote: string
  practiceNote: string | null
}

/**
 * Resolve reader-facing vs developer-diagnostic copy for a CMS Scripture panel.
 * Ordinary reader mode suppresses CMS/Sanity configuration diagnostics and unavailable-practice
 * notices, while Developer Studio (`diagnostics`) and BerryMark Local Preview (`preview`) retain
 * their full diagnostic wording.
 */
export function resolveScripturePanelCopy(
  scripture: CmsScripture,
  options: { primary?: boolean; preview?: boolean; diagnostics?: boolean } = {},
): ScripturePanelCopy {
  const { primary = false, preview = false, diagnostics = false } = options
  const showDiagnostics = preview || diagnostics
  const presentation = presentCmsScripture(scripture)
  const ariaLabel = primary ? 'Primary Scripture' : 'Scripture focus'
  const showTranslation = Boolean(scripture.translation) && (showDiagnostics || scripture.translation !== 'Not configured')
  const sectionLabel = `${ariaLabel}${showTranslation ? ` · ${scripture.translation}` : ''}`
  const citationLabel = `${scripture.reference}${showTranslation ? ` · ${scripture.translation}` : ''}`
  const referenceOnlyNote = showDiagnostics
    ? `Reference only · No passage text supplied${scripture.translation === 'Not configured' ? ' · Translation not configured' : ''}`
    : 'Reference only · Passage text not included'
  const practiceNote = showDiagnostics
    ? scripture.practiceStatus === 'configured'
      ? `${preview ? 'Practice configured in the local file' : 'Practice configured in Sanity'} · CMS memorization practice is not available in this view`
      : 'Memorization practice not configured'
    : null

  return {
    ariaLabel,
    sectionLabel,
    status: presentation.status,
    passage: presentation.status === 'provided' ? presentation.passage : undefined,
    citationLabel,
    referenceOnlyNote,
    practiceNote,
  }
}

type ScreenList = readonly Pick<CmsScreen, 'id'>[]

/**
 * Resolve a host-supplied screen identity to a position. A missing, unknown, or removed screen
 * identity safely falls back to the first screen rather than throwing or skipping ahead.
 */
export function resolveScreenIndex(screens: ScreenList, screenId: string | undefined) {
  if (!screenId) return 0
  const index = screens.findIndex(screen => screen.id === screenId)
  return index >= 0 ? index : 0
}

export type ChallengePlayerPosition = {
  index: number
  total: number
  /** Stable identity of the resolved current screen, or undefined when there are no screens. */
  screenId: string | undefined
  previousScreenId: string | undefined
  nextScreenId: string | undefined
  isFirst: boolean
  isLast: boolean
}

export function challengePlayerPosition(screens: ScreenList, screenId: string | undefined): ChallengePlayerPosition {
  const total = screens.length
  const index = total === 0 ? 0 : resolveScreenIndex(screens, screenId)
  return {
    index,
    total,
    screenId: screens[index]?.id,
    previousScreenId: index > 0 ? screens[index - 1]?.id : undefined,
    nextScreenId: index < total - 1 ? screens[index + 1]?.id : undefined,
    isFirst: index === 0,
    isLast: total > 0 && index === total - 1,
  }
}

/**
 * Explicit completion is offered only on the final required screen and only once. Optional
 * studies, reflection choices, and companion links are never prerequisites.
 */
export function canCompleteChallenge(position: ChallengePlayerPosition, isCompleted: boolean) {
  return position.isLast && !isCompleted
}

/**
 * Formats textual screen-position copy. Ordinary reader mode uses the approved `Screen n of N`
 * phrasing, while Developer Studio diagnostics retain its compact `n of N` format.
 */
export function formatChallengeScreenPosition(
  position: Pick<ChallengePlayerPosition, 'index' | 'total'>,
  options: { diagnostics?: boolean } = {},
): string {
  const current = position.total === 0 ? 0 : position.index + 1
  return options.diagnostics ? `${current} of ${position.total}` : `Screen ${current} of ${position.total}`
}

/**
 * Resolves the stable identity of the first screen for safe `Start from Beginning` navigation.
 */
export function resolveFirstScreenId(screens: ScreenList): string | undefined {
  return screens[0]?.id
}

/**
 * `Start from Beginning` is enabled on multi-screen Challenges whenever the reader has moved
 * beyond the first screen.
 */
export function canStartChallengeFromBeginning(position: ChallengePlayerPosition): boolean {
  return position.total > 1 && !position.isFirst
}
