// @ts-nocheck -- Sanity exec runs this Node test file; Studio's browser tsconfig has no Node test types.
/**
 * Anthropic Addresses #369 — Studio readiness / Release Gateway parity.
 *
 * Two independent implementations decide whether a month is valid:
 *   - Studio's read-only readiness inspector (`studio/readiness/evaluateReadiness.ts`), which
 *     editors see, and
 *   - the Release Gateway projection (`src/gateway/monthlyProjection.ts`), which decides what
 *     readers get.
 *
 * This test drives both from the SAME Studio documents (the shared R08A fixtures plus targeted
 * edits) and asserts an explicit outcome table. Its purpose is to catch drift:
 *
 *   1. SAFETY (must always hold): if readiness reports `checksPass`, the gateway serves both the
 *      advance preview and the active month. Otherwise an editor sees green while readers get 404.
 *   2. Every variant's outcome pair is listed in EXPECTED below. Where the two disagree, the
 *      difference is named and justified in INTENDED_DIFFERENCES. Any new disagreement, or any
 *      listed one disappearing, fails the test so it gets a deliberate decision.
 *
 * Studio documents reach the gateway through `toDereferencedMonthly*Doc` (the fixture model of
 * the gateway's GROQ dereference) and `gatewayGroqEligible` below (the model of the GROQ
 * filter: published, `editorialStatus == "scheduled"`, `withdrawn != true`, exact `_id`).
 */
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
  ALL_R08A_MONTHLY_DOCUMENTS,
  buildChallengeId,
  buildR08aNegativeVariants,
  toDereferencedMonthlyDetailDoc,
  toDereferencedMonthlyPreviewDoc,
} from '../../src/gateway/fixtures/r08aMonthlyFixtures'
import {
  computeAdvancePreviewStartDate,
  daysInMonth,
  formatCivilDate,
  parseYearMonth,
} from '../../src/gateway/localRelease.ts'
import {
  validateAndProjectMonthDetail,
  validateAndProjectMonthPreview,
} from '../../src/gateway/monthlyProjection.ts'
import {inspectMonthlyReadiness} from '../readiness/fetchReadinessData'
import {createReadOnlyTestClient} from './support/readOnlyReadinessClient'

const YEAR_MONTH = '2098-04'
const MONTH_ID = `month-${YEAR_MONTH}`
const PROJECTION_OPTIONS = {sanityProjectId: '80016lrq', sanityDataset: 'staging'}
const TIME_ZONE = 'America/New_York'

type Docs = Record<string, unknown>[]
/** A fixture document that variants edit in place; its shape is the Studio schema, not a TS type. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditableDoc = Record<string, any>

/** All fixture documents, deep-cloned so a variant can edit freely. */
function baseDocs(): Docs {
  return structuredClone(ALL_R08A_MONTHLY_DOCUMENTS) as Docs
}

function aprilMonth(docs: Docs): EditableDoc {
  return docs.find(d => d._type === 'monthlyPublication' && d.yearMonth === YEAR_MONTH) as EditableDoc
}

function aprilChallenge(docs: Docs, day: number): EditableDoc {
  const id = buildChallengeId(YEAR_MONTH, day)
  return docs.find(d => d._type === 'challenge' && (d._id === id || d._id === `drafts.${id}`)) as EditableDoc
}

/** Model of the gateway GROQ filter on `monthlyPublication` (see src/gateway/query.ts). */
function gatewayGroqEligible(month: EditableDoc | undefined): boolean {
  return Boolean(
    month &&
      month._id === MONTH_ID &&
      month.yearMonth === YEAR_MONTH &&
      month.editorialStatus === 'scheduled' &&
      month.withdrawn !== true,
  )
}

interface GatewayOutcome {
  readonly preview: string // 'ok' or the projection/GROQ rejection reason
  readonly detail: string
}

