import {
  R08A_MONTHLY_NEWS_DOCUMENTS,
  R08A_MONTHLY_PUBLICATION_DOCUMENTS,
  buildChallengeId,
  buildR08aNegativeVariants,
  toDereferencedMonthlyDetailDoc,
  toDereferencedMonthlyPreviewDoc,
  toDereferencedNewsArticleDoc,
  toDereferencedSlottedChallengeDoc,
} from '../../src/gateway/fixtures/r08aMonthlyFixtures.ts'
import type { AuditFixtureBundle, SecretMarker } from './types.ts'

export const AUDIT_FIXTURE_MARKERS: readonly SecretMarker[] = [
  { markerId: 'embargoed_future_challenge_body', token: 'SENTINEL_FUTURE_BODY_2098_03_20' },
  { markerId: 'embargoed_future_scripture_passage', token: 'SENTINEL_FUTURE_PASSAGE_2098_03_20' },
  { markerId: 'premature_welcome_screen', token: 'SENTINEL_PREMATURE_WELCOME_SCREEN' },
  { markerId: 'premature_discovery_title', token: 'SENTINEL_PREVIEW_DISCOVERY_TITLE' },
  { markerId: 'hidden_discovery_qualifying_map', token: 'SENTINEL_HIDDEN_QUALIFYING_MAP' },
  { markerId: 'unrewarded_card_artwork_url', token: 'SENTINEL_UNEARNED_CARD_ART_URL' },
  { markerId: 'unrewarded_card_alt', token: 'SENTINEL_UNEARNED_CARD_ALT' },
  { markerId: 'unrewarded_card_transcription', token: 'SENTINEL_UNEARNED_CARD_TRANSCRIPTION' },
  { markerId: 'unauthorized_asset_reference', token: 'https://private-bucket.invalid/embargoed/asset.png' },
  { markerId: 'private_participation_data', token: 'SENTINEL_PRIVATE_PARTICIPATION_USER' },
  { markerId: 'internal_editorial_notes', token: 'SENTINEL_INTERNAL_EDITORIAL_NOTE' },
  { markerId: 'draft_manuscript_text', token: 'SENTINEL_DRAFT_MANUSCRIPT' },
  { markerId: 'unreviewed_manuscript_text', token: 'SENTINEL_UNREVIEWED_MANUSCRIPT' },
  { markerId: 'unapproved_block_text', token: 'SENTINEL_UNAPPROVED_BLOCK_TEXT' },
  { markerId: 'unlicensed_scripture_passage', token: 'SECRET_UNLICENSED_R08A_PASSAGE' },
  { markerId: 'withdrawn_challenge_title', token: 'SECRET_WITHDRAWN_DAY_18_TITLE' },
  { markerId: 'retracted_withdrawn_passage', token: 'SECRET_RETRACTED_DAY_18_PASSAGE' },
] as const

function cloneObj<T>(value: T): T {
  return structuredClone(value)
}

function injectPrivateParticipationFields(target: Record<string, unknown>): void {
  target.internalNotes = 'SENTINEL_INTERNAL_EDITORIAL_NOTE'
  target.privateParticipation = {
    completedByUserIds: ['SENTINEL_PRIVATE_PARTICIPATION_USER'],
    readerEmail: 'SENTINEL_PRIVATE_PARTICIPATION_USER@example.invalid',
  }
  target.unauthorizedAssetRef = 'https://private-bucket.invalid/embargoed/asset.png'
}

