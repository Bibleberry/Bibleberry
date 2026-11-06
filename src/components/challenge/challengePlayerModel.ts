import type { CmsScreen } from '../../cms/sanity/types.ts'

/**
 * Pure, storage-free navigation rules for the shared multi-screen Challenge player.
 *
 * Hosts persist a stable screen identity (for CMS content, the Sanity screen `_key`), never an
 * array position. These helpers translate that identity into a safe position and decide which
 * explicit actions are available. They never read or write browser storage.
 */

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
