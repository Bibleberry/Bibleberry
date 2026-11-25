import type { CmsScripture } from '../cms/sanity/types.ts'
import { validateEarnedCardSnapshot } from './awards.ts'
import {
  createSavedScriptureKey,
  normalizeSavedScriptureInput,
  parseCanonicalMonthlyAwardId,
  parseCardDocumentId,
  parseLocalCalendarDate,
  parseMonthlyAwardIdParts,
  parseStoredChallengeId,
} from './identity.ts'
import type {
  CanonicalAwardId,
  CanonicalChallengeId,
  ChallengeIdentityNamespace,
  ChallengeParticipationView,
  ChallengeResumeRecord,
  CompletedChallengeRecord,
  EarnedAwardRecord,
  LastOpenedChallengePointer,
  LocalCalendarDate,
  ParticipationCommand,
  ReaderParticipationData,
  SavedChallengeRecord,
  SavedScriptureRecord,
} from './types.ts'

/**
 * Pure, deterministic state transitions and selectors for reader participation (Track A, A3).
 *
 * Every reducer preserves structural & referential identity (`prev === next`) on no-op commands
 * so React 19 `useSyncExternalStore` snapshots remain `Object.is`-stable without spurious writes.
 */

const EMPTY_DATA: ReaderParticipationData = Object.freeze({
  completedChallenges: Object.freeze({}),
  inProgressChallenges: Object.freeze({}),
  savedChallenges: Object.freeze({}),
  savedScriptures: Object.freeze([]),
  lastOpenedChallenge: null,
  earnedAwards: Object.freeze({}),
})

export function emptyReaderParticipationData(): ReaderParticipationData {
  return EMPTY_DATA
}

export function distinctCompletedChallengeCount(data: ReaderParticipationData): number {
  return Object.keys(data.completedChallenges).length
}

export function selectNewDiscoveryAwardIds(data: ReaderParticipationData): readonly CanonicalAwardId[] {
  const acknowledged = new Set(data.notebookAcknowledgedAwardIds)
  return Object.values(data.earnedAwards)
    .map(award => award.awardId)
    .filter(awardId => !acknowledged.has(awardId))
}

function earlierDate(left: LocalCalendarDate, right: LocalCalendarDate): LocalCalendarDate {
  return left <= right ? left : right
}

function resolveAliasTarget(
  id: CanonicalChallengeId,
  aliases: Readonly<Record<string, CanonicalChallengeId>>,
  allowedNamespace: ChallengeIdentityNamespace,
): CanonicalChallengeId {
  let current: CanonicalChallengeId = id
  const visited = new Set<string>([current])

  while (Object.hasOwn(aliases, current)) {
    const candidate = parseStoredChallengeId(aliases[current], allowedNamespace)
    if (!candidate || visited.has(candidate)) break
    visited.add(candidate)
    current = candidate
  }

  return current
}

/**
 * Reconciles explicit, editorially declared Challenge supersession aliases (`oldId -> newId`)
 * without losing accomplishments or inflating `distinctCompletedChallengeCount`.
 *
 * If both an older Challenge ID and its replacement were completed prior to alias declaration,
 * they collapse into a single completion record under the replacement ID preserving the earliest
 * `completedOn` date.
 */
