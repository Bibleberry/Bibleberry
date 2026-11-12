import { useMemo, useState } from 'react'
import { defaultGuestParticipationStore } from '../../participation/defaultGuestStore.ts'
import type { ReaderParticipationStore } from '../../participation/store.ts'
import type { ChallengeIdentityNamespace, LocalCalendarDate } from '../../participation/types.ts'
import { useReaderParticipation } from '../../participation/useReaderParticipation.ts'
import {
  SavedScriptureCollectionView,
  type SavedScriptureViewStatus,
} from './SavedScriptureCollectionView.tsx'
import {
  projectSavedScriptureCollection,
  resolveCurrentLocalCalendarDate,
  type SavedScriptureCollectionItem,
} from './savedScriptureCollectionModel.ts'

export interface SavedScriptureHostProps {
  /** Durable V2 participation store. Defaults to `defaultGuestParticipationStore`. */
  readonly store?: ReaderParticipationStore
  readonly allowedNamespace?: ChallengeIdentityNamespace
  /** Optional clock override for deterministic tests. */
  readonly getToday?: () => LocalCalendarDate
  readonly onExit?: () => void
  readonly exitLabel?: string
  readonly headingText?: string
}

/**
 * Store-connected container for the Saved Scripture collection (R09-1 / Issue #120).
 *
 * Reads `savedScriptures` from the durable V2 `ReaderParticipationStore` and dispatches
 * `setScriptureSaved` (`saved: false`) for individual removals without altering
 * `earnedAwards`, `completedChallenges`, or other participation state.
 */
export function SavedScriptureHost({
  store = defaultGuestParticipationStore,
  allowedNamespace = 'cms',
  getToday = resolveCurrentLocalCalendarDate,
  onExit,
  exitLabel = 'Return',
  headingText = 'Saved Scripture',
}: SavedScriptureHostProps) {
  const snapshot = useReaderParticipation(store)
  const [isRetryingWrite, setIsRetryingWrite] = useState(false)

  const items = useMemo(
    () => projectSavedScriptureCollection(snapshot.data, { allowedNamespace }),
    [snapshot.data, allowedNamespace],
  )

  let status: SavedScriptureViewStatus = 'ready'
  let statusMessage: string | null = null
  let writeErrorMessage: string | null = null

  if (snapshot.status === 'hydrating') {
    status = 'loading'
    statusMessage = 'Loading your Saved Scripture references from device storage…'
  } else if (snapshot.health === 'corruptStoredData') {
    status = 'readError'
    statusMessage =
      'Saved participation records on this device could not be read cleanly. Existing data was left untouched.'
  } else if (snapshot.health === 'unsupportedNewerSchema') {
    status = 'readError'
    statusMessage =
      'Saved participation records on this device were written by a newer version of Bibleberry. Existing data was left untouched.'
  } else if (snapshot.health === 'writeFailed' || snapshot.health === 'storageUnavailable') {
    writeErrorMessage =
      snapshot.health === 'storageUnavailable'
        ? 'Device storage is currently unavailable. Pending Saved Scripture changes are kept in memory for this session.'
        : 'Could not write your latest Saved Scripture change to device storage. Check available storage space and retry.'
  }

  const handleRemoveItem = async (item: SavedScriptureCollectionItem) => {
    await store.dispatch({
      type: 'setScriptureSaved',
      scripture: {
        reference: item.reference,
        translation: item.translation,
      },
      saved: false,
      savedOn: getToday(),
    })
  }

  const handleRetryWrite = async () => {
    if (isRetryingWrite) return
    setIsRetryingWrite(true)
    try {
      await store.flushPending()
    } finally {
      setIsRetryingWrite(false)
    }
  }

  return (
    <SavedScriptureCollectionView
      items={items}
      status={status}
      statusMessage={statusMessage}
      writeErrorMessage={writeErrorMessage}
      isRetryingWrite={isRetryingWrite}
      onRetryWrite={() => {
        void handleRetryWrite()
      }}
      onRemoveItem={handleRemoveItem}
      onExit={onExit}
      exitLabel={exitLabel}
      headingText={headingText}
    />
  )
}