function gatewayOutcome(docs: Docs): GatewayOutcome {
  const month = aprilMonth(docs)
  if (!gatewayGroqEligible(month)) {
    return {preview: 'notReturnedByGroq', detail: 'notReturnedByGroq'}
  }

  const parsed = parseYearMonth(YEAR_MONTH)!
  const previewDate = computeAdvancePreviewStartDate(parsed.year, parsed.month)
  const firstDay = formatCivilDate(parsed.year, parsed.month, 1)
  const lastDay = formatCivilDate(parsed.year, parsed.month, daysInMonth(parsed.year, parsed.month))
  const ctx = (authorizedLocalDate: string) => ({authorizedLocalDate, effectiveTimeZone: TIME_ZONE})

  const previewDoc = toDereferencedMonthlyPreviewDoc(YEAR_MONTH, docs as never)
  const preview = validateAndProjectMonthPreview(previewDoc, YEAR_MONTH, ctx(previewDate))

  const detailDoc = toDereferencedMonthlyDetailDoc(YEAR_MONTH, docs as never)
  const detailFirst = validateAndProjectMonthDetail(detailDoc, YEAR_MONTH, ctx(firstDay), PROJECTION_OPTIONS)
  const detailLast = validateAndProjectMonthDetail(detailDoc, YEAR_MONTH, ctx(lastDay), PROJECTION_OPTIONS)
  // Validity must not depend on which day of the month a reader asks.
  assert.equal(detailFirst.ok, detailLast.ok, 'gateway month validity must not change within the month')

  return {
    preview: preview.ok ? 'ok' : preview.reason,
    detail: detailFirst.ok ? 'ok' : detailFirst.reason,
  }
}

// ---------------------------------------------------------------------------
// Variants: each is one realistic editorial state of month-2098-04, expressed as Studio
// documents. Keep them small and named for what an editor would have done.
// ---------------------------------------------------------------------------