export function reconcileChallengeAliases(
  data: ReaderParticipationData,
  aliases: Readonly<Record<string, CanonicalChallengeId>>,
  allowedNamespace: ChallengeIdentityNamespace = 'cms',
): ReaderParticipationData {
  const aliasKeys = Object.keys(aliases)
  if (aliasKeys.length === 0) return data

  let changed = false

  // 1. Completed Challenges (monotonic; collapse collisions to earliest completedOn)
  const nextCompleted: Record<string, CompletedChallengeRecord> = {}
  for (const [rawKey, record] of Object.entries(data.completedChallenges)) {
    const sourceId = parseStoredChallengeId(rawKey, allowedNamespace)
    if (!sourceId) continue
    const targetId = resolveAliasTarget(sourceId, aliases, allowedNamespace)
    if (targetId !== sourceId) changed = true

    const existing = nextCompleted[targetId]
    if (!existing) {
      nextCompleted[targetId] = record
    } else {
      changed = true
      const mergedDate = earlierDate(existing.completedOn, record.completedOn)
      nextCompleted[targetId] = mergedDate === existing.completedOn
        ? existing
        : Object.freeze({ completedOn: mergedDate })
    }
  }

  // 2. Saved Challenges (collapse collisions to earliest savedOn)
  const nextSaved: Record<string, SavedChallengeRecord> = {}
  for (const [rawKey, record] of Object.entries(data.savedChallenges)) {
    const sourceId = parseStoredChallengeId(rawKey, allowedNamespace)
    if (!sourceId) continue
    const targetId = resolveAliasTarget(sourceId, aliases, allowedNamespace)
    if (targetId !== sourceId) changed = true

    const existing = nextSaved[targetId]
    if (!existing) {
      nextSaved[targetId] = record
    } else {
      changed = true
      const mergedDate = earlierDate(existing.savedOn, record.savedOn)
      nextSaved[targetId] = mergedDate === existing.savedOn
        ? existing
        : Object.freeze({ savedOn: mergedDate })
    }
  }

  // 3. In-Progress Challenges (omit any target that is already completed)
  const nextInProgress: Record<string, ChallengeResumeRecord> = {}
  for (const [rawKey, record] of Object.entries(data.inProgressChallenges)) {
    const sourceId = parseStoredChallengeId(rawKey, allowedNamespace)
    if (!sourceId) continue
    const targetId = resolveAliasTarget(sourceId, aliases, allowedNamespace)
    if (targetId !== sourceId) changed = true

    if (Object.hasOwn(nextCompleted, targetId)) {
      changed = true
      continue
    }

    const existing = nextInProgress[targetId]
    if (!existing) {
      nextInProgress[targetId] = record
    } else {
      changed = true
      // Prefer replacement document's own screen key when dates tie or replacement is newer;
      // keep migrated record only if strictly newer and target wasn't already recorded directly.
      const isDirectTarget = sourceId === targetId
      if (isDirectTarget && record.updatedOn >= existing.updatedOn) {
        nextInProgress[targetId] = record
      } else if (!isDirectTarget && record.updatedOn > existing.updatedOn) {
        nextInProgress[targetId] = record
      }
    }
  }

  // 4. Last-Opened Pointer
  let nextLastOpened: LastOpenedChallengePointer | null = data.lastOpenedChallenge
  if (nextLastOpened) {
    const targetId = resolveAliasTarget(nextLastOpened.challengeId, aliases, allowedNamespace)
    if (targetId !== nextLastOpened.challengeId) {
      changed = true
      nextLastOpened = Object.freeze({
        ...nextLastOpened,
        challengeId: targetId,
      })
    }
  }

  // 5. Saved Scripture optional provenance
  let scripturesChanged = false
  const nextScriptures: SavedScriptureRecord[] = data.savedScriptures.map(entry => {
    if (!entry.sourceChallengeId) return entry
    const targetId = resolveAliasTarget(entry.sourceChallengeId, aliases, allowedNamespace)
    if (targetId === entry.sourceChallengeId) return entry
    scripturesChanged = true
    return Object.freeze({
      ...entry,
      sourceChallengeId: targetId,
    })
  })

  if (!changed && !scripturesChanged) return data

  return Object.freeze({
    ...data,
    completedChallenges: changed ? Object.freeze(nextCompleted) : data.completedChallenges,
    inProgressChallenges: changed ? Object.freeze(nextInProgress) : data.inProgressChallenges,
    savedChallenges: changed ? Object.freeze(nextSaved) : data.savedChallenges,
    savedScriptures: scripturesChanged ? Object.freeze(nextScriptures) : data.savedScriptures,
    lastOpenedChallenge: nextLastOpened,
  })
}

