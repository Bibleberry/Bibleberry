import type { ReaderTab } from '../navigation/navigationModel.ts'

export interface GuidedTutorialStep {
  readonly tab: ReaderTab
  readonly targetId: string
  readonly destinationLabel: string
  readonly heading: string
  readonly summary: string
  readonly controlsSummary: string
  readonly nonvisualGuidance: string
}

export interface RectLike {
  readonly top: number
  readonly left: number
  readonly right: number
  readonly bottom: number
  readonly width: number
  readonly height: number
}

export interface ViewportLike {
  readonly width: number
  readonly height: number
}

export type SpotlightGeometry =
  | {
      readonly available: true
      readonly top: number
      readonly left: number
      readonly width: number
      readonly height: number
    }
  | {
      readonly available: false
    }

export const GUIDED_TUTORIAL_STEPS: readonly GuidedTutorialStep[] = [
  {
    tab: 'today',
    targetId: 'tab-today',
    destinationLabel: 'Today',
    heading: 'Today',
    summary:
      'Start here for today’s Challenge, a quick link to the current Month Screen, and recent ministry updates.',
    controlsSummary:
      'Use Today to open or resume today’s reading, visit the current Month Screen, and check recent updates.',
    nonvisualGuidance:
      'In the primary navigation bar, select the Today tab to return to your daily reading and current Month Screen.',
  },
  {
    tab: 'library',
    targetId: 'tab-library',
    destinationLabel: 'Library',
    heading: 'Library',
    summary:
      'Keep up to three historical months on your Shelf, open Browse All Months for the full catalogue, or visit Foundations.',
    controlsSummary:
      'Use Library to manage your Shelf, browse all released months, and open Foundations.',
    nonvisualGuidance:
      'In the primary navigation bar, select the Library tab to open your Shelf, Browse All Months, or Foundations.',
  },
  {
    tab: 'collections',
    targetId: 'tab-collections',
    destinationLabel: 'Collections',
    heading: 'Collections',
    summary:
      'Open Field Notebook to review earned Scripture Cards and lifetime progress, or open Saved Scripture to revisit saved passages.',
    controlsSummary:
      'Use Collections to open Field Notebook and Saved Scripture.',
    nonvisualGuidance:
      'In the primary navigation bar, select the Collections tab to access your Field Notebook and Saved Scripture.',
  },
  {
    tab: 'more',
    targetId: 'tab-more',
    destinationLabel: 'More',
    heading: 'More',
    summary:
      'Read ministry news, check Account & Progress, adjust announcement preferences, or replay the Introduction and App Tutorial anytime.',
    controlsSummary:
      'Use More for View All News, About Bibleberry, Account & Progress, announcement preferences, Review Introduction, and App Tutorial.',
    nonvisualGuidance:
      'In the primary navigation bar, select the More tab for ministry news, preferences, Account & Progress, and replaying the Introduction or App Tutorial.',
  },
] as const

export function stepIndexForTab(tab: ReaderTab): number {
  const index = GUIDED_TUTORIAL_STEPS.findIndex(step => step.tab === tab)
  return index >= 0 ? index : 0
}

export function stepForTab(tab: ReaderTab): GuidedTutorialStep {
  return GUIDED_TUTORIAL_STEPS[stepIndexForTab(tab)]
}

export function nextTutorialTab(tab: ReaderTab): ReaderTab | null {
  const index = stepIndexForTab(tab)
  return GUIDED_TUTORIAL_STEPS[index + 1]?.tab ?? null
}

export function previousTutorialTab(tab: ReaderTab): ReaderTab | null {
  const index = stepIndexForTab(tab)
  return index > 0 ? GUIDED_TUTORIAL_STEPS[index - 1].tab : null
}

export function formatTutorialStepProgress(tab: ReaderTab): string {
  const index = stepIndexForTab(tab)
  return `Step ${index + 1} of ${GUIDED_TUTORIAL_STEPS.length}`
}

export function formatTutorialStepAnnouncement(
  step: GuidedTutorialStep,
  index: number,
  total: number,
  options: { readonly targetAvailable: boolean; readonly textGuideMode: boolean },
): string {
  const prefix = `App Tutorial step ${index + 1} of ${total}: ${step.heading}.`
  if (options.textGuideMode) {
    return `${prefix} Text guide active. ${step.nonvisualGuidance}`
  }
  if (!options.targetAvailable) {
    return `${prefix} Visual highlight unavailable in this view; text guidance shown. ${step.nonvisualGuidance}`
  }
  return `${prefix} ${step.nonvisualGuidance}`
}

export function computeSpotlightGeometry(
  rect: RectLike | null,
  viewport: ViewportLike,
  padding = 4,
): SpotlightGeometry {
  if (!rect) return { available: false }
  if (
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.right) ||
    !Number.isFinite(rect.bottom) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height)
  ) {
    return { available: false }
  }
  if (rect.width <= 0 || rect.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return { available: false }
  }
  // Reject completely off-screen targets.
  if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= viewport.width || rect.top >= viewport.height) {
    return { available: false }
  }

  const safePadding = Math.max(0, padding)
  const top = Math.max(0, Math.round(rect.top - safePadding))
  const left = Math.max(0, Math.round(rect.left - safePadding))
  const right = Math.min(viewport.width, Math.round(rect.right + safePadding))
  const bottom = Math.min(viewport.height, Math.round(rect.bottom + safePadding))
  const width = Math.max(0, right - left)
  const height = Math.max(0, bottom - top)

  if (width <= 0 || height <= 0) {
    return { available: false }
  }

  return {
    available: true,
    top,
    left,
    width,
    height,
  }
}