const VARIANTS: Record<string, (docs: Docs) => void> = {
  'complete scheduled month': () => {},

  'formal rosterVersion 2 slot withdrawal': docs => {
    const v2 = buildR08aNegativeVariants().formalAmendedV2WithdrawalStudio
    const index = docs.findIndex(d => d._id === MONTH_ID)
    docs[index] = structuredClone(v2)
  },

  // --- month-level editorial state
  'month approved but not scheduled': docs => {
    aprilMonth(docs).editorialStatus = 'approved'
  },
  'month still in review': docs => {
    aprilMonth(docs).editorialStatus = 'inReview'
  },
  'month withdrawn': docs => {
    aprilMonth(docs).withdrawn = true
  },
  'month only exists as a draft': docs => {
    aprilMonth(docs)._id = `drafts.${MONTH_ID}`
  },
  'month uses a non-conforming _id': docs => {
    aprilMonth(docs)._id = `${MONTH_ID}-synthetic`
  },
  'month missing editorial review': docs => {
    aprilMonth(docs).editorialReview = {}
  },
  'month reviewer role not allowed': docs => {
    aprilMonth(docs).editorialReview.reviewerRole = 'self_approved'
  },
  'month missing title': docs => {
    aprilMonth(docs).title = ''
  },

  // --- introduction
  'no advance preview screens': docs => {
    aprilMonth(docs).introduction.previewScreens = []
  },
  'no welcome screen': docs => {
    delete aprilMonth(docs).introduction.welcomeScreen
  },

  // --- calendar
  'slot date misaligned with its day': docs => {
    aprilMonth(docs).slots[7].date = '2098-04-09'
  },
  'slot left unassigned': docs => {
    delete aprilMonth(docs).slots[9].challenge
  },
  'one slot missing from the calendar': docs => {
    aprilMonth(docs).slots.pop()
  },
  'same Challenge in two slots of the month': docs => {
    const month = aprilMonth(docs)
    month.slots[1].challenge = structuredClone(month.slots[0].challenge)
  },
  'Challenge also scheduled in another published month': docs => {
    const march = docs.find(d => d._id === 'month-2098-03') as EditableDoc
    march.slots[0].challenge = {_type: 'reference', _ref: buildChallengeId(YEAR_MONTH, 4), _weak: true}
  },

  // --- roster finalization
  'roster not finalized': docs => {
    aprilMonth(docs).rosterFinalization.isFinalized = false
  },
  'finalized roster differs from scheduled slots': docs => {
    const rf = aprilMonth(docs).rosterFinalization
    rf.finalizedChallengeIds = rf.finalizedChallengeIds.slice(1)
  },

  // --- Challenges in slots
  'Challenge adaptation not reviewed': docs => {
    aprilChallenge(docs, 6).editorialReview.adaptationReviewed = false
  },
  'Challenge has an unapproved structured block': docs => {
    const ch = aprilChallenge(docs, 6)
    ch.screens[0].blocks.push({_key: 'cmp-unapproved', _type: 'comparisonBlock', reviewStatus: 'proposed'})
  },
  'Challenge quotes Scripture without confirmed rights': docs => {
    aprilChallenge(docs, 7).primaryScripture = {
      _type: 'scriptureReference',
      reference: 'Psalm 23:1-6',
      translation: 'ESV',
      textStatus: 'provided',
      passage: 'Synthetic unlicensed passage text.',
      usageRightsConfirmed: false,
      practiceStatus: 'notConfigured',
    }
  },
  'Challenge only exists as a draft': docs => {
    const ch = aprilChallenge(docs, 5)
    ch._id = `drafts.${ch._id}`
  },
  'Challenge emergency-withdrawn (immediate, roster unchanged)': docs => {
    aprilChallenge(docs, 18).withdrawn = true
  },
  'Challenge missing title': docs => {
    aprilChallenge(docs, 3).title = ''
  },
  'Challenge missing slug': docs => {
    aprilChallenge(docs, 3).slug = {_type: 'slug', current: ''}
  },
  'Challenge has an unsupported challengeType': docs => {
    aprilChallenge(docs, 3).challengeType = 'devotional'
  },

  // --- discoveries and Cards
  'discovery qualifies a Challenge outside the month': docs => {
    aprilMonth(docs).discoveries[0].qualifyingChallenges.push({
      _type: 'reference',
      _ref: buildChallengeId('2098-03', 1),
      _weak: true,
    })
  },

  // --- preview News
  'preview News article missing': docs => {
    const index = docs.findIndex(d => d._id === `news-preview-${YEAR_MONTH}`)
    docs.splice(index, 1)
  },
}

// ---------------------------------------------------------------------------
// Expected outcome table. `readiness` is the inspector's overallStatus; `preview` and `detail`
// are the gateway results: 'ok', the projection's ValidationFailureReason, or
// 'notReturnedByGroq' when the gateway's query filter never returns the month.
// ---------------------------------------------------------------------------

