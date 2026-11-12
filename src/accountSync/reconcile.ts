import { validateEarnedCardSnapshot } from '../participation/awards.ts'
import {
  normalizeSavedScriptureInput,
  parseCardDocumentId,
  parseLocalCalendarDate,
  parseMonthlyAwardIdParts,
  parsePublicationYearMonth,
  parseStoredChallengeId,
} from '../participation/identity.ts'
import type {
  CanonicalAwardId,
  CanonicalChallengeId,
  ChallengeIdentityNamespace,
  ChallengeResumeRecord,
  DateProvenance,
  EarnedScriptureCardSnapshot,
  GuestClearanceDecision,
  GuestReconciliationInput,
  LastOpenedChallengePointer,
  LocalCalendarDate,
  ProposedAccountCompletedChallengeRecord,
  ProposedAccountEarnedAwardRecord,
  ProposedAccountParticipationData,
  ProposedAccountParticipationEnvelope,
  ProposedAccountShelfEntry,
  ProposedAccountShelfState,
  ReconcileGuestIntoAccountInput,
  ReconciliationResult,
  RejectedRecordDiagnostic,
  SavedChallengeRecord,
  SavedScriptureRecord,
  ShelfConflictResolutionNotice,
  SUPPORTED_ACCOUNT_SCHEMA_VERSION as _SUPPORTED_ACCOUNT_VERSION_TYPE,
  UnresolvedReconciliationItem,
  AccountId,
  CommitAckReceipt,
} from './types.ts'
import { SUPPORTED_ACCOUNT_SCHEMA_VERSION } from './types.ts'

/**
 * Pure, deterministic, platform-neutral guest-to-account reconciliation engine (R13-0).
 *
 * Invariants:
 * - Zero React, DOM, `window`, `localStorage`, Capacitor, network, or Supabase dependencies.
 * - Zero mutation of supplied arguments; all returned records and arrays are deeply frozen.
 * - Never compares opaque `screenId` strings lexicographically or trusts unverified client clocks
 *   over server-verified provenance; surfaces explicit typed unresolved items instead.
 */

const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/
const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const MAX_SHELF_MONTHS = 3

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const

const SHA256_INIT = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const

function encodeUtf8Bytes(input: string): number[] {
  const bytes: number[] = []
  for (let i = 0; i < input.length; i += 1) {
    let code = input.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000
        i += 1
      }
    }
    if (code <= 0x7f) {
      bytes.push(code)
    } else if (code <= 0x7ff) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code <= 0xffff) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      )
    }
  }
  return bytes
}

function rotr32(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits))
}

function sha256Hex(input: string): string {
  const bytes = encodeUtf8Bytes(input)
  const bitLen = bytes.length * 8
  bytes.push(0x80)
  while ((bytes.length % 64) !== 56) {
    bytes.push(0)
  }
  const hiBits = Math.floor(bitLen / 0x100000000)
  const loBits = bitLen >>> 0
  bytes.push(
    (hiBits >>> 24) & 0xff, (hiBits >>> 16) & 0xff, (hiBits >>> 8) & 0xff, hiBits & 0xff,
    (loBits >>> 24) & 0xff, (loBits >>> 16) & 0xff, (loBits >>> 8) & 0xff, loBits & 0xff,
  )

  const hash: number[] = [...SHA256_INIT]
  const w = new Array<number>(64).fill(0)

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const idx = offset + i * 4
      w[i] = (
        (bytes[idx] << 24)
        | (bytes[idx + 1] << 16)
        | (bytes[idx + 2] << 8)
        | bytes[idx + 3]
      ) >>> 0
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }

    let [a, b, c, d, e, f, g, h] = hash
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0

      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    hash[0] = (hash[0] + a) >>> 0
    hash[1] = (hash[1] + b) >>> 0
    hash[2] = (hash[2] + c) >>> 0
    hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0
    hash[5] = (hash[5] + f) >>> 0
    hash[6] = (hash[6] + g) >>> 0
    hash[7] = (hash[7] + h) >>> 0
  }

  return hash.map(word => word.toString(16).padStart(8, '0')).join('')
}

