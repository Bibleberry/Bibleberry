import {
  projectValidatedEarnedAwards,
  type NotebookEarnedCardItem,
} from '../../components/notebook/fieldNotebookModel.ts'
import { parseCanonicalMonthlyAwardId } from '../../participation/identity.ts'
import type { CanonicalAwardId, ReaderParticipationData } from '../../participation/types.ts'

/**
 * Coastal Osprey (Issue #322): the focused `View Discoveries` gallery is bound to the
 * exact award IDs one Today announcement presented. The IDs travel in the session-only
 * Today route so a reload or browser traversal reopens the same batch, never a newer one.
 */
export const VIEW_DISCOVERIES_SCREEN = 'viewDiscoveries'

const SEPARATOR = ' '

/**
 * Encodes the whole batch, in order. There is no size cap: a long opt-out can produce a
 * large catch-up batch, and every referenced award must stay reachable. Returns `null`
 * (and the caller must not acknowledge) when any ID is invalid or repeated, so a batch is
 * never silently truncated.
 */
export function encodeDiscoveriesBatch(awardIds: readonly CanonicalAwardId[]): string | null {
  if (awardIds.length === 0) return null
  const seen = new Set<CanonicalAwardId>()
  for (const raw of awardIds) {
    const id = parseCanonicalMonthlyAwardId(raw)
    if (!id || seen.has(id)) return null
    seen.add(id)
  }
  return awardIds.join(SEPARATOR)
}

/** Returns the referenced canonical award IDs in announcement order, or `null` when malformed. */
export function parseDiscoveriesBatch(raw: unknown): readonly CanonicalAwardId[] | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  const ids: CanonicalAwardId[] = []
  const seen = new Set<CanonicalAwardId>()
  for (const part of raw.split(SEPARATOR)) {
    const id = parseCanonicalMonthlyAwardId(part)
    if (!id || seen.has(id)) return null
    seen.add(id)
    ids.push(id)
  }
  return Object.freeze(ids)
}

/**
 * Opens the gallery for the exact batch, then acknowledges it. The acknowledgement runs
 * only when the handoff succeeded, so a batch can never be acknowledged and disappear
 * without its gallery opening.
 */
export function handOffDiscoveriesBatch(
  awardIds: readonly CanonicalAwardId[],
  openGallery: (awardIds: readonly CanonicalAwardId[]) => boolean,
  acknowledge: () => void,
): boolean {
  if (awardIds.length === 0 || !openGallery(awardIds)) return false
  acknowledge()
  return true
}

/**
 * Projects only the referenced awards that are durably earned, in announcement order.
 * Records without a validated Card snapshot stay in the batch as unavailable items so
 * the gallery never fetches or fabricates unearned art.
 */
export function projectDiscoveriesBatch(
  data: ReaderParticipationData,
  awardIds: readonly CanonicalAwardId[],
): readonly NotebookEarnedCardItem[] {
  const earned = new Map(projectValidatedEarnedAwards(data).map(item => [item.awardId, item]))
  const items: NotebookEarnedCardItem[] = []
  for (const id of awardIds) {
    const item = earned.get(id)
    if (item) items.push(item)
  }
  return Object.freeze(items)
}