const EXPECTED: Record<string, {readiness: string; preview: string; detail: string}> = {
  'complete scheduled month': {readiness: 'checksPass', preview: 'ok', detail: 'ok'},
  'formal rosterVersion 2 slot withdrawal': {readiness: 'checksPass', preview: 'ok', detail: 'ok'},

  'month approved but not scheduled': {readiness: 'checksPass', preview: 'notReturnedByGroq', detail: 'notReturnedByGroq'},
  'month still in review': {readiness: 'needsReview', preview: 'notReturnedByGroq', detail: 'notReturnedByGroq'},
  'month withdrawn': {readiness: 'blocked', preview: 'notReturnedByGroq', detail: 'notReturnedByGroq'},
  'month only exists as a draft': {readiness: 'blocked', preview: 'notReturnedByGroq', detail: 'notReturnedByGroq'},
  'month uses a non-conforming _id': {readiness: 'blocked', preview: 'notReturnedByGroq', detail: 'notReturnedByGroq'},
  'month missing editorial review': {readiness: 'blocked', preview: 'unreviewed', detail: 'unreviewed'},
  'month reviewer role not allowed': {readiness: 'blocked', preview: 'unreviewed', detail: 'unreviewed'},
  'month missing title': {readiness: 'blocked', preview: 'malformedDocument', detail: 'malformedDocument'},

  'no advance preview screens': {readiness: 'blocked', preview: 'malformedDocument', detail: 'malformedDocument'},
  'no welcome screen': {readiness: 'blocked', preview: 'ok', detail: 'malformedDocument'},

  'slot date misaligned with its day': {readiness: 'blocked', preview: 'invalidCalendarAssignment', detail: 'invalidCalendarAssignment'},
  'slot left unassigned': {readiness: 'blocked', preview: 'invalidCalendarAssignment', detail: 'invalidCalendarAssignment'},
  'one slot missing from the calendar': {readiness: 'blocked', preview: 'invalidCalendarAssignment', detail: 'invalidCalendarAssignment'},
  'same Challenge in two slots of the month': {readiness: 'blocked', preview: 'duplicateSlotAssignment', detail: 'duplicateSlotAssignment'},
  'Challenge also scheduled in another published month': {readiness: 'blocked', preview: 'duplicateSlotAssignment', detail: 'duplicateSlotAssignment'},

  'roster not finalized': {readiness: 'blocked', preview: 'invalidCalendarAssignment', detail: 'invalidCalendarAssignment'},
  'finalized roster differs from scheduled slots': {readiness: 'blocked', preview: 'invalidCalendarAssignment', detail: 'invalidCalendarAssignment'},

  'Challenge adaptation not reviewed': {readiness: 'blocked', preview: 'unreviewed', detail: 'unreviewed'},
  'Challenge has an unapproved structured block': {readiness: 'blocked', preview: 'unapprovedBlocks', detail: 'unapprovedBlocks'},
  'Challenge quotes Scripture without confirmed rights': {readiness: 'blocked', preview: 'unlicensedScripture', detail: 'unlicensedScripture'},
  'Challenge only exists as a draft': {readiness: 'blocked', preview: 'invalidCalendarAssignment', detail: 'invalidCalendarAssignment'},
  'Challenge emergency-withdrawn (immediate, roster unchanged)': {readiness: 'blocked', preview: 'ok', detail: 'ok'},
  'Challenge missing title': {readiness: 'blocked', preview: 'malformedDocument', detail: 'malformedDocument'},
  'Challenge missing slug': {readiness: 'blocked', preview: 'ok', detail: 'malformedDocument'},
  'Challenge has an unsupported challengeType': {readiness: 'blocked', preview: 'ok', detail: 'malformedDocument'},

  'discovery qualifies a Challenge outside the month': {readiness: 'blocked', preview: 'ok', detail: 'invalidCalendarAssignment'},

  'preview News article missing': {readiness: 'blocked', preview: 'ok', detail: 'ok'},
}

/**
 * The only variants where "readiness reports checksPass" and "the gateway serves both the
 * preview and the month" disagree, each with the reason it is intended. Anything not listed
 * here must agree.
 */
const INTENDED_DIFFERENCES: Record<string, string> = {
  'month approved but not scheduled':
    'Readiness checks content, not the publish switch: an "approved" month that passes every check ' +
    'reports checksPass with an informational "ready to set scheduled" finding, while the gateway ' +
    'only serves editorialStatus "scheduled". This is the one difference where Studio is more ' +
    'lenient than the gateway; it is safe only because the finding tells the editor the month is ' +
    'not yet scheduled (asserted below). Owner accepted on 2026-11-28 (PR #374): this is readiness to ' +
    'schedule, not reader availability, so it stays checksPass.',
  'Challenge emergency-withdrawn (immediate, roster unchanged)':
    'Gateway Option 4A: an emergency-withdrawn Challenge is suppressed immediately and the month ' +
    'stays live with that day unavailable. Readiness still blocks so the editor completes the formal ' +
    'rosterVersion 2 amendment. Studio is stricter.',
  'preview News article missing':
    'The preview News article is a separate News surface; month preview and detail routes do not ' +
    'depend on it. Readiness blocks because the monthly launch package is incomplete. Studio is stricter.',
}