export function reduceParticipationCommand(
  data: ReaderParticipationData,
  command: ParticipationCommand,
  allowedNamespace: ChallengeIdentityNamespace = 'cms',
): ReaderParticipationData {
  switch (command.type) {
    case 'recordChallengeOpened': {
      const challengeId = parseStoredChallengeId(command.challengeId, allowedNamespace)
      const openedOn = parseLocalCalendarDate(command.openedOn)
      if (!challengeId || !openedOn) return data

      const current = data.lastOpenedChallenge
      if (
        current
        && current.challengeId === challengeId
        && current.openedOn === openedOn
        && current.resumeDismissedOn === undefined
      ) {
        return data
      }

      return Object.freeze({
        ...data,
        lastOpenedChallenge: Object.freeze({ challengeId, openedOn }),
      })
    }

    case 'dismissResumePrompt': {
      const dismissedOn = parseLocalCalendarDate(command.dismissedOn)
      const current = data.lastOpenedChallenge
      if (!dismissedOn || !current || current.resumeDismissedOn === dismissedOn) return data

      return Object.freeze({
        ...data,
        lastOpenedChallenge: Object.freeze({
          ...current,
          resumeDismissedOn: dismissedOn,
        }),
      })
    }

    case 'saveChallengeProgress': {
      const challengeId = parseStoredChallengeId(command.challengeId, allowedNamespace)
      const updatedOn = parseLocalCalendarDate(command.updatedOn)
      if (!challengeId || !updatedOn) return data

      // Completed Challenges stay out of durable inProgressChallenges so rereading never traps
      // the reader on the final screen or blurs "in progress" vs "completed".
      if (Object.hasOwn(data.completedChallenges, challengeId)) {
        return data
      }

      const normalizedScreenId = typeof command.screenId === 'string' && command.screenId.trim().length > 0
        ? command.screenId.trim()
        : undefined

      const existing = data.inProgressChallenges[challengeId]
      // Derive order during command replay against the durable base, independent of device time.
      const interruptionOrder = command.trackInterruption && normalizedScreenId
        ? Object.values(data.inProgressChallenges).reduce(
            (latest, record) => Math.max(latest, record.interruptionOrder ?? 0), 0,
          ) + 1
        : existing?.interruptionOrder
      if (
        existing
        && existing.screenId === normalizedScreenId
        && existing.updatedOn === updatedOn
        && existing.interruptionOrder === interruptionOrder
      ) {
        return data
      }

      const nextRecord: ChallengeResumeRecord = Object.freeze({
        ...(normalizedScreenId !== undefined ? { screenId: normalizedScreenId } : {}),
        updatedOn,
        ...(interruptionOrder !== undefined ? { interruptionOrder } : {}),
      })

      return Object.freeze({
        ...data,
        inProgressChallenges: Object.freeze({
          ...data.inProgressChallenges,
          [challengeId]: nextRecord,
        }),
      })
    }

    case 'setChallengeSaved': {
      const challengeId = parseStoredChallengeId(command.challengeId, allowedNamespace)
      const savedOn = parseLocalCalendarDate(command.savedOn)
      if (!challengeId || !savedOn) return data

      const currentlySaved = Object.hasOwn(data.savedChallenges, challengeId)
      if (command.saved === currentlySaved) return data

      if (command.saved) {
        return Object.freeze({
          ...data,
          savedChallenges: Object.freeze({
            ...data.savedChallenges,
            [challengeId]: Object.freeze({ savedOn }),
          }),
        })
      }

      const nextSaved: Record<string, SavedChallengeRecord> = {}
      for (const [key, value] of Object.entries(data.savedChallenges)) {
        if (key !== challengeId) nextSaved[key] = value
      }

      return Object.freeze({
        ...data,
        savedChallenges: Object.freeze(nextSaved),
      })
    }

    case 'setScriptureSaved': {
      const savedOn = parseLocalCalendarDate(command.savedOn)
      if (!savedOn) return data

      const normalized = normalizeSavedScriptureInput(command.scripture, allowedNamespace)
      if (!normalized) return data

      const existingIndex = data.savedScriptures.findIndex(entry => entry.key === normalized.key)
      if (command.saved && existingIndex >= 0) return data
      if (!command.saved && existingIndex < 0) return data

      if (command.saved) {
        const record: SavedScriptureRecord = Object.freeze({
          key: normalized.key,
          reference: normalized.reference,
          translation: normalized.translation,
          savedOn,
          ...(normalized.sourceChallengeId ? { sourceChallengeId: normalized.sourceChallengeId } : {}),
        })
        return Object.freeze({
          ...data,
          savedScriptures: Object.freeze([...data.savedScriptures, record]),
        })
      }

      return Object.freeze({
        ...data,
        savedScriptures: Object.freeze(data.savedScriptures.filter(entry => entry.key !== normalized.key)),
      })
    }

    case 'completeChallenge': {
      const challengeId = parseStoredChallengeId(command.challengeId, allowedNamespace)
      const completedOn = parseLocalCalendarDate(command.completedOn)
      if (!challengeId || !completedOn) return data

      const alreadyCompleted = Object.hasOwn(data.completedChallenges, challengeId)
      const hasInProgress = Object.hasOwn(data.inProgressChallenges, challengeId)

      // Repeat completion never alters original `completedOn` or inflates distinct count.
      if (alreadyCompleted && !hasInProgress) {
        return data
      }

      const nextCompleted = alreadyCompleted
        ? data.completedChallenges
        : Object.freeze({
            ...data.completedChallenges,
            [challengeId]: Object.freeze({ completedOn }),
          })

      let nextInProgress = data.inProgressChallenges
      if (hasInProgress) {
        const copy: Record<string, ChallengeResumeRecord> = {}
        for (const [key, value] of Object.entries(data.inProgressChallenges)) {
          if (key !== challengeId) copy[key] = value
        }
        nextInProgress = Object.freeze(copy)
      }

      return Object.freeze({
        ...data,
        completedChallenges: nextCompleted,
        inProgressChallenges: nextInProgress,
      })
    }

    case 'reconcileChallengeAliases':
      return reconcileChallengeAliases(data, command.aliases, allowedNamespace)

    case 'recordEarnedAwards': {
      if (!Array.isArray(command.awards) || command.awards.length === 0) {
        return data
      }

      let changed = false
      const nextAwards: Record<string, EarnedAwardRecord> = { ...data.earnedAwards }

      for (const input of command.awards) {
        if (!input || typeof input !== 'object') continue

        const parsedId = parseMonthlyAwardIdParts(input.awardId)
        if (!parsedId || input.discoveryId !== parsedId.discoveryId) continue

        const earnedOn = parseLocalCalendarDate(input.earnedOn)
        if (!earnedOn) continue

        const validatedCard =
          input.earnedCard !== undefined
            ? validateEarnedCardSnapshot(input.earnedCard, parsedId.publicationYearMonth)
            : null
        const validatedCardDocId =
          validatedCard?.cardDocumentId
          ?? parseCardDocumentId(input.cardDocumentId)
          ?? undefined

        const existing = Object.hasOwn(nextAwards, parsedId.awardId)
          ? nextAwards[parsedId.awardId]
          : undefined

        if (!existing) {
          nextAwards[parsedId.awardId] = Object.freeze({
            awardId: parsedId.awardId,
            kind: parsedId.kind,
            publicationYearMonth: parsedId.publicationYearMonth,
            discoveryId: parsedId.discoveryId,
            earnedOn,
            hubAnnouncementAcked: false,
            cardViewed: false,
            ...(validatedCardDocId ? { cardDocumentId: validatedCardDocId } : {}),
            ...(validatedCard ? { earnedCard: validatedCard } : {}),
          })
          changed = true
          continue
        }

        // Monotonic preservation:
        // - Keep original `earnedOn`, `hubAnnouncementAcked`, and `cardViewed`.
        // - Never drop an already-captured valid `earnedCard` or `cardDocumentId`.
        // - Backfill `earnedCard` / `cardDocumentId` only when previously absent.
        // - Live replacement of an already-captured valid snapshot on editorial revision
        //   is deferred pending owner policy approval.
        const shouldBackfillCard = !existing.earnedCard && validatedCard !== null
        const shouldBackfillDocId =
          !shouldBackfillCard && !existing.cardDocumentId && validatedCardDocId !== undefined

        if (shouldBackfillCard) {
          nextAwards[parsedId.awardId] = Object.freeze({
            ...existing,
            cardDocumentId: validatedCard.cardDocumentId,
            earnedCard: validatedCard,
          })
          changed = true
        } else if (shouldBackfillDocId) {
          nextAwards[parsedId.awardId] = Object.freeze({
            ...existing,
            cardDocumentId: validatedCardDocId,
          })
          changed = true
        }
      }

      if (!changed) return data

      return Object.freeze({
        ...data,
        earnedAwards: Object.freeze(nextAwards),
      })
    }

    case 'markEarnedCardViewed': {
      const awardId = parseCanonicalMonthlyAwardId(command.awardId)
      if (!awardId || !Object.hasOwn(data.earnedAwards, awardId)) return data

      const existing = data.earnedAwards[awardId]
      if (existing.cardViewed) return data

      return Object.freeze({
        ...data,
        earnedAwards: Object.freeze({
          ...data.earnedAwards,
          [awardId]: Object.freeze({
            ...existing,
            cardViewed: true,
          }),
        }),
      })
    }

    case 'acknowledgeAwardAnnouncements': {
      if (!Array.isArray(command.awardIds) || command.awardIds.length === 0) {
        return data
      }

      let changed = false
      const nextAwards: Record<string, EarnedAwardRecord> = { ...data.earnedAwards }

      for (const rawId of command.awardIds) {
        const awardId = parseCanonicalMonthlyAwardId(rawId)
        if (!awardId || !Object.hasOwn(nextAwards, awardId)) continue

        const existing = nextAwards[awardId]
        if (existing.hubAnnouncementAcked) continue

        nextAwards[awardId] = Object.freeze({
          ...existing,
          hubAnnouncementAcked: true,
        })
        changed = true
      }

      if (!changed) return data

      return Object.freeze({
        ...data,
        earnedAwards: Object.freeze(nextAwards),
      })
    }

    case 'acknowledgeNotebookEntry': {
      if (!Array.isArray(command.awardIds) || command.awardIds.length === 0) return data

      const acknowledged = new Set(data.notebookAcknowledgedAwardIds)
      const previousSize = acknowledged.size
      for (const rawId of command.awardIds) {
        const awardId = parseCanonicalMonthlyAwardId(rawId)
        if (awardId && Object.hasOwn(data.earnedAwards, awardId)) {
          acknowledged.add(awardId)
        }
      }
      if (acknowledged.size === previousSize) return data

      return Object.freeze({
        ...data,
        notebookAcknowledgedAwardIds: Object.freeze([...acknowledged].sort()),
      })
    }
  }
}