function canonicalizeJsonValue(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => (item === undefined ? 'null' : canonicalizeJsonValue(item))).join(',')}]`
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    const parts: string[] = []
    for (const key of keys) {
      const prop = obj[key]
      if (prop === undefined) continue
      parts.push(`${JSON.stringify(key)}:${canonicalizeJsonValue(prop)}`)
    }
    return `{${parts.join(',')}}`
  }
  return 'null'
}

/**
 * Computes a deterministic SHA-256 fingerprint of a guest reconciliation payload,
 * independent of JS object property insertion order.
 */
export function computeGuestPayloadFingerprint(guest: GuestReconciliationInput): string {
  return sha256Hex(canonicalizeJsonValue(guest))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafeKey(key: string): boolean {
  return !FORBIDDEN_OBJECT_KEYS.has(key)
}

function earlierDate(left: LocalCalendarDate, right: LocalCalendarDate): LocalCalendarDate {
  return left <= right ? left : right
}

function laterDate(left: LocalCalendarDate, right: LocalCalendarDate): LocalCalendarDate {
  return left >= right ? left : right
}

function compareStringsDeterministic(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function parseAccountId(raw: unknown): AccountId | null {
  if (typeof raw !== 'string' || raw !== raw.trim()) return null
  if (FORBIDDEN_OBJECT_KEYS.has(raw)) return null
  if (!ACCOUNT_ID_PATTERN.test(raw)) return null
  return raw as AccountId
}

export function emptyProposedAccountData(
  shelf?: ProposedAccountShelfState,
): ProposedAccountParticipationData {
  return Object.freeze({
    completedChallenges: Object.freeze({}),
    inProgressChallenges: Object.freeze({}),
    savedChallenges: Object.freeze({}),
    savedScriptures: Object.freeze([]),
    lastOpenedChallenge: null,
    earnedAwards: Object.freeze({}),
    ...(shelf ? { shelf } : {}),
  })
}

export function createEmptyAccountEnvelope(input: {
  readonly accountId: string
  readonly namespace?: ChallengeIdentityNamespace
  readonly revision?: number
}): ProposedAccountParticipationEnvelope {
  const version: typeof _SUPPORTED_ACCOUNT_VERSION_TYPE = SUPPORTED_ACCOUNT_SCHEMA_VERSION
  return Object.freeze({
    schemaVersion: version,
    accountId: input.accountId,
    namespace: input.namespace ?? 'cms',
    revision: input.revision ?? 0,
    data: emptyProposedAccountData(),
  })
}

function classifyChallengeIdFailure(
  rawId: string,
  allowedNamespace: ChallengeIdentityNamespace,
): 'crossNamespaceOrForbiddenId' | 'invalidChallengeId' {
  const lower = rawId.toLowerCase()
  const otherNamespace = allowedNamespace === 'cms' ? 'pilot:' : 'cms:'
  if (
    lower.startsWith(otherNamespace)
    || lower.startsWith('drafts.')
    || lower.includes(':drafts.')
    || lower.includes(':fixture-')
    || lower.includes(':pilot-')
    || lower.includes(':weekly-pilot-')
    || lower.includes(':sanity-live')
    || lower.includes(':sanity-fixture')
  ) {
    return 'crossNamespaceOrForbiddenId'
  }
  return 'invalidChallengeId'
}

function buildValidatedAliasMap(
  rawAliases: Readonly<Record<string, string>> | undefined,
  allowedNamespace: ChallengeIdentityNamespace,
): Readonly<Record<string, CanonicalChallengeId>> {
  if (!rawAliases || !isPlainObject(rawAliases)) {
    return Object.freeze({})
  }
  const clean: Record<string, CanonicalChallengeId> = {}
  for (const [rawFrom, rawTo] of Object.entries(rawAliases)) {
    if (!isSafeKey(rawFrom)) continue
    const fromId = parseStoredChallengeId(rawFrom, allowedNamespace)
    const toId = parseStoredChallengeId(rawTo, allowedNamespace)
    if (!fromId || !toId || fromId === toId) continue
    clean[fromId] = toId
  }

  // Resolve transitive chains safely; drop any chain that enters a cycle so identities never swap or diverge
  const resolved: Record<string, CanonicalChallengeId> = {}
  for (const fromId of Object.keys(clean)) {
    let current: CanonicalChallengeId = fromId as CanonicalChallengeId
    const visited = new Set<string>([current])
    let hitCycle = false
    while (Object.hasOwn(clean, current)) {
      const next = clean[current]
      if (visited.has(next)) {
        hitCycle = true
        break
      }
      visited.add(next)
      current = next
    }
    if (!hitCycle && current !== fromId) {
      resolved[fromId] = current
    }
  }
  return Object.freeze(resolved)
}

function resolveAlias(
  id: CanonicalChallengeId,
  aliases: Readonly<Record<string, CanonicalChallengeId>>,
  appliedAliases: Record<string, CanonicalChallengeId>,
): CanonicalChallengeId {
  if (!Object.hasOwn(aliases, id)) return id
  const target = aliases[id]
  if (target && target !== id) {
    appliedAliases[id] = target
    return target
  }
  return id
}

interface NormalizedSourceState {
  readonly completedChallenges: Record<string, ProposedAccountCompletedChallengeRecord>
  readonly inProgressChallenges: Record<string, ChallengeResumeRecord>
  readonly savedChallenges: Record<string, SavedChallengeRecord>
  readonly savedScriptures: Map<string, SavedScriptureRecord>
  readonly lastOpenedChallenge: LastOpenedChallengePointer | null
  readonly earnedAwards: Record<string, ProposedAccountEarnedAwardRecord>
  readonly shelf?: ProposedAccountShelfState
}

function hasAnyParticipationData(rawData: Record<string, unknown>): boolean {
  if (isPlainObject(rawData.completedChallenges) && Object.keys(rawData.completedChallenges).length > 0) {
    return true
  }
  if (isPlainObject(rawData.inProgressChallenges) && Object.keys(rawData.inProgressChallenges).length > 0) {
    return true
  }
  if (isPlainObject(rawData.savedChallenges) && Object.keys(rawData.savedChallenges).length > 0) {
    return true
  }
  if (Array.isArray(rawData.savedScriptures) && rawData.savedScriptures.length > 0) {
    return true
  }
  if (rawData.lastOpenedChallenge !== null && rawData.lastOpenedChallenge !== undefined) {
    return true
  }
  if (isPlainObject(rawData.earnedAwards) && Object.keys(rawData.earnedAwards).length > 0) {
    return true
  }
  if (isPlainObject(rawData.shelf) && Array.isArray(rawData.shelf.months) && rawData.shelf.months.length > 0) {
    return true
  }
  return false
}

function isValidParticipationContainerShape(
  rawData: unknown,
  requireEarnedAwardsKeyOptional: boolean,
): rawData is Record<string, unknown> {
  if (!isPlainObject(rawData)) return false
  if (rawData.completedChallenges !== undefined && !isPlainObject(rawData.completedChallenges)) {
    return false
  }
  if (rawData.inProgressChallenges !== undefined && !isPlainObject(rawData.inProgressChallenges)) {
    return false
  }
  if (rawData.savedChallenges !== undefined && !isPlainObject(rawData.savedChallenges)) {
    return false
  }
  if (rawData.savedScriptures !== undefined && !Array.isArray(rawData.savedScriptures)) {
    return false
  }
  if (
    rawData.lastOpenedChallenge !== undefined
    && rawData.lastOpenedChallenge !== null
    && !isPlainObject(rawData.lastOpenedChallenge)
  ) {
    return false
  }
  if (
    !requireEarnedAwardsKeyOptional
    && rawData.earnedAwards !== undefined
    && !isPlainObject(rawData.earnedAwards)
  ) {
    return false
  }
  if (rawData.shelf !== undefined && !isPlainObject(rawData.shelf)) {
    return false
  }
  return true
}

function normalizeShelfState(
  rawShelf: unknown,
  source: 'account' | 'guest',
  rejectedRecords: RejectedRecordDiagnostic[],
): ProposedAccountShelfState | undefined {
  if (rawShelf === undefined) return undefined
  if (!isPlainObject(rawShelf) || !Array.isArray(rawShelf.months)) {
    rejectedRecords.push({
      source,
      section: 'shelf',
      rawKey: 'shelf',
      reason: 'invalidRecordShape',
    })
    return undefined
  }

  const seenMonths = new Set<string>()
  const validMonths: ProposedAccountShelfEntry[] = []

  for (const entry of rawShelf.months) {
    if (!isPlainObject(entry)) {
      rejectedRecords.push({
        source,
        section: 'shelf',
        rawKey: String(entry),
        reason: 'invalidShelfEntry',
      })
      continue
    }
    const yearMonth = parsePublicationYearMonth(entry.yearMonth)
    const kind = entry.admissionKind
    if (!yearMonth || (kind !== 'readerSelected' && kind !== 'autoAdmitted')) {
      rejectedRecords.push({
        source,
        section: 'shelf',
        rawKey: typeof entry.yearMonth === 'string' ? entry.yearMonth : 'unknown',
        reason: 'invalidShelfEntry',
      })
      continue
    }
    if (seenMonths.has(yearMonth)) continue
    if (validMonths.length >= MAX_SHELF_MONTHS) {
      rejectedRecords.push({
        source,
        section: 'shelf',
        rawKey: yearMonth,
        reason: 'shelfCapacityExceeded',
      })
      continue
    }
    seenMonths.add(yearMonth)

    const admittedOn = entry.admittedOn !== undefined
      ? parseLocalCalendarDate(entry.admittedOn) ?? undefined
      : undefined

    validMonths.push(
      Object.freeze({
        yearMonth,
        admissionKind: kind,
        ...(admittedOn ? { admittedOn } : {}),
      }),
    )
  }

  const activeFocusMonth =
    rawShelf.activeFocusMonth === null
      ? null
      : parsePublicationYearMonth(rawShelf.activeFocusMonth) ?? undefined
  const updatedOn = parseLocalCalendarDate(rawShelf.updatedOn) ?? undefined

  return Object.freeze({
    months: Object.freeze(validMonths),
    ...(activeFocusMonth !== undefined ? { activeFocusMonth } : {}),
    ...(updatedOn ? { updatedOn } : {}),
  })
}

function normalizeSourceData(params: {
  readonly source: 'account' | 'guest'
  readonly rawData: Record<string, unknown>
  readonly schemaVersion: number
  readonly rawShelfOverride?: unknown
  readonly allowedNamespace: ChallengeIdentityNamespace
  readonly defaultDateProvenance: DateProvenance
  readonly aliases: Readonly<Record<string, CanonicalChallengeId>>
  readonly appliedAliases: Record<string, CanonicalChallengeId>
  readonly rejectedRecords: RejectedRecordDiagnostic[]
  readonly unresolvedItems: UnresolvedReconciliationItem[]
  readonly challengeMinReleaseDate?: Readonly<Record<string, LocalCalendarDate>>
  readonly maxCredibleDate?: LocalCalendarDate
  readonly serverAuthorizedDate?: LocalCalendarDate
}): NormalizedSourceState {
  const {
    source,
    rawData,
    schemaVersion,
    rawShelfOverride,
    allowedNamespace,
    defaultDateProvenance,
    aliases,
    appliedAliases,
    rejectedRecords,
    unresolvedItems,
    challengeMinReleaseDate,
    maxCredibleDate,
    serverAuthorizedDate,
  } = params

  const completedChallenges: Record<string, ProposedAccountCompletedChallengeRecord> = {}
  if (isPlainObject(rawData.completedChallenges)) {
    const entries = Object.entries(rawData.completedChallenges).sort((a, b) =>
      compareStringsDeterministic(a[0], b[0]),
    )
    for (const [rawId, value] of entries) {
      if (!isSafeKey(rawId)) continue
      const parsedId = parseStoredChallengeId(rawId, allowedNamespace)
      if (!parsedId) {
        rejectedRecords.push({
          source,
          section: 'completedChallenges',
          rawKey: rawId,
          reason: classifyChallengeIdFailure(rawId, allowedNamespace),
        })
        continue
      }
      if (!isPlainObject(value)) {
        rejectedRecords.push({
          source,
          section: 'completedChallenges',
          rawKey: rawId,
          reason: 'invalidRecordShape',
        })
        continue
      }
      const completedOn = parseLocalCalendarDate(value.completedOn)
      if (!completedOn) {
        rejectedRecords.push({
          source,
          section: 'completedChallenges',
          rawKey: rawId,
          reason: 'invalidCalendarDate',
        })
        continue
      }
      const provenance: DateProvenance =
        value.dateProvenance === 'serverVerified' || value.dateProvenance === 'clientReported'
          ? value.dateProvenance
          : defaultDateProvenance
      const clientClaimedOn = parseLocalCalendarDate(value.clientClaimedOn) ?? undefined
      const targetId = resolveAlias(parsedId, aliases, appliedAliases)
      const existing = completedChallenges[targetId]
      if (!existing) {
        completedChallenges[targetId] = Object.freeze({
          completedOn,
          dateProvenance: provenance,
          ...(clientClaimedOn ? { clientClaimedOn } : {}),
        })
      } else {
        const resolution = resolveDatedRecordMerge({
          entityKind: 'challengeCompletion',
          entityId: targetId,
          accountSide: {
            date: existing.completedOn,
            dateProvenance: existing.dateProvenance,
            clientClaimedOn: existing.clientClaimedOn,
          },
          guestSide: {
            date: completedOn,
            dateProvenance: provenance,
            clientClaimedOn,
          },
          accountSourceLabel: source,
          guestSourceLabel: source,
          minDate: challengeMinReleaseDate?.[targetId],
          maxDate: maxCredibleDate,
          serverFallbackDate: serverAuthorizedDate,
          unresolvedItems,
        })
        completedChallenges[targetId] = Object.freeze({
          completedOn: resolution.date,
          dateProvenance: resolution.dateProvenance,
          ...(resolution.clientClaimedOn ? { clientClaimedOn: resolution.clientClaimedOn } : {}),
        })
      }
    }
  }

  const savedChallenges: Record<string, SavedChallengeRecord> = {}
  if (isPlainObject(rawData.savedChallenges)) {
    for (const [rawId, value] of Object.entries(rawData.savedChallenges)) {
      if (!isSafeKey(rawId)) continue
      const parsedId = parseStoredChallengeId(rawId, allowedNamespace)
      if (!parsedId) {
        rejectedRecords.push({
          source,
          section: 'savedChallenges',
          rawKey: rawId,
          reason: classifyChallengeIdFailure(rawId, allowedNamespace),
        })
        continue
      }
      if (!isPlainObject(value)) {
        rejectedRecords.push({
          source,
          section: 'savedChallenges',
          rawKey: rawId,
          reason: 'invalidRecordShape',
        })
        continue
      }
      const savedOn = parseLocalCalendarDate(value.savedOn)
      if (!savedOn) {
        rejectedRecords.push({
          source,
          section: 'savedChallenges',
          rawKey: rawId,
          reason: 'invalidCalendarDate',
        })
        continue
      }
      const targetId = resolveAlias(parsedId, aliases, appliedAliases)
      const existing = savedChallenges[targetId]
      if (!existing || savedOn < existing.savedOn) {
        savedChallenges[targetId] = Object.freeze({ savedOn })
      }
    }
  }

  const inProgressChallenges: Record<string, ChallengeResumeRecord> = {}
  if (isPlainObject(rawData.inProgressChallenges)) {
    for (const [rawId, value] of Object.entries(rawData.inProgressChallenges)) {
      if (!isSafeKey(rawId)) continue
      const parsedId = parseStoredChallengeId(rawId, allowedNamespace)
      if (!parsedId) {
        rejectedRecords.push({
          source,
          section: 'inProgressChallenges',
          rawKey: rawId,
          reason: classifyChallengeIdFailure(rawId, allowedNamespace),
        })
        continue
      }
      if (!isPlainObject(value)) {
        rejectedRecords.push({
          source,
          section: 'inProgressChallenges',
          rawKey: rawId,
          reason: 'invalidRecordShape',
        })
        continue
      }
      const updatedOn = parseLocalCalendarDate(value.updatedOn)
      if (!updatedOn) {
        rejectedRecords.push({
          source,
          section: 'inProgressChallenges',
          rawKey: rawId,
          reason: 'invalidCalendarDate',
        })
        continue
      }
      const targetId = resolveAlias(parsedId, aliases, appliedAliases)
      if (Object.hasOwn(completedChallenges, targetId)) continue
      const screenId =
        typeof value.screenId === 'string' && value.screenId.trim().length > 0
          ? value.screenId.trim()
          : undefined
      const existing = inProgressChallenges[targetId]
      if (!existing || (parsedId === targetId && updatedOn >= existing.updatedOn)) {
        inProgressChallenges[targetId] = Object.freeze({
          ...(screenId !== undefined ? { screenId } : {}),
          updatedOn,
        })
      }
    }
  }

  const savedScriptures = new Map<string, SavedScriptureRecord>()
  if (Array.isArray(rawData.savedScriptures)) {
    for (const item of rawData.savedScriptures) {
      if (!isPlainObject(item) || typeof item.reference !== 'string') {
        rejectedRecords.push({
          source,
          section: 'savedScriptures',
          rawKey: isPlainObject(item) && typeof item.key === 'string' ? item.key : 'unknown',
          reason: 'invalidScriptureInput',
        })
        continue
      }
      const savedOn = parseLocalCalendarDate(item.savedOn)
      if (!savedOn) {
        rejectedRecords.push({
          source,
          section: 'savedScriptures',
          rawKey: item.reference,
          reason: 'invalidCalendarDate',
        })
        continue
      }

      let resolvedSourceChallengeId: CanonicalChallengeId | undefined
      if (item.sourceChallengeId !== undefined) {
        const rawSourceId = typeof item.sourceChallengeId === 'string' ? item.sourceChallengeId : ''
        const parsedSource = parseStoredChallengeId(rawSourceId, allowedNamespace)
        if (!parsedSource) {
          rejectedRecords.push({
            source,
            section: 'savedScriptures',
            rawKey: rawSourceId || item.reference,
            reason: classifyChallengeIdFailure(rawSourceId, allowedNamespace),
          })
          continue
        }
        resolvedSourceChallengeId = resolveAlias(parsedSource, aliases, appliedAliases)
      }

      const normalized = normalizeSavedScriptureInput(
        {
          reference: item.reference,
          translation:
            typeof item.translation === 'string' || item.translation === null
              ? item.translation
              : undefined,
          sourceChallengeId: resolvedSourceChallengeId,
        },
        allowedNamespace,
      )
      if (!normalized) {
        rejectedRecords.push({
          source,
          section: 'savedScriptures',
          rawKey: item.reference,
          reason: 'invalidScriptureInput',
        })
        continue
      }

      const candidateRecord: SavedScriptureRecord = Object.freeze({
        key: normalized.key,
        reference: normalized.reference,
        translation: normalized.translation,
        savedOn,
        ...(resolvedSourceChallengeId ? { sourceChallengeId: resolvedSourceChallengeId } : {}),
      })

      const existing = savedScriptures.get(normalized.key)
      if (!existing) {
        savedScriptures.set(normalized.key, candidateRecord)
      } else {
        savedScriptures.set(normalized.key, mergeSavedScripturePair(existing, candidateRecord))
      }
    }
  }

  let lastOpenedChallenge: LastOpenedChallengePointer | null = null
  if (rawData.lastOpenedChallenge !== null && rawData.lastOpenedChallenge !== undefined) {
    if (!isPlainObject(rawData.lastOpenedChallenge)) {
      rejectedRecords.push({
        source,
        section: 'lastOpenedChallenge',
        rawKey: 'lastOpenedChallenge',
        reason: 'invalidRecordShape',
      })
    } else {
      const rawId = typeof rawData.lastOpenedChallenge.challengeId === 'string'
        ? rawData.lastOpenedChallenge.challengeId
        : ''
      const parsedId = parseStoredChallengeId(rawId, allowedNamespace)
      const openedOn = parseLocalCalendarDate(rawData.lastOpenedChallenge.openedOn)
      if (!parsedId) {
        rejectedRecords.push({
          source,
          section: 'lastOpenedChallenge',
          rawKey: rawId || 'unknown',
          reason: classifyChallengeIdFailure(rawId, allowedNamespace),
        })
      } else if (!openedOn) {
        rejectedRecords.push({
          source,
          section: 'lastOpenedChallenge',
          rawKey: rawId,
          reason: 'invalidCalendarDate',
        })
      } else {
        const targetId = resolveAlias(parsedId, aliases, appliedAliases)
        const resumeDismissedOn = parseLocalCalendarDate(rawData.lastOpenedChallenge.resumeDismissedOn)
        lastOpenedChallenge = Object.freeze({
          challengeId: targetId,
          openedOn,
          ...(resumeDismissedOn ? { resumeDismissedOn } : {}),
        })
      }
    }
  }

  const earnedAwards: Record<string, ProposedAccountEarnedAwardRecord> = {}
  const allowAwards = source === 'account' || schemaVersion === 2
  if (allowAwards && isPlainObject(rawData.earnedAwards)) {
    for (const [rawId, value] of Object.entries(rawData.earnedAwards)) {
      if (!isSafeKey(rawId)) continue
      const parsedId = parseMonthlyAwardIdParts(rawId)
      if (!parsedId || !isPlainObject(value)) {
        rejectedRecords.push({
          source,
          section: 'earnedAwards',
          rawKey: rawId,
          reason: !parsedId ? 'invalidAwardIdOrMismatchedParts' : 'invalidRecordShape',
        })
        continue
      }
      if (
        (value.awardId !== undefined && value.awardId !== parsedId.awardId)
        || (value.kind !== undefined && value.kind !== parsedId.kind)
        || (value.publicationYearMonth !== undefined && value.publicationYearMonth !== parsedId.publicationYearMonth)
        || (value.discoveryId !== undefined && value.discoveryId !== parsedId.discoveryId)
      ) {
        rejectedRecords.push({
          source,
          section: 'earnedAwards',
          rawKey: rawId,
          reason: 'invalidAwardIdOrMismatchedParts',
        })
        continue
      }

      const earnedOn = parseLocalCalendarDate(value.earnedOn)
      if (!earnedOn) {
        rejectedRecords.push({
          source,
          section: 'earnedAwards',
          rawKey: rawId,
          reason: 'invalidCalendarDate',
        })
        continue
      }

      const rawCardDocId = parseCardDocumentId(value.cardDocumentId) ?? undefined
      let earnedCard: EarnedScriptureCardSnapshot | null =
        value.earnedCard !== undefined && value.earnedCard !== null
          ? validateEarnedCardSnapshot(value.earnedCard, parsedId.publicationYearMonth)
          : null

      if (earnedCard && rawCardDocId && rawCardDocId !== earnedCard.cardDocumentId) {
        earnedCard = null
      }

      const cardDocumentId = earnedCard?.cardDocumentId ?? rawCardDocId
      const provenance: DateProvenance =
        value.dateProvenance === 'serverVerified' || value.dateProvenance === 'clientReported'
          ? value.dateProvenance
          : defaultDateProvenance
      const clientClaimedOn = parseLocalCalendarDate(value.clientClaimedOn) ?? undefined

      earnedAwards[parsedId.awardId] = Object.freeze({
        awardId: parsedId.awardId,
        kind: parsedId.kind,
        publicationYearMonth: parsedId.publicationYearMonth,
        discoveryId: parsedId.discoveryId,
        earnedOn,
        dateProvenance: provenance,
        ...(clientClaimedOn ? { clientClaimedOn } : {}),
        hubAnnouncementAcked: value.hubAnnouncementAcked === true,
        cardViewed: value.cardViewed === true,
        ...(cardDocumentId ? { cardDocumentId } : {}),
        ...(earnedCard ? { earnedCard } : {}),
      })
    }
  }

  const shelf = normalizeShelfState(
    rawShelfOverride !== undefined ? rawShelfOverride : rawData.shelf,
    source,
    rejectedRecords,
  )

  return {
    completedChallenges,
    inProgressChallenges,
    savedChallenges,
    savedScriptures,
    lastOpenedChallenge,
    earnedAwards,
    ...(shelf !== undefined ? { shelf } : {}),
  }
}

function mergeSavedScripturePair(
  left: SavedScriptureRecord,
  right: SavedScriptureRecord,
): SavedScriptureRecord {
  const minSavedOn = earlierDate(left.savedOn, right.savedOn)
  const primary =
    left.savedOn < right.savedOn
      ? left
      : right.savedOn < left.savedOn
        ? right
        : compareStringsDeterministic(left.reference, right.reference) <= 0
          ? left
          : right

  let sourceChallengeId: CanonicalChallengeId | undefined
  if (left.sourceChallengeId && !right.sourceChallengeId) {
    sourceChallengeId = left.sourceChallengeId
  } else if (!left.sourceChallengeId && right.sourceChallengeId) {
    sourceChallengeId = right.sourceChallengeId
  } else if (left.sourceChallengeId && right.sourceChallengeId) {
    if (left.sourceChallengeId === right.sourceChallengeId) {
      sourceChallengeId = left.sourceChallengeId
    } else if (left.savedOn !== right.savedOn) {
      sourceChallengeId = left.savedOn < right.savedOn ? left.sourceChallengeId : right.sourceChallengeId
    } else {
      sourceChallengeId =
        compareStringsDeterministic(left.sourceChallengeId, right.sourceChallengeId) <= 0
          ? left.sourceChallengeId
          : right.sourceChallengeId
    }
  }

  return Object.freeze({
    key: left.key,
    reference: primary.reference,
    translation: primary.translation,
    savedOn: minSavedOn,
    ...(sourceChallengeId ? { sourceChallengeId } : {}),
  })
}

function checkDateAdmissibility(params: {
  readonly date: LocalCalendarDate
  readonly minDate?: LocalCalendarDate
  readonly maxDate?: LocalCalendarDate
}): { readonly ok: true } | { readonly ok: false; readonly reason: 'beforeAvailabilityFloor' | 'afterServerUtcPlus14Ceiling' } {
  const { date, minDate, maxDate } = params
  if (minDate && date < minDate) {
    return { ok: false, reason: 'beforeAvailabilityFloor' }
  }
  if (maxDate && date > maxDate) {
    return { ok: false, reason: 'afterServerUtcPlus14Ceiling' }
  }
  return { ok: true }
}

interface CredibleDateResolution {
  readonly date: LocalCalendarDate
  readonly dateProvenance: DateProvenance
  readonly clientClaimedOn?: LocalCalendarDate
}

function resolveDatedRecordMerge(params: {
  readonly entityKind: 'challengeCompletion' | 'earnedAward'
  readonly entityId: string
  readonly accountSide?: { readonly date: LocalCalendarDate; readonly dateProvenance: DateProvenance; readonly clientClaimedOn?: LocalCalendarDate }
  readonly guestSide?: { readonly date: LocalCalendarDate; readonly dateProvenance: DateProvenance; readonly clientClaimedOn?: LocalCalendarDate }
  readonly accountSourceLabel?: 'account' | 'guest'
  readonly guestSourceLabel?: 'account' | 'guest'
  readonly minDate?: LocalCalendarDate
  readonly maxDate?: LocalCalendarDate
  readonly serverFallbackDate?: LocalCalendarDate
  readonly unresolvedItems: UnresolvedReconciliationItem[]
}): CredibleDateResolution {
  const {
    entityKind,
    entityId,
    accountSide,
    guestSide,
    accountSourceLabel = 'account',
    guestSourceLabel = 'guest',
    minDate,
    maxDate,
    serverFallbackDate,
    unresolvedItems,
  } = params

  const accCheck = accountSide
    ? checkDateAdmissibility({ date: accountSide.date, minDate, maxDate })
    : null
  const gstCheck = guestSide
    ? checkDateAdmissibility({ date: guestSide.date, minDate, maxDate })
    : null

  if (accountSide && accCheck && !accCheck.ok) {
    unresolvedItems.push({
      kind: 'inadmissibleDateClaim',
      entityKind,
      entityId,
      source: accountSourceLabel,
      claimedDate: accountSide.date,
      ...(minDate ? { minAllowedDate: minDate } : {}),
      ...(maxDate ? { maxAllowedDate: maxDate } : {}),
      reason: accCheck.reason,
    })
  }
  if (guestSide && gstCheck && !gstCheck.ok) {
    unresolvedItems.push({
      kind: 'inadmissibleDateClaim',
      entityKind,
      entityId,
      source: guestSourceLabel,
      claimedDate: guestSide.date,
      ...(minDate ? { minAllowedDate: minDate } : {}),
      ...(maxDate ? { maxAllowedDate: maxDate } : {}),
      reason: gstCheck.reason,
    })
  }

  const validAcc = accountSide && accCheck?.ok ? accountSide : undefined
  const validGst = guestSide && gstCheck?.ok ? guestSide : undefined

  if (validAcc && !validGst) {
    return {
      date: validAcc.date,
      dateProvenance: validAcc.dateProvenance,
      ...(validAcc.clientClaimedOn ? { clientClaimedOn: validAcc.clientClaimedOn } : {}),
    }
  }
  if (!validAcc && validGst) {
    return {
      date: validGst.date,
      dateProvenance: validGst.dateProvenance,
      ...(validGst.clientClaimedOn ? { clientClaimedOn: validGst.clientClaimedOn } : {}),
    }
  }
  if (!validAcc && !validGst) {
    const rawFallback =
      serverFallbackDate
      ?? (accountSide && guestSide
        ? laterDate(accountSide.date, guestSide.date)
        : (accountSide ?? guestSide)!.date)
    return {
      date: rawFallback,
      dateProvenance: 'clientReported',
      ...(guestSide ? { clientClaimedOn: guestSide.date } : {}),
    }
  }

  // Both sides have admissible dates
  const acc = validAcc!
  const gst = validGst!

  const earlierPreservedClaim =
    acc.clientClaimedOn && gst.clientClaimedOn
      ? earlierDate(acc.clientClaimedOn, gst.clientClaimedOn)
      : (acc.clientClaimedOn ?? gst.clientClaimedOn)

  if (acc.date === gst.date) {
    const prov: DateProvenance =
      acc.dateProvenance === 'serverVerified' || gst.dateProvenance === 'serverVerified'
        ? 'serverVerified'
        : 'clientReported'
    const claimed =
      prov === 'serverVerified'
        ? (earlierPreservedClaim && earlierPreservedClaim < acc.date ? earlierPreservedClaim : undefined)
        : earlierPreservedClaim
    return {
      date: acc.date,
      dateProvenance: prov,
      ...(claimed ? { clientClaimedOn: claimed } : {}),
    }
  }

  if (acc.dateProvenance === 'serverVerified' && gst.dateProvenance === 'serverVerified') {
    const chosen = earlierDate(acc.date, gst.date)
    return {
      date: chosen,
      dateProvenance: 'serverVerified',
      ...(earlierPreservedClaim && earlierPreservedClaim < chosen
        ? { clientClaimedOn: earlierPreservedClaim }
        : {}),
    }
  }

  if (acc.dateProvenance === 'serverVerified' && gst.dateProvenance === 'clientReported') {
    if (gst.date >= acc.date) {
      return {
        date: acc.date,
        dateProvenance: 'serverVerified',
        ...(acc.clientClaimedOn && acc.clientClaimedOn < acc.date
          ? { clientClaimedOn: acc.clientClaimedOn }
          : {}),
      }
    }
    // Unverified client date attempts to pre-date a server-verified record: preserve server date & flag
    if (entityKind === 'earnedAward') {
      unresolvedItems.push({
        kind: 'awardDateProvenanceConflict',
        awardId: entityId as CanonicalAwardId,
        serverVerifiedDate: acc.date,
        clientClaimedDate: gst.date,
        retainedDate: acc.date,
        reason: 'unverifiedClientDatePrecedesServerVerified',
      })
    } else {
      unresolvedItems.push({
        kind: 'completionDateProvenanceConflict',
        challengeId: entityId as CanonicalChallengeId,
        serverVerifiedDate: acc.date,
        clientClaimedDate: gst.date,
        retainedDate: acc.date,
        reason: 'unverifiedClientDatePrecedesServerVerified',
      })
    }
    return {
      date: acc.date,
      dateProvenance: 'serverVerified',
      clientClaimedOn: gst.date,
    }
  }

  if (acc.dateProvenance === 'clientReported' && gst.dateProvenance === 'serverVerified') {
    if (acc.date >= gst.date) {
      return {
        date: gst.date,
        dateProvenance: 'serverVerified',
        ...(gst.clientClaimedOn && gst.clientClaimedOn < gst.date
          ? { clientClaimedOn: gst.clientClaimedOn }
          : {}),
      }
    }
    if (entityKind === 'earnedAward') {
      unresolvedItems.push({
        kind: 'awardDateProvenanceConflict',
        awardId: entityId as CanonicalAwardId,
        serverVerifiedDate: gst.date,
        clientClaimedDate: acc.date,
        retainedDate: gst.date,
        reason: 'unverifiedClientDatePrecedesServerVerified',
      })
    } else {
      unresolvedItems.push({
        kind: 'completionDateProvenanceConflict',
        challengeId: entityId as CanonicalChallengeId,
        serverVerifiedDate: gst.date,
        clientClaimedDate: acc.date,
        retainedDate: gst.date,
        reason: 'unverifiedClientDatePrecedesServerVerified',
      })
    }
    return {
      date: gst.date,
      dateProvenance: 'serverVerified',
      clientClaimedOn: acc.date,
    }
  }

  // Both dates are unverified clientReported and disagree:
  // Never blindly pick the lowest client claim as settled truth; emit typed unresolved item
  // and retain conservative existing account date (which equals later/bounded on symmetry when equal).
  const sortedCandidates = [acc.date, gst.date].sort(compareStringsDeterministic)
  const retainedDate = acc.date
  if (entityKind === 'earnedAward') {
    unresolvedItems.push({
      kind: 'undecidableAwardDateProvenance',
      awardId: entityId as CanonicalAwardId,
      candidateDates: Object.freeze(sortedCandidates),
      retainedDate,
      reason: 'disagreeingUnverifiedClientDates',
    })
  } else {
    unresolvedItems.push({
      kind: 'undecidableCompletionDateProvenance',
      challengeId: entityId as CanonicalChallengeId,
      candidateDates: Object.freeze(sortedCandidates),
      retainedDate,
      reason: 'disagreeingUnverifiedClientDates',
    })
  }

  return {
    date: retainedDate,
    dateProvenance: 'clientReported',
    clientClaimedOn: gst.date,
  }
}

function areAccountDataEqual(
  left: ProposedAccountParticipationData,
  right: ProposedAccountParticipationData,
): boolean {
  return canonicalizeJsonValue(left) === canonicalizeJsonValue(right)
}

/**
 * Pure, offline guest-to-account reconciliation engine.
 */
export function reconcileGuestIntoAccount(
  input: ReconcileGuestIntoAccountInput,
): ReconciliationResult {
  if (!isPlainObject(input) || !isPlainObject(input.context)) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'invalidAccountEnvelope',
      message: 'Reconciliation input and context must be plain objects.',
      guestClearanceEligible: false,
    }
  }

  const { mode, guest, account, context } = input
  const allowedNamespace: ChallengeIdentityNamespace = context.expectedNamespace ?? 'cms'
  if (allowedNamespace !== 'cms' && allowedNamespace !== 'pilot') {
    return {
      ok: false,
      status: 'rejected',
      reason: 'crossNamespaceConflict',
      message: `Unsupported target namespace "${String(allowedNamespace)}".`,
      guestClearanceEligible: false,
    }
  }

  const expectedAccountId = parseAccountId(context.expectedAccountId)
  if (!expectedAccountId) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'invalidAccountId',
      message: 'Context expectedAccountId is missing or invalid.',
      guestClearanceEligible: false,
    }
  }

  if (!isPlainObject(account)) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'invalidAccountEnvelope',
      message: 'Account envelope must be a plain object.',
      guestClearanceEligible: false,
    }
  }

  const accountId = parseAccountId(account.accountId)
  if (!accountId) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'invalidAccountId',
      message: 'Account envelope accountId is missing or invalid.',
      guestClearanceEligible: false,
    }
  }

  if (accountId !== expectedAccountId) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'accountOwnershipMismatch',
      message: `Account ownership mismatch: expected "${expectedAccountId}" but got "${accountId}".`,
      guestClearanceEligible: false,
    }
  }

  if (
    typeof account.schemaVersion !== 'number'
    || !Number.isInteger(account.schemaVersion)
    || account.schemaVersion !== SUPPORTED_ACCOUNT_SCHEMA_VERSION
  ) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'unsupportedAccountSchemaVersion',
      message: `Unsupported account schemaVersion "${String(account.schemaVersion)}".`,
      guestClearanceEligible: false,
    }
  }

  if (account.namespace !== allowedNamespace) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'crossNamespaceConflict',
      message: `Account namespace "${String(account.namespace)}" does not match expected "${allowedNamespace}".`,
      guestClearanceEligible: false,
    }
  }

  if (
    typeof account.revision !== 'number'
    || !Number.isInteger(account.revision)
    || account.revision < 0
  ) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'invalidAccountEnvelope',
      message: 'Account revision must be a non-negative integer.',
      guestClearanceEligible: false,
    }
  }

  if (!isValidParticipationContainerShape(account.data, false)) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'invalidAccountEnvelope',
      message: 'Account data payload structure is invalid.',
      guestClearanceEligible: false,
    }
  }

  if (!isPlainObject(guest) || !isPlainObject(guest.envelope)) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'invalidGuestEnvelope',
      message: 'Guest reconciliation input must include a plain envelope object.',
      guestClearanceEligible: false,
    }
  }

  if (guest.namespace !== undefined && guest.namespace !== allowedNamespace) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'crossNamespaceConflict',
      message: `Guest namespace "${String(guest.namespace)}" cannot be merged into "${allowedNamespace}".`,
      guestClearanceEligible: false,
    }
  }

  const guestSchemaVersion = guest.envelope.schemaVersion
  if (
    typeof guestSchemaVersion !== 'number'
    || !Number.isInteger(guestSchemaVersion)
    || (guestSchemaVersion !== 1 && guestSchemaVersion !== 2)
  ) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'unsupportedGuestSchemaVersion',
      message: `Unsupported guest schemaVersion "${String(guestSchemaVersion)}".`,
      guestClearanceEligible: false,
    }
  }

  if (!isValidParticipationContainerShape(guest.envelope.data, guestSchemaVersion === 1)) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'invalidGuestEnvelope',
      message: 'Guest envelope data payload structure is invalid.',
      guestClearanceEligible: false,
    }
  }

  if (mode === 'newAccountTransfer' && hasAnyParticipationData(account.data)) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'nonEmptyAccountForNewTransfer',
      message: 'newAccountTransfer requires an empty initial account state.',
      guestClearanceEligible: false,
    }
  }

  const guestFingerprint = computeGuestPayloadFingerprint(guest)
  const aliases = buildValidatedAliasMap(context.challengeAliases, allowedNamespace)
  const appliedAliases: Record<string, CanonicalChallengeId> = {}
  const rejectedRecords: RejectedRecordDiagnostic[] = []
  const unresolvedItems: UnresolvedReconciliationItem[] = []
  const shelfConflicts: ShelfConflictResolutionNotice[] = []

  const maxCredibleDate = context.maxCredibleDateUtcPlus14
  const serverAuthorizedDate = context.serverAuthorizedLocalDate
  const guestDefaultProvenance: DateProvenance = context.guestDateProvenance ?? 'clientReported'

  const normalizedAccount = normalizeSourceStateForMerge({
    source: 'account',
    rawData: account.data,
    schemaVersion: account.schemaVersion,
    allowedNamespace,
    defaultDateProvenance: 'serverVerified',
    aliases,
    appliedAliases,
    rejectedRecords,
    unresolvedItems,
    challengeMinReleaseDate: context.challengeMinReleaseDate,
    maxCredibleDate,
    serverAuthorizedDate,
  })

  const normalizedGuest = normalizeSourceStateForMerge({
    source: 'guest',
    rawData: guest.envelope.data,
    schemaVersion: guestSchemaVersion,
    rawShelfOverride: guest.shelf,
    allowedNamespace,
    defaultDateProvenance: guestDefaultProvenance,
    aliases,
    appliedAliases,
    rejectedRecords,
    unresolvedItems,
    challengeMinReleaseDate: context.challengeMinReleaseDate,
    maxCredibleDate,
    serverAuthorizedDate,
  })

  // 1. Completed Challenges (union by CanonicalChallengeId with credible date provenance)
  const completedIds = new Set<string>([
    ...Object.keys(normalizedAccount.completedChallenges),
    ...Object.keys(normalizedGuest.completedChallenges),
  ])
  const mergedCompleted: Record<string, ProposedAccountCompletedChallengeRecord> = {}
  for (const id of [...completedIds].sort(compareStringsDeterministic)) {
    const accRec = normalizedAccount.completedChallenges[id]
    const gstRec = normalizedGuest.completedChallenges[id]
    const minDate = context.challengeMinReleaseDate?.[id]
    const resolution = resolveDatedRecordMerge({
      entityKind: 'challengeCompletion',
      entityId: id,
      accountSide: accRec
        ? {
            date: accRec.completedOn,
            dateProvenance: accRec.dateProvenance,
            clientClaimedOn: accRec.clientClaimedOn,
          }
        : undefined,
      guestSide: gstRec
        ? {
            date: gstRec.completedOn,
            dateProvenance: gstRec.dateProvenance,
            clientClaimedOn: gstRec.clientClaimedOn,
          }
        : undefined,
      minDate,
      maxDate: maxCredibleDate,
      serverFallbackDate: serverAuthorizedDate,
      unresolvedItems,
    })

    mergedCompleted[id] = Object.freeze({
      completedOn: resolution.date,
      dateProvenance: resolution.dateProvenance,
      ...(resolution.clientClaimedOn ? { clientClaimedOn: resolution.clientClaimedOn } : {}),
    })
  }

  // 2. In-Progress Challenges (exclude completed; furthest position ONLY with authoritative screen order)
  const inProgressIds = new Set<string>([
    ...Object.keys(normalizedAccount.inProgressChallenges),
    ...Object.keys(normalizedGuest.inProgressChallenges),
  ])
  const mergedInProgress: Record<string, ChallengeResumeRecord> = {}
  for (const id of [...inProgressIds].sort(compareStringsDeterministic)) {
    if (Object.hasOwn(mergedCompleted, id)) continue
    const accRec = normalizedAccount.inProgressChallenges[id]
    const gstRec = normalizedGuest.inProgressChallenges[id]

    if (accRec && !gstRec) {
      mergedInProgress[id] = accRec
      continue
    }
    if (!accRec && gstRec) {
      mergedInProgress[id] = gstRec
      continue
    }

    const acc = accRec!
    const gst = gstRec!
    if (acc.screenId === gst.screenId) {
      mergedInProgress[id] = Object.freeze({
        ...(acc.screenId !== undefined ? { screenId: acc.screenId } : {}),
        updatedOn: laterDate(acc.updatedOn, gst.updatedOn),
      })
      continue
    }

    const screenOrder = context.screenOrderByChallenge?.[id]
    const hasOrder = Array.isArray(screenOrder) && screenOrder.length > 0
    const accIdx = acc.screenId === undefined ? -1 : (hasOrder ? screenOrder.indexOf(acc.screenId) : -2)
    const gstIdx = gst.screenId === undefined ? -1 : (hasOrder ? screenOrder.indexOf(gst.screenId) : -2)
    const accValidInOrder = acc.screenId === undefined || accIdx >= 0
    const gstValidInOrder = gst.screenId === undefined || gstIdx >= 0

    if (hasOrder && accValidInOrder && gstValidInOrder) {
      if (accIdx > gstIdx) {
        mergedInProgress[id] = acc
      } else if (gstIdx > accIdx) {
        mergedInProgress[id] = gst
      } else {
        mergedInProgress[id] = Object.freeze({
          ...(acc.screenId !== undefined ? { screenId: acc.screenId } : {}),
          updatedOn: laterDate(acc.updatedOn, gst.updatedOn),
        })
      }
      continue
    }

    // Never compare opaque screenIds lexicographically or break unknown position ties by timestamp
    unresolvedItems.push({
      kind: 'undecidableReadingPosition',
      challengeId: id as CanonicalChallengeId,
      accountPosition: acc,
      guestPosition: gst,
      retainedPosition: acc,
      reason: hasOrder ? 'unknownScreenIdInOrder' : 'missingAuthoritativeScreenOrder',
    })
    mergedInProgress[id] = acc
  }

  // 3. Saved Challenges (commutative union keeping earliest savedOn)
  const savedIds = new Set<string>([
    ...Object.keys(normalizedAccount.savedChallenges),
    ...Object.keys(normalizedGuest.savedChallenges),
  ])
  const mergedSavedChallenges: Record<string, SavedChallengeRecord> = {}
  for (const id of [...savedIds].sort(compareStringsDeterministic)) {
    const accRec = normalizedAccount.savedChallenges[id]
    const gstRec = normalizedGuest.savedChallenges[id]
    if (accRec && !gstRec) {
      mergedSavedChallenges[id] = accRec
    } else if (!accRec && gstRec) {
      mergedSavedChallenges[id] = gstRec
    } else if (accRec && gstRec) {
      mergedSavedChallenges[id] = Object.freeze({
        savedOn: earlierDate(accRec.savedOn, gstRec.savedOn),
      })
    }
  }

  // 4. Saved Scripture (union & deduplicate by SavedScriptureKey; deterministic earliest-first order)
  const scriptureMap = new Map<string, SavedScriptureRecord>()
  for (const [key, rec] of normalizedAccount.savedScriptures.entries()) {
    scriptureMap.set(key, rec)
  }
  for (const [key, rec] of normalizedGuest.savedScriptures.entries()) {
    const existing = scriptureMap.get(key)
    scriptureMap.set(key, existing ? mergeSavedScripturePair(existing, rec) : rec)
  }
  const mergedSavedScriptures = [...scriptureMap.values()].sort((left, right) => {
    if (left.savedOn !== right.savedOn) {
      return left.savedOn < right.savedOn ? -1 : 1
    }
    return compareStringsDeterministic(left.key, right.key)
  })

  // 5. Last-Opened Pointer
  const mergedLastOpened = mergeLastOpenedPointers(
    normalizedAccount.lastOpenedChallenge,
    normalizedGuest.lastOpenedChallenge,
  )

  // 6. Earned Awards (unique by awardId, credible earnedOn, independent monotonic flags, non-regressive Card)
  const awardIds = new Set<string>([
    ...Object.keys(normalizedAccount.earnedAwards),
    ...Object.keys(normalizedGuest.earnedAwards),
  ])
  const mergedEarnedAwards: Record<string, ProposedAccountEarnedAwardRecord> = {}
  for (const id of [...awardIds].sort(compareStringsDeterministic)) {
    const accRec = normalizedAccount.earnedAwards[id]
    const gstRec = normalizedGuest.earnedAwards[id]
    const sample = (accRec ?? gstRec)!
    const monthStart = `${sample.publicationYearMonth}-01` as LocalCalendarDate
    const configuredFloor = context.awardMinEarnDate?.[id]
    const effectiveMinDate = configuredFloor ? laterDate(monthStart, configuredFloor) : monthStart

    const dateRes = resolveDatedRecordMerge({
      entityKind: 'earnedAward',
      entityId: id,
      accountSide: accRec
        ? {
            date: accRec.earnedOn,
            dateProvenance: accRec.dateProvenance,
            clientClaimedOn: accRec.clientClaimedOn,
          }
        : undefined,
      guestSide: gstRec
        ? {
            date: gstRec.earnedOn,
            dateProvenance: gstRec.dateProvenance,
            clientClaimedOn: gstRec.clientClaimedOn,
          }
        : undefined,
      minDate: effectiveMinDate,
      maxDate: maxCredibleDate,
      serverFallbackDate: serverAuthorizedDate,
      unresolvedItems,
    })

    const hubAnnouncementAcked = Boolean(
      accRec?.hubAnnouncementAcked || gstRec?.hubAnnouncementAcked,
    )
    const cardViewed = Boolean(accRec?.cardViewed || gstRec?.cardViewed)

    const chosenCard = accRec?.earnedCard ?? gstRec?.earnedCard
    const chosenDocId =
      chosenCard?.cardDocumentId
      ?? accRec?.cardDocumentId
      ?? gstRec?.cardDocumentId

    mergedEarnedAwards[id] = Object.freeze({
      awardId: sample.awardId,
      kind: sample.kind,
      publicationYearMonth: sample.publicationYearMonth,
      discoveryId: sample.discoveryId,
      earnedOn: dateRes.date,
      dateProvenance: dateRes.dateProvenance,
      ...(dateRes.clientClaimedOn ? { clientClaimedOn: dateRes.clientClaimedOn } : {}),
      hubAnnouncementAcked,
      cardViewed,
      ...(chosenDocId ? { cardDocumentId: chosenDocId } : {}),
      ...(chosenCard ? { earnedCard: chosenCard } : {}),
    })
  }

  // 7. Proposed Shelf State (existing account Shelf precedence; underlying guest data preserved)
  let mergedShelf: ProposedAccountShelfState | undefined
  if (mode === 'newAccountTransfer') {
    mergedShelf = normalizedGuest.shelf
  } else if (normalizedAccount.shelf !== undefined) {
    mergedShelf = normalizedAccount.shelf
    if (normalizedGuest.shelf) {
      const accountMonthSet = new Set(normalizedAccount.shelf.months.map(m => m.yearMonth))
      for (const guestEntry of normalizedGuest.shelf.months) {
        if (!accountMonthSet.has(guestEntry.yearMonth)) {
          shelfConflicts.push(
            Object.freeze({
              yearMonth: guestEntry.yearMonth,
              guestAdmissionKind: guestEntry.admissionKind,
              disposition: 'preservedInLibraryNotOnShelf',
            }),
          )
        }
      }
    }
  } else {
    mergedShelf = normalizedGuest.shelf
  }

  const mergedData: ProposedAccountParticipationData = Object.freeze({
    completedChallenges: Object.freeze(mergedCompleted),
    inProgressChallenges: Object.freeze(mergedInProgress),
    savedChallenges: Object.freeze(mergedSavedChallenges),
    savedScriptures: Object.freeze(mergedSavedScriptures),
    lastOpenedChallenge: mergedLastOpened,
    earnedAwards: Object.freeze(mergedEarnedAwards),
    ...(mergedShelf !== undefined ? { shelf: mergedShelf } : {}),
  })

  const changedFromAccount = !areAccountDataEqual(account.data, mergedData)
  const nextRevision = changedFromAccount ? account.revision + 1 : account.revision

  const mergedAccount: ProposedAccountParticipationEnvelope = Object.freeze({
    schemaVersion: SUPPORTED_ACCOUNT_SCHEMA_VERSION,
    accountId,
    namespace: allowedNamespace,
    revision: nextRevision,
    data: mergedData,
  })

  const hasUnresolved = unresolvedItems.length > 0
  const hasRejectedGuestRecords = rejectedRecords.some(record => record.source === 'guest')

  return Object.freeze({
    ok: true,
    status: hasUnresolved ? 'reconciledWithUnresolved' : 'clean',
    mode,
    ...(context.idempotencyKey ? { idempotencyKey: context.idempotencyKey } : {}),
    guestPayloadFingerprint: guestFingerprint,
    mergedAccount,
    changedFromAccount,
    unresolvedItems: Object.freeze(unresolvedItems),
    shelfConflicts: Object.freeze(shelfConflicts),
    rejectedRecords: Object.freeze(rejectedRecords),
    appliedAliases: Object.freeze(appliedAliases),
    guestClearanceEligible: !hasUnresolved && !hasRejectedGuestRecords,
  })
}

function normalizeSourceStateForMerge(
  params: Parameters<typeof normalizeSourceData>[0],
): NormalizedSourceState {
  return normalizeSourceData(params)
}

function mergeLastOpenedPointers(
  acc: LastOpenedChallengePointer | null,
  gst: LastOpenedChallengePointer | null,
): LastOpenedChallengePointer | null {
  if (!acc && !gst) return null
  if (acc && !gst) return acc
  if (!acc && gst) return gst

  const left = acc!
  const right = gst!
  if (left.openedOn > right.openedOn) return left
  if (right.openedOn > left.openedOn) return right

  if (left.challengeId === right.challengeId) {
    let dismissed: LocalCalendarDate | undefined
    if (left.resumeDismissedOn && right.resumeDismissedOn) {
      dismissed = laterDate(left.resumeDismissedOn, right.resumeDismissedOn)
    } else {
      dismissed = left.resumeDismissedOn ?? right.resumeDismissedOn
    }
    return Object.freeze({
      challengeId: left.challengeId,
      openedOn: left.openedOn,
      ...(dismissed ? { resumeDismissedOn: dismissed } : {}),
    })
  }

  return left
}

/**
 * Pure crash- and retry-safety guard for clearing local guest storage after account transfer/merge.
 *
 * Guest local storage MUST NEVER be cleared unless:
 * 1. A durable commit ACK (`committed` or `alreadyCommittedDuplicate`) was received;
 * 2. The receipt matches the authenticated `accountId`, `idempotencyKey`, and `expectedGuestFingerprint`;
 * 3. No local guest mutation occurred in flight (`currentGuestFingerprint === expectedGuestFingerprint`); and
 * 4. Any unresolved items were durably persisted on the server (`unresolvedCount === 0 || unresolvedPersistedOnServer`).
 */
export function canSafelyClearGuestStorage(input: {
  readonly expectedAccountId: string
  readonly expectedIdempotencyKey: string
  readonly expectedGuestFingerprint: string
  readonly currentGuestFingerprint: string
  readonly receipt: CommitAckReceipt | null | undefined
}): GuestClearanceDecision {
  const {
    expectedAccountId,
    expectedIdempotencyKey,
    expectedGuestFingerprint,
    currentGuestFingerprint,
    receipt,
  } = input

  if (!parseAccountId(expectedAccountId)) {
    return Object.freeze({ shouldClearGuestStorage: false, reason: 'invalidAccountId' })
  }
  if (!receipt) {
    return Object.freeze({ shouldClearGuestStorage: false, reason: 'missingReceipt' })
  }
  if (!receipt.ok || receipt.status === 'failed') {
    return Object.freeze({ shouldClearGuestStorage: false, reason: 'commitFailed' })
  }
  if (receipt.accountId !== expectedAccountId) {
    return Object.freeze({ shouldClearGuestStorage: false, reason: 'accountIdMismatch' })
  }
  if (receipt.idempotencyKey !== expectedIdempotencyKey) {
    return Object.freeze({ shouldClearGuestStorage: false, reason: 'idempotencyKeyMismatch' })
  }
  if (receipt.committedGuestFingerprint !== expectedGuestFingerprint) {
    return Object.freeze({ shouldClearGuestStorage: false, reason: 'fingerprintMismatchWithReceipt' })
  }
  if (currentGuestFingerprint !== expectedGuestFingerprint) {
    return Object.freeze({ shouldClearGuestStorage: false, reason: 'localGuestMutatedInFlight' })
  }
  if (!Number.isInteger(receipt.durableRevision) || receipt.durableRevision < 1) {
    return Object.freeze({ shouldClearGuestStorage: false, reason: 'invalidRevision' })
  }
  if (receipt.unresolvedCount > 0 && !receipt.unresolvedPersistedOnServer) {
    return Object.freeze({ shouldClearGuestStorage: false, reason: 'unresolvedNotPersistedOnServer' })
  }

  return Object.freeze({
    shouldClearGuestStorage: true,
    reason: 'verifiedDurableCommit',
  })
}