export function buildAuditFixtureBundle(): AuditFixtureBundle {
  const basePreview209803 = toDereferencedMonthlyPreviewDoc('2098-03')
  const baseDetail209803 = toDereferencedMonthlyDetailDoc('2098-03')
  const baseDetail209802 = toDereferencedMonthlyDetailDoc('2098-02')
  const baseDetail209602 = toDereferencedMonthlyDetailDoc('2096-02')
  const baseDetail209804 = toDereferencedMonthlyDetailDoc('2098-04')
  const baseFuture209803Day20 = toDereferencedSlottedChallengeDoc(buildChallengeId('2098-03', 20))
  const baseActive209803Day05 = toDereferencedSlottedChallengeDoc(buildChallengeId('2098-03', 5))

  if (
    !basePreview209803 ||
    !baseDetail209803 ||
    !baseDetail209802 ||
    !baseDetail209602 ||
    !baseDetail209804 ||
    !baseFuture209803Day20 ||
    !baseActive209803Day05
  ) {
    throw new Error('Failed to build base R08A synthetic monthly fixtures for audit.')
  }

  // 1. Advance preview 2098-03 with injected forbidden fields that MUST be stripped by projection
  const previewDoc209803 = cloneObj(basePreview209803) as Record<string, unknown>
  injectPrivateParticipationFields(previewDoc209803)
  const previewIntro209803 = previewDoc209803.introduction as Record<string, unknown>
  previewIntro209803.welcomeScreen = {
    id: 'welcome-sentinel',
    title: 'SENTINEL_PREMATURE_WELCOME_SCREEN',
    blocks: [{ _key: 'wb1', _type: 'statementBlock', text: 'SENTINEL_PREMATURE_WELCOME_SCREEN' }],
  }
  previewDoc209803.discoveries = [
    {
      discoveryId: 'disc-sentinel-preview',
      kind: 'thematic',
      title: 'SENTINEL_PREVIEW_DISCOVERY_TITLE',
      targetCount: 3,
      qualifyingChallenges: ['SENTINEL_HIDDEN_QUALIFYING_MAP'],
    },
  ]
  previewDoc209803.fullMonthCard = {
    _id: 'card-sentinel-preview',
    imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/SENTINEL_UNEARNED_CARD_ART_URL.png',
    illustrationAlt: 'SENTINEL_UNEARNED_CARD_ALT',
  }
  const previewSlots = previewDoc209803.slots as Record<string, unknown>[]
  if (previewSlots[19]) {
    previewSlots[19].challenge = {
      ...(previewSlots[19].challenge as Record<string, unknown>),
      screens: [
        {
          _key: 's1',
          _type: 'challengeScreen',
          blocks: [{ _key: 'b1', _type: 'statementBlock', text: 'SENTINEL_FUTURE_BODY_2098_03_20' }],
        },
      ],
    }
  }

  // 2. Leap-year March 2096 preview doc (to verify Feb 27 preview rule in leap year 2096)
  const previewDoc209603 = cloneObj(previewDoc209803)
  previewDoc209603._id = 'month-2096-03'
  previewDoc209603.yearMonth = '2096-03'
  previewDoc209603.year = 2096
  previewDoc209603.month = 3
  previewDoc209603.title = 'Synthetic March 2096 (Post-Leap Preview)'
  previewDoc209603.slots = (previewDoc209603.slots as Record<string, unknown>[]).map(slot => {
    const updatedSlot = {
      ...slot,
      date: String(slot.date).replace(/^2098-03-/, '2096-03-'),
    }
    if (updatedSlot.challenge && typeof updatedSlot.challenge === 'object') {
      updatedSlot.challenge = {
        ...(updatedSlot.challenge as Record<string, unknown>),
        assignedMonthIds: ['month-2096-03'],
      }
    }
    return updatedSlot
  })

  // 3. Active/historical month detail 2098-03 with injected hidden discovery mappings,
  // unearned card artwork, unauthorized asset refs, and private participation data.
  const detailDoc209803 = cloneObj(baseDetail209803) as Record<string, unknown>
  injectPrivateParticipationFields(detailDoc209803)
  const detailDiscoveries = detailDoc209803.discoveries as Record<string, unknown>[]
  for (const disc of detailDiscoveries) {
    disc.qualifyingChallengeIds = [buildChallengeId('2098-03', 20)]
    disc.hiddenQualifyingMap = 'SENTINEL_HIDDEN_QUALIFYING_MAP'
    const card = disc.card as Record<string, unknown> | undefined
    if (card) {
      card.imageUrl = 'https://cdn.sanity.io/images/80016lrq/staging/SENTINEL_UNEARNED_CARD_ART_URL.png'
      card.illustrationAlt = 'SENTINEL_UNEARNED_CARD_ALT'
      card.accessibleTranscription = 'SENTINEL_UNEARNED_CARD_TRANSCRIPTION'
      card.internalCardAsset = 'https://private-bucket.invalid/embargoed/asset.png'
    }
  }
  const fullMonthCard = detailDoc209803.fullMonthCard as Record<string, unknown> | undefined
  if (fullMonthCard) {
    fullMonthCard.imageUrl =
      'https://cdn.sanity.io/images/80016lrq/staging/SENTINEL_UNEARNED_CARD_ART_URL.png'
    fullMonthCard.illustrationAlt = 'SENTINEL_UNEARNED_CARD_ALT'
    fullMonthCard.accessibleTranscription = 'SENTINEL_UNEARNED_CARD_TRANSCRIPTION'
  }

  // 4. Future Challenge 2098-03-20 with embargoed manuscript sentinel
  const futureChallenge209803Day20 = cloneObj(baseFuture209803Day20) as Record<string, unknown>
  injectPrivateParticipationFields(futureChallenge209803Day20)
  futureChallenge209803Day20.screens = [
    {
      _key: 's-future-20',
      _type: 'challengeScreen',
      heading: 'Embargoed Future Teaching',
      blocks: [
        {
          _key: 'b-future-20',
          _type: 'statementBlock',
          text: 'SENTINEL_FUTURE_BODY_2098_03_20',
          requiredForCompletion: true,
        },
      ],
    },
  ]
  futureChallenge209803Day20.primaryScripture = {
    reference: 'John 15:5',
    translation: 'WEBP',
    textStatus: 'provided',
    passage: 'SENTINEL_FUTURE_PASSAGE_2098_03_20',
    usageRightsConfirmed: true,
    practiceStatus: 'notConfigured',
  }

  // 5. Active Challenge 2098-03-05 with injected private fields that MUST be stripped
  const activeChallenge209803Day05 = cloneObj(baseActive209803Day05) as Record<string, unknown>
  injectPrivateParticipationFields(activeChallenge209803Day05)

  // 6. Unpublished / unreviewed / unapproved-block / unlicensed Challenge variants
  const draftChallengeDoc = cloneObj(activeChallenge209803Day05)
  draftChallengeDoc._id = `drafts.${String(activeChallenge209803Day05._id)}`
  draftChallengeDoc.screens = [
    {
      _key: 's-draft',
      _type: 'challengeScreen',
      blocks: [{ _key: 'b-draft', _type: 'statementBlock', text: 'SENTINEL_DRAFT_MANUSCRIPT' }],
    },
  ]

  const unreviewedChallengeDoc = cloneObj(activeChallenge209803Day05)
  unreviewedChallengeDoc.editorialEligibility = { adaptationReviewed: false }
  unreviewedChallengeDoc.screens = [
    {
      _key: 's-unrev',
      _type: 'challengeScreen',
      blocks: [{ _key: 'b-unrev', _type: 'statementBlock', text: 'SENTINEL_UNREVIEWED_MANUSCRIPT' }],
    },
  ]

  const unapprovedBlockChallengeDoc = cloneObj(activeChallenge209803Day05)
  unapprovedBlockChallengeDoc.unapprovedBlockCount = 1
  unapprovedBlockChallengeDoc.screens = [
    {
      _key: 's-unapp',
      _type: 'challengeScreen',
      blocks: [
        {
          _key: 'b-unapp',
          _type: 'statementBlock',
          text: 'SENTINEL_UNAPPROVED_BLOCK_TEXT',
          reviewStatus: 'proposed',
        },
      ],
    },
  ]

  const negativeVariants = buildR08aNegativeVariants()
  const unlicensedSlots = negativeVariants.unlicensedScriptureChallengeGateway
    .slots as Record<string, unknown>[]
  const unlicensedChallengeRaw = cloneObj(unlicensedSlots[6].challenge as Record<string, unknown>)
  unlicensedChallengeRaw.assignedMonthIds = ['month-2098-04']
  unlicensedChallengeRaw.assignedSlot = {
    monthId: '2098-04',
    documentId: 'month-2098-04',
    monthTitle: 'Synthetic April 2098 (30 Days)',
    editorialStatus: 'scheduled',
    withdrawn: false,
    dayOfMonth: 7,
    date: '2098-04-07',
    slotStatus: 'scheduled',
  }

  // 7. News and Library month docs
  const previewNewsDocs = R08A_MONTHLY_NEWS_DOCUMENTS.map(doc => {
    const deref = toDereferencedNewsArticleDoc(doc) as Record<string, unknown>
    injectPrivateParticipationFields(deref)
    return deref
  })

  const libraryMonthDocs = R08A_MONTHLY_PUBLICATION_DOCUMENTS.map(doc => {
    const deref = toDereferencedMonthlyDetailDoc(doc.yearMonth)! as Record<string, unknown>
    injectPrivateParticipationFields(deref)
    return deref
  })

  return {
    bundleId: 'r18-r08a-synthetic-audit-v1',
    previewDoc209803,
    previewDoc209603,
    detailDoc209803,
    detailDoc209802: cloneObj(baseDetail209802) as Record<string, unknown>,
    detailDoc209602: cloneObj(baseDetail209602) as Record<string, unknown>,
    detailDoc209804: cloneObj(baseDetail209804) as Record<string, unknown>,
    futureChallenge209803Day20,
    activeChallenge209803Day05,
    draftChallengeDoc,
    unreviewedChallengeDoc,
    unapprovedBlockChallengeDoc,
    unlicensedScriptureChallengeDoc: unlicensedChallengeRaw,
    duplicateSlotDetailDoc: negativeVariants.duplicateIntraMonthSlotGateway,
    foreignSlotDetailDoc: negativeVariants.foreignMonthSlotRefGateway,
    immediateWithdrawalDetailDoc: negativeVariants.immediateWithdrawalLiveGateway,
    retractedWithdrawalDetailDoc: negativeVariants.retractedWithdrawnChallengeGateway,
    amendedV2WithdrawalDetailDoc: negativeVariants.formalAmendedV2WithdrawalGateway,
    previewNewsDocs,
    libraryMonthDocs,
    secretMarkers: AUDIT_FIXTURE_MARKERS,
  }
}

