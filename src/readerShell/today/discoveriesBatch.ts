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
const MAX_BATCH_SIZE = 64

export function encodeDiscoveriesBatch(awardIds: readonly CanonicalAwardId[]): string | null {
  const unique: CanonicalAwardId[] = []
  for (const raw of awardIds) {
    const id = parseCanonicalMonthlyAwardId(raw)
    if (!id || unique.includes(id)) continue
    unique.push(id)
  }
  if (unique.length === 0 || unique.length > MAX_BATCH_SIZE) return null
  return unique.join(SEPARATOR)
}

/** Returns the referenced canonical award IDs in announcement order, or `null` when malformed. */
export function parseDiscoveriesBatch(raw: unknown): readonly CanonicalAwardId[] | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  const parts = raw.split(SEPARATOR)
  if (parts.length > MAX_BATCH_SIZE) return null
  const ids: CanonicalAwardId[] = []
  for (const part of parts) {
    const id = parseCanonicalMonthlyAwardId(part)
    if (!id || ids.includes(id)) return null
    ids.push(id)
  }
  return Object.freeze(ids)
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