export function replayParticipationCommands(
  base: ReaderParticipationData,
  commands: readonly ParticipationCommand[],
  allowedNamespace: ChallengeIdentityNamespace = 'cms',
): ReaderParticipationData {
  let current = base
  for (const command of commands) {
    current = reduceParticipationCommand(current, command, allowedNamespace)
  }
  return current
}

export function selectChallengeParticipationView(
  data: ReaderParticipationData,
  challengeId: CanonicalChallengeId,
): ChallengeParticipationView {
  const completedRecord = data.completedChallenges[challengeId]
  const resumeRecord = completedRecord ? undefined : data.inProgressChallenges[challengeId]
  const savedRecord = data.savedChallenges[challengeId]
  const isCompleted = Boolean(completedRecord)
  const isInProgress = !isCompleted && Boolean(resumeRecord)

  return {
    challengeId,
    status: isCompleted ? 'completed' : isInProgress ? 'inProgress' : 'notStarted',
    isCompleted,
    ...(completedRecord ? { completedOn: completedRecord.completedOn } : {}),
    isInProgress,
    ...(resumeRecord?.screenId ? { resumeScreenId: resumeRecord.screenId } : {}),
    isSaved: Boolean(savedRecord),
    ...(savedRecord ? { savedOn: savedRecord.savedOn } : {}),
    isLastOpened: data.lastOpenedChallenge?.challengeId === challengeId,
  }
}

export function isParticipationScriptureSaved(
  data: ReaderParticipationData,
  scripture: Pick<CmsScripture, 'reference' | 'translation'>,
): boolean {
  const key = createSavedScriptureKey(scripture)
  if (!key) return false
  return data.savedScriptures.some(entry => entry.key === key)
}