const REQUIRED_MARKER_INJECTION_DOCS: Readonly<Record<string, readonly (keyof AuditFixtureBundle)[]>> = {
  embargoed_future_challenge_body: ['futureChallenge209803Day20', 'previewDoc209803'],
  embargoed_future_scripture_passage: ['futureChallenge209803Day20'],
  premature_welcome_screen: ['previewDoc209803'],
  premature_discovery_title: ['previewDoc209803'],
  hidden_discovery_qualifying_map: ['detailDoc209803', 'previewDoc209803'],
  unrewarded_card_artwork_url: ['detailDoc209803', 'previewDoc209803'],
  unrewarded_card_alt: ['detailDoc209803', 'previewDoc209803'],
  unrewarded_card_transcription: ['detailDoc209803'],
  unauthorized_asset_reference: [
    'detailDoc209803',
    'previewDoc209803',
    'futureChallenge209803Day20',
    'activeChallenge209803Day05',
  ],
  private_participation_data: [
    'detailDoc209803',
    'previewDoc209803',
    'futureChallenge209803Day20',
    'activeChallenge209803Day05',
  ],
  internal_editorial_notes: [
    'detailDoc209803',
    'previewDoc209803',
    'futureChallenge209803Day20',
    'activeChallenge209803Day05',
  ],
  draft_manuscript_text: ['draftChallengeDoc'],
  unreviewed_manuscript_text: ['unreviewedChallengeDoc'],
  unapproved_block_text: ['unapprovedBlockChallengeDoc'],
  unlicensed_scripture_passage: ['unlicensedScriptureChallengeDoc'],
  withdrawn_challenge_title: ['immediateWithdrawalDetailDoc'],
  retracted_withdrawn_passage: ['retractedWithdrawalDetailDoc'],
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Validates that the audit fixture bundle is structurally intact, strictly synthetic,
 * and carries complete sentinel marker coverage and injection points.
 * Fails closed with a descriptive error if required fixtures or markers are missing.
 */
export function validateAuditFixtureBundle(bundle: unknown): {
  readonly ok: boolean
  readonly reason?: string
} {
  if (!isPlainRecord(bundle)) {
    return { ok: false, reason: 'Fixture bundle is missing or not an object.' }
  }
  const record = bundle as Partial<AuditFixtureBundle>
  if (typeof record.bundleId !== 'string' || record.bundleId.trim().length === 0) {
    return { ok: false, reason: 'Fixture bundleId is missing or empty.' }
  }
  const requiredDocs: Array<keyof AuditFixtureBundle> = [
    'previewDoc209803',
    'previewDoc209603',
    'detailDoc209803',
    'detailDoc209802',
    'detailDoc209602',
    'detailDoc209804',
    'futureChallenge209803Day20',
    'activeChallenge209803Day05',
    'draftChallengeDoc',
    'unreviewedChallengeDoc',
    'unapprovedBlockChallengeDoc',
    'unlicensedScriptureChallengeDoc',
    'duplicateSlotDetailDoc',
    'foreignSlotDetailDoc',
    'immediateWithdrawalDetailDoc',
    'retractedWithdrawalDetailDoc',
    'amendedV2WithdrawalDetailDoc',
  ]
  for (const key of requiredDocs) {
    const val = record[key]
    if (!isPlainRecord(val)) {
      return { ok: false, reason: `Required fixture document "${String(key)}" is missing or invalid.` }
    }
  }
  if (!Array.isArray(record.previewNewsDocs) || record.previewNewsDocs.length === 0) {
    return { ok: false, reason: 'Fixture previewNewsDocs must be a non-empty array.' }
  }
  if (!record.previewNewsDocs.every(doc => isPlainRecord(doc))) {
    return { ok: false, reason: 'Fixture previewNewsDocs must contain only valid document objects.' }
  }
  if (!Array.isArray(record.libraryMonthDocs) || record.libraryMonthDocs.length === 0) {
    return { ok: false, reason: 'Fixture libraryMonthDocs must be a non-empty array.' }
  }
  if (!record.libraryMonthDocs.every(doc => isPlainRecord(doc))) {
    return { ok: false, reason: 'Fixture libraryMonthDocs must contain only valid document objects.' }
  }
  if (!Array.isArray(record.secretMarkers) || record.secretMarkers.length === 0) {
    return { ok: false, reason: 'Fixture secretMarkers must be a non-empty array.' }
  }

  const seenIds = new Set<string>()
  const seenTokens = new Set<string>()
  const markerMap = new Map<string, string>()

  for (let i = 0; i < record.secretMarkers.length; i += 1) {
    const entry = record.secretMarkers[i] as Partial<SecretMarker> | undefined
    if (!isPlainRecord(entry)) {
      return { ok: false, reason: `Fixture secretMarkers[${i}] must be an object.` }
    }
    if (typeof entry.markerId !== 'string' || entry.markerId.trim().length === 0) {
      return { ok: false, reason: `Fixture secretMarkers[${i}].markerId must be a non-empty string.` }
    }
    if (typeof entry.token !== 'string' || entry.token.trim().length === 0) {
      return {
        ok: false,
        reason: `Fixture secretMarkers[${i}] ("${entry.markerId}") token must be a non-empty string.`,
      }
    }
    if (seenIds.has(entry.markerId)) {
      return { ok: false, reason: `Duplicate secret markerId "${entry.markerId}" in fixture bundle.` }
    }
    if (seenTokens.has(entry.token)) {
      return {
        ok: false,
        reason: `Duplicate secret marker token for "${entry.markerId}" in fixture bundle.`,
      }
    }
    seenIds.add(entry.markerId)
    seenTokens.add(entry.token)
    markerMap.set(entry.markerId, entry.token)
  }

  for (const required of AUDIT_FIXTURE_MARKERS) {
    const actualToken = markerMap.get(required.markerId)
    if (!actualToken) {
      return {
        ok: false,
        reason: `Required secret marker "${required.markerId}" is missing from fixture secretMarkers.`,
      }
    }
    if (actualToken !== required.token) {
      return {
        ok: false,
        reason: `Required secret marker "${required.markerId}" has an unexpected token value.`,
      }
    }

    const expectedDocKeys = REQUIRED_MARKER_INJECTION_DOCS[required.markerId] ?? []
    for (const docKey of expectedDocKeys) {
      const serialized = JSON.stringify(record[docKey])
      if (!serialized || !serialized.includes(required.token)) {
        return {
          ok: false,
          reason: `Required secret marker "${required.markerId}" is missing from expected fixture document "${String(docKey)}".`,
        }
      }
    }
  }

  return { ok: true }
}