interface Row {
  label: string
  readiness: string
  preview: string
  detail: string
  monthEditorialStatus: unknown
  findings: Array<{severity: string; path?: string; message: string}>
}

async function evaluateAll(): Promise<Row[]> {
  const rows: Row[] = []
  for (const [label, apply] of Object.entries(VARIANTS)) {
    const docs = baseDocs()
    apply(docs)
    const gateway = gatewayOutcome(docs)
    const {client} = createReadOnlyTestClient({
      months: docs.filter(d => d._type === 'monthlyPublication'),
      challenges: docs.filter(d => d._type === 'challenge'),
      cards: docs.filter(d => d._type === 'scriptureCard'),
      news: docs.filter(d => d._type === 'newsArticle'),
    })
    const report = await inspectMonthlyReadiness({
      client,
      dataset: 'staging',
      yearMonth: YEAR_MONTH,
      evaluatedAtIso: '2098-03-01T00:00:00.000Z',
    })
    rows.push({
      label,
      readiness: report.overallStatus,
      ...gateway,
      monthEditorialStatus: aprilMonth(docs)?.editorialStatus,
      findings: report.findings,
    })
  }
  return rows
}

const gatewayServes = (row: Pick<Row, 'preview' | 'detail'>) => row.preview === 'ok' && row.detail === 'ok'

test('every variant matches the recorded readiness/gateway outcome table', async () => {
  const rows = await evaluateAll()
  assert.deepEqual(Object.keys(EXPECTED).sort(), Object.keys(VARIANTS).sort(), 'EXPECTED must list every variant')
  for (const row of rows) {
    assert.deepEqual(
      {readiness: row.readiness, preview: row.preview, detail: row.detail},
      EXPECTED[row.label],
      `outcome changed for "${row.label}"; decide whether Studio or the gateway drifted`,
    )
  }
})

test('readiness checksPass agrees with gateway acceptance except for the listed intended differences', async () => {
  const rows = await evaluateAll()
  const disagreements = rows
    .filter(row => (row.readiness === 'checksPass') !== gatewayServes(row))
    .map(row => row.label)
    .sort()
  assert.deepEqual(
    disagreements,
    Object.keys(INTENDED_DIFFERENCES).sort(),
    'a readiness/gateway disagreement was added or removed; update INTENDED_DIFFERENCES with a reason, or fix the drift',
  )
})

test('SAFETY: a scheduled month that readiness reports as checksPass is always served by the gateway', async () => {
  const rows = await evaluateAll()
  for (const row of rows) {
    if (row.readiness === 'checksPass' && row.monthEditorialStatus === 'scheduled') {
      assert.ok(
        gatewayServes(row),
        `"${row.label}": editors see checksPass but readers get preview=${row.preview}, detail=${row.detail}`,
      )
    }
  }
})

test('every gateway projection rejection of a scheduled month is blocking in readiness', async () => {
  const rows = await evaluateAll()
  for (const row of rows) {
    if (row.monthEditorialStatus !== 'scheduled') continue
    if (row.preview !== 'ok' || row.detail !== 'ok') {
      assert.equal(
        row.readiness,
        'blocked',
        `"${row.label}": gateway rejects (preview=${row.preview}, detail=${row.detail}) but readiness is ${row.readiness}`,
      )
    }
  }
})

test('the lenient "approved but not scheduled" difference is visible to the editor', async () => {
  const row = (await evaluateAll()).find(r => r.label === 'month approved but not scheduled')!
  assert.equal(row.readiness, 'checksPass')
  assert.ok(
    row.findings.some(
      f => f.path === 'editorialStatus' && f.severity === 'informational' && /set "scheduled"/.test(f.message),
    ),
    'readiness must tell the editor an approved month is not yet scheduled',
  )
})
