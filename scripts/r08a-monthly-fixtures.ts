#!/usr/bin/env node
/**
 * Bounded Offline Generator, Validator, and Read-Only Sanity Probe for R08A-4A.
 *
 * SAFETY INVARIANTS:
 * 1. DRY-RUN / ZERO-WRITE ONLY: No write path exists in this tool. Explicitly rejects
 *    `--apply`, `--teardown`, `--delete`, `--write`, `--mutate`, or unknown flags.
 * 2. ZERO AUTO-NETWORK: Ordinary invocation performs zero network calls. Live read-only
 *    checks require explicit `--check-live-groq` or `--preflight` opt-in flags.
 * 3. STRICT TARGET PINNING: Hard-coded to project `80016lrq` and dataset `staging`.
 *    Immediately refuses `production` or any other project/dataset.
 * 4. CREDENTIAL ISOLATION: Live read-only checks read `SANITY_READ_TOKEN` exclusively
 *    from local environment variables. Never accepts tokens via CLI args, never prints
 *    or echoes tokens, and never includes tokens in URLs or reports.
 * 5. READ-ONLY GET ONLY: Live probes perform HTTP GET requests only (`perspective=published`
 *    for GROQ semantics check; `perspective=raw` for preflight collision report).
 */

import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import {
  ALL_R08A_INTENDED_DOCUMENT_IDS,
  ALL_R08A_INTENDED_SLUGS,
  ALL_R08A_MONTHLY_DOCUMENTS,
  R08A_MONTH_SPECS,
  R08A_MONTHLY_CHALLENGE_DOCUMENTS,
  R08A_MONTHLY_NEWS_DOCUMENTS,
  R08A_MONTHLY_PUBLICATION_DOCUMENTS,
  buildChallengeId,
  buildR08aNegativeVariants,
  toDereferencedMonthlyDetailDoc,
  toDereferencedMonthlyPreviewDoc,
  toDereferencedNewsArticleDoc,
  toDereferencedSlottedChallengeDoc,
} from '../src/gateway/fixtures/r08aMonthlyFixtures.ts'
import {
  CATALOG_GROQ_QUERY,
  CHALLENGE_BY_SLUG_GROQ_QUERY,
  DEFAULT_SANITY_API_VERSION,
  MONTHLY_DETAIL_BY_ID_GROQ_QUERY,
  MONTHLY_PREVIEW_BY_ID_GROQ_QUERY,
  NEWS_ARTICLES_GROQ_QUERY,
  buildSanityQueryUrl,
} from '../src/gateway/query.ts'
import {
  evaluateMonthProgress,
  validateAndProjectMonthDetail,
  validateAndProjectMonthPreview,
  validateAndProjectNewsArticle,
} from '../src/gateway/monthlyProjection.ts'
import {
  validateAndProjectCatalogSummary,
  validateAndProjectChallenge,
} from '../src/gateway/projection.ts'
import type { GatewayServerContext } from '../src/gateway/types.ts'

export const EXPECTED_PROJECT_ID = '80016lrq'
export const EXPECTED_DATASET = 'staging'
export const SANITY_API_VERSION = DEFAULT_SANITY_API_VERSION
export const R08A_MANIFEST_VERSION = 'r08a-4a-v1'

const FORBIDDEN_WRITE_FLAGS = new Set([
  '--apply',
  '--teardown',
  '--delete',
  '--write',
  '--mutate',
  '--create',
  '--update',
  '--patch',
  '--deploy',
])

export interface TargetValidationResult {
  readonly valid: boolean
  readonly error?: string
}

export function validateR08aStagingTarget(env: {
  readonly SANITY_PROJECT_ID?: string
  readonly SANITY_DATASET?: string
}): TargetValidationResult {
  const projectId = env.SANITY_PROJECT_ID ?? EXPECTED_PROJECT_ID
  const dataset = env.SANITY_DATASET ?? EXPECTED_DATASET

  if (projectId !== EXPECTED_PROJECT_ID) {
    return {
      valid: false,
      error: `Prohibited project ID '${projectId}'. R08A-4A tooling is strictly restricted to '${EXPECTED_PROJECT_ID}'.`,
    }
  }

  if (dataset !== EXPECTED_DATASET) {
    return {
      valid: false,
      error: `Prohibited dataset '${dataset}'. R08A-4A tooling is strictly restricted to '${EXPECTED_DATASET}'. Never target production.`,
    }
  }

  return { valid: true }
}

export interface ParsedCliArgs {
  readonly help: boolean
  readonly json: boolean
  readonly checkLiveGroq: boolean
  readonly preflight: boolean
  readonly securityViolation?: string
}

export function parseR08aCliArgs(args: readonly string[]): ParsedCliArgs {
  let help = false
  let json = false
  let checkLiveGroq = false
  let preflight = false

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg === '--json') {
      json = true
    } else if (arg === '--check-live-groq') {
      checkLiveGroq = true
    } else if (arg === '--preflight') {
      preflight = true
    } else if (FORBIDDEN_WRITE_FLAGS.has(arg)) {
      return {
        help: false,
        json: false,
        checkLiveGroq: false,
        preflight: false,
        securityViolation: `Write/mutation flag '${arg}' is explicitly prohibited in R08A-4A. This tool is strictly read-only and dry-run-only.`,
      }
    } else if (
      arg.startsWith('--token') ||
      arg.startsWith('-t=') ||
      arg.startsWith('--auth') ||
      arg.startsWith('--key') ||
      arg.includes('sk_') ||
      arg.length > 50
    ) {
      return {
        help: false,
        json: false,
        checkLiveGroq: false,
        preflight: false,
        securityViolation:
          'Security error: Do not supply tokens via CLI arguments. Set read-only SANITY_READ_TOKEN in your local protected shell environment.',
      }
    } else {
      return {
        help: false,
        json: false,
        checkLiveGroq: false,
        preflight: false,
        securityViolation: `Unsupported or unknown CLI argument '${arg}'. Allowed flags: --help, --json, --check-live-groq, --preflight.`,
      }
    }
  }

  return { help, json, checkLiveGroq, preflight }
}

export function computeR08aManifestChecksum(): string {
  const canonicalJson = JSON.stringify(ALL_R08A_MONTHLY_DOCUMENTS)
  return createHash('sha256').update(canonicalJson).digest('hex')
}

export interface OfflineGatewayValidationSummary {
  readonly passed: boolean
  readonly checksRun: number
  readonly errors: readonly string[]
}

function makeServerContext(authorizedLocalDate: string, timeZone = 'America/New_York'): GatewayServerContext {
  return {
    authorizedLocalDate,
    effectiveTimeZone: timeZone,
    usedDefaultTimeZoneFallback: false,
  }
}

export function runOfflineGatewayContractValidation(): OfflineGatewayValidationSummary {
  const errors: string[] = []
  let checksRun = 0

  const check = (condition: boolean, message: string) => {
    checksRun += 1
    if (!condition) {
      errors.push(message)
    }
  }

  // 1. Canonical 4 months: preview boundary, active/historical detail, progress, News, and slotted Challenge
  for (const spec of R08A_MONTH_SPECS) {
    const previewDoc = toDereferencedMonthlyPreviewDoc(spec.yearMonth)
    const detailDoc = toDereferencedMonthlyDetailDoc(spec.yearMonth)
    check(previewDoc !== null && detailDoc !== null, `Missing dereferenced doc for ${spec.yearMonth}`)
    if (!previewDoc || !detailDoc) continue

    // Before preview start -> embargoed
    const dayBeforePreview = new Date(`${spec.previewStartDate}T00:00:00Z`)
    dayBeforePreview.setUTCDate(dayBeforePreview.getUTCDate() - 1)
    const beforePreviewStr = dayBeforePreview.toISOString().slice(0, 10)
    const beforePreviewRes = validateAndProjectMonthPreview(
      previewDoc,
      spec.yearMonth,
      makeServerContext(beforePreviewStr),
    )
    check(!beforePreviewRes.ok && beforePreviewRes.reason === 'embargoed', `${spec.yearMonth} preview must fail closed on ${beforePreviewStr}`)

    // At preview start -> 200 with exact slot length, all comingSoon, no welcomeScreen/discoveries/slugs
    const atPreviewRes = validateAndProjectMonthPreview(
      previewDoc,
      spec.yearMonth,
      makeServerContext(spec.previewStartDate),
    )
    check(atPreviewRes.ok, `${spec.yearMonth} preview failed at ${spec.previewStartDate}`)
    if (atPreviewRes.ok) {
      check(atPreviewRes.document.month.daysInMonth === spec.expectedDays, `${spec.yearMonth} daysInMonth mismatch`)
      check(atPreviewRes.document.month.slots.length === spec.expectedDays, `${spec.yearMonth} preview slot count mismatch`)
      check(
        atPreviewRes.document.month.slots.every(s => s.availability === 'comingSoon' && !('slug' in s)),
        `${spec.yearMonth} preview slots must all be comingSoon without slugs`,
      )
    }

    // Day 1 of month -> active phase, Day 1 available, Day 2..N comingSoon, zero qualifyingChallengeIds leaked
    const monthStart = `${spec.yearMonth}-01`
    const atStartRes = validateAndProjectMonthDetail(
      detailDoc,
      spec.yearMonth,
      makeServerContext(monthStart),
    )
    check(atStartRes.ok, `${spec.yearMonth} detail failed at ${monthStart}`)
    if (atStartRes.ok) {
      check(atStartRes.document.month.phase === 'active', `${spec.yearMonth} phase should be active at ${monthStart}`)
      check(atStartRes.document.month.totalChallenges === spec.expectedDays, `${spec.yearMonth} active total mismatch`)
      check(atStartRes.document.month.slots[0].availability === 'available', `${spec.yearMonth} day 1 should be available`)
      check(
        atStartRes.document.month.slots.slice(1).every(s => s.availability === 'comingSoon' && !s.slug && !s.challengeId),
        `${spec.yearMonth} future slots must not leak slug or challengeId`,
      )
      const serialized = JSON.stringify(atStartRes.document)
      check(!serialized.includes('qualifyingChallenge'), `${spec.yearMonth} leaked qualifyingChallenges`)
      check(!serialized.includes('SIMULATED SYNTHETIC ELIGIBILITY'), `${spec.yearMonth} leaked reviewNotes`)
    }

    // Historical month access (1 month after) + 100% progress
    const historicalYear = spec.month === 12 ? spec.year + 1 : spec.year
    const historicalMonth = spec.month === 12 ? 1 : spec.month + 1
    const historicalDate = `${historicalYear}-${String(historicalMonth).padStart(2, '0')}-05`
    const historicalRes = validateAndProjectMonthDetail(
      detailDoc,
      spec.yearMonth,
      makeServerContext(historicalDate),
    )
    check(historicalRes.ok && historicalRes.document.month.phase === 'historical', `${spec.yearMonth} historical phase failed`)

    const allCanonicalIds = Array.from({ length: spec.expectedDays }, (_, i) => `cms:${buildChallengeId(spec.yearMonth, i + 1)}`)
    const progressRes = evaluateMonthProgress(
      detailDoc,
      spec.yearMonth,
      makeServerContext(historicalDate),
      allCanonicalIds,
    )
    check(
      progressRes.ok &&
        progressRes.document.completedInMonthCount === spec.expectedDays &&
        progressRes.document.discoveries.every(d => d.isEarned),
      `${spec.yearMonth} full historical progress check failed`,
    )

    // Slotted Challenge Day 1 projection omits releaseAt and includes calendarSlot
    const day1Id = buildChallengeId(spec.yearMonth, 1)
    const slottedChallengeDoc = toDereferencedSlottedChallengeDoc(day1Id)
    check(slottedChallengeDoc !== null, `Missing slotted Challenge doc for ${day1Id}`)
    if (slottedChallengeDoc) {
      const chDetail = validateAndProjectChallenge(slottedChallengeDoc, new Date(`${monthStart}T12:00:00Z`), monthStart)
      const chSummary = validateAndProjectCatalogSummary(slottedChallengeDoc, new Date(`${monthStart}T12:00:00Z`), monthStart)
      check(chDetail.ok && chDetail.document.releaseAt === undefined && chDetail.document.calendarSlot?.publicationDate === monthStart, `${day1Id} detail projection failed`)
      check(chSummary.ok && chSummary.document.releaseAt === undefined && chSummary.document.calendarSlot?.dayOfMonth === 1, `${day1Id} summary projection failed`)
    }
  }

  // 2. Preview News and general News allowlist checks
  for (const newsDoc of R08A_MONTHLY_NEWS_DOCUMENTS) {
    const deref = toDereferencedNewsArticleDoc(newsDoc)
    if (newsDoc.category === 'monthlyPreview') {
      const spec = R08A_MONTH_SPECS.find(s => `news-preview-${s.yearMonth}` === newsDoc._id)
      check(spec !== undefined, `Missing month spec for ${newsDoc._id}`)
      if (!spec) continue
      const res = validateAndProjectNewsArticle(deref, spec.previewStartDate, 'monthlyPreview')
      check(res.ok, `Preview news ${newsDoc._id} failed at ${spec.previewStartDate}`)
      if (res.ok) {
        check(!('body' in res.document) && !('coverImage' in res.document), `${newsDoc._id} must stay minimal`)
        check(res.document.destination?.monthId === spec.yearMonth, `${newsDoc._id} destination mismatch`)
      }
    } else {
      const res = validateAndProjectNewsArticle(deref, '2098-02-27')
      check(res.ok && Array.isArray(res.document.body), `${newsDoc._id} general news failed`)
    }
  }

  // 3. Negative & emergency withdrawal variants
  const variants = buildR08aNegativeVariants()
  const aprContext = makeServerContext('2098-04-20')
  const negativePairs: Array<[string, Record<string, unknown>, string]> = [
    ['duplicateIntraMonthSlot', variants.duplicateIntraMonthSlotGateway, 'duplicateSlotAssignment'],
    ['foreignMonthSlotRef', variants.foreignMonthSlotRefGateway, 'duplicateSlotAssignment'],
    ['draftChallengeRef', variants.draftChallengeRefGateway, 'draftDocument'],
    ['unreviewedChallenge', variants.unreviewedChallengeGateway, 'unreviewed'],
    ['unlicensedScriptureChallenge', variants.unlicensedScriptureChallengeGateway, 'unlicensedScripture'],
    ['invalidSlotDate', variants.invalidSlotDateGateway, 'invalidCalendarAssignment'],
  ]
  for (const [label, variantDoc, expectedReason] of negativePairs) {
    const res = validateAndProjectMonthDetail(variantDoc, '2098-04', aprContext)
    check(!res.ok && res.reason === expectedReason, `Negative variant ${label} expected ${expectedReason}`)
  }

  // Immediate live withdrawal & retracted withdrawal both keep month 200 with 29/29 active total
  for (const [label, wDoc] of [
    ['immediateWithdrawalLive', variants.immediateWithdrawalLiveGateway],
    ['retractedWithdrawnChallenge', variants.retractedWithdrawnChallengeGateway],
    ['formalAmendedV2Withdrawal', variants.formalAmendedV2WithdrawalGateway],
  ] as const) {
    const detail = validateAndProjectMonthDetail(wDoc, '2098-04', aprContext)
    check(detail.ok, `${label} month detail should succeed`)
    if (detail.ok) {
      check(detail.document.month.totalChallenges === 29, `${label} totalChallenges expected 29`)
      check(detail.document.month.slots[17].availability === 'unavailable', `${label} day 18 must be unavailable`)
      check(!JSON.stringify(detail.document).includes('SECRET_'), `${label} leaked secret text`)
    }
    const activeIds = Array.from({ length: 30 }, (_, i) => i + 1)
      .filter(d => d !== 18)
      .map(d => `cms:${buildChallengeId('2098-04', d)}`)
    const prog = evaluateMonthProgress(wDoc, '2098-04', makeServerContext('2098-05-02'), [
      ...activeIds,
      `cms:${buildChallengeId('2098-04', 18)}`,
    ])
    check(
      prog.ok &&
        prog.document.completedInMonthCount === 29 &&
        prog.document.totalChallenges === 29 &&
        prog.document.discoveries.every(d => d.isEarned),
      `${label} 29/29 progress math failed`,
    )
  }

  return {
    passed: errors.length === 0,
    checksRun,
    errors,
  }
}

// ---------------------------------------------------------------------------
// Read-Only Live GROQ Probe (perspective=published, GET only)
// ---------------------------------------------------------------------------

export interface GroqProbeQueryResult {
  readonly queryName: string
  readonly httpStatus: number | null
  readonly syntaxAndConnectivity: 'PASS' | 'FAIL' | 'NOT_RUN'
  readonly semanticsStatus: 'PASS' | 'INCONCLUSIVE/NOT YET EXERCISED' | 'FAIL' | 'NOT_RUN'
  readonly resultKind: 'null' | 'empty_array' | 'populated' | 'error' | 'not_run'
  readonly note: string
}

export interface LiveGroqProbeReport {
  readonly status: 'PASS' | 'INCONCLUSIVE' | 'FAIL' | 'NOT_RUN'
  readonly projectId: string
  readonly dataset: string
  readonly perspective: 'published'
  readonly readOnlyMethod: 'GET'
  readonly queries: readonly GroqProbeQueryResult[]
  readonly summaryNote: string
}

function validatePopulatedProbeSemantics(
  queryName: string,
  result: unknown,
): { ok: boolean; note: string } {
  if (queryName === 'MONTHLY_PREVIEW_BY_ID_GROQ_QUERY') {
    const obj = result as Record<string, unknown>
    const slots = Array.isArray(obj.slots) ? obj.slots : []
    const firstChallenge = (slots[0] as Record<string, unknown> | undefined)?.challenge as
      | Record<string, unknown>
      | undefined
    const assigned = firstChallenge?.assignedMonthIds
    if (!Array.isArray(assigned) || !assigned.includes('month-2098-03')) {
      return {
        ok: false,
        note: 'Dereferenced slots[].challenge->.assignedMonthIds did not contain "month-2098-03".',
      }
    }
    const projected = validateAndProjectMonthPreview(result, '2098-03', makeServerContext('2098-02-27'))
    return projected.ok
      ? { ok: true, note: 'Dereferenced slots[].challenge-> and assignedMonthIds returned expected parent ID and passed preview projection.' }
      : { ok: false, note: `Preview projection failed: ${projected.reason}` }
  }

  if (queryName === 'MONTHLY_DETAIL_BY_ID_GROQ_QUERY') {
    const obj = result as Record<string, unknown>
    const slots = Array.isArray(obj.slots) ? obj.slots : []
    const firstChallenge = (slots[0] as Record<string, unknown> | undefined)?.challenge as
      | Record<string, unknown>
      | undefined
    const assigned = firstChallenge?.assignedMonthIds
    if (!Array.isArray(assigned) || !assigned.includes('month-2098-04')) {
      return {
        ok: false,
        note: 'Dereferenced slots[].challenge->.assignedMonthIds did not contain "month-2098-04".',
      }
    }
    const projected = validateAndProjectMonthDetail(result, '2098-04', makeServerContext('2098-04-15'))
    return projected.ok
      ? { ok: true, note: 'Dereferenced slots[].challenge-> and assignedMonthIds returned expected parent ID and passed detail projection.' }
      : { ok: false, note: `Detail projection failed: ${projected.reason}` }
  }

  if (queryName === 'NEWS_ARTICLES_GROQ_QUERY') {
    const arr = Array.isArray(result) ? result : []
    const previewDoc = arr.find(item => (item as Record<string, unknown>)?._id === 'news-preview-2098-03')
    if (!previewDoc) {
      return { ok: false, note: 'NEWS_ARTICLES_GROQ_QUERY did not return news-preview-2098-03.' }
    }
    const projected = validateAndProjectNewsArticle(previewDoc, '2098-02-27', 'monthlyPreview')
    return projected.ok
      ? { ok: true, note: 'News relatedMonth-> dereference passed minimal monthlyPreview projection.' }
      : { ok: false, note: `News projection failed: ${projected.reason}` }
  }

  if (queryName === 'CATALOG_GROQ_QUERY') {
    const arr = Array.isArray(result) ? result : []
    const day1 = arr.find(item => (item as Record<string, unknown>)?._id === 'r08a-stg-2098-04-day-01')
    if (!day1) {
      return { ok: false, note: 'CATALOG_GROQ_QUERY did not return released r08a-stg-2098-04-day-01 (^.^._id dual-path check).' }
    }
    const projected = validateAndProjectCatalogSummary(day1, new Date('2098-04-15T12:00:00Z'), '2098-04-15')
    return projected.ok
      ? { ok: true, note: 'CATALOG_GROQ_QUERY ^.^._id dual-path filter and monthlyAssignments passed summary projection.' }
      : { ok: false, note: `Catalog summary projection failed: ${projected.reason}` }
  }

  if (queryName === 'CHALLENGE_BY_SLUG_GROQ_QUERY') {
    const projected = validateAndProjectChallenge(result, new Date('2098-04-15T12:00:00Z'), '2098-04-15')
    return projected.ok
      ? { ok: true, note: 'CHALLENGE_BY_SLUG_GROQ_QUERY ^.^._id dual-path filter and monthlyAssignments passed detail projection.' }
      : { ok: false, note: `Challenge detail projection failed: ${projected.reason}` }
  }

  return { ok: false, note: 'Unknown probe query.' }
}

export async function runLiveGroqProbe(options: {
  readonly env?: Record<string, string | undefined>
  readonly fetchImpl?: typeof fetch
}): Promise<LiveGroqProbeReport> {
  const env = options.env ?? process.env
  const token = env.SANITY_READ_TOKEN?.trim()
  if (!token) {
    return {
      status: 'NOT_RUN',
      projectId: EXPECTED_PROJECT_ID,
      dataset: EXPECTED_DATASET,
      perspective: 'published',
      readOnlyMethod: 'GET',
      queries: [],
      summaryNote: 'NOT RUN: SANITY_READ_TOKEN is not set in the local environment.',
    }
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const probeSpecs: Array<{
    readonly queryName: string
    readonly query: string
    readonly params: Record<string, string>
  }> = [
    {
      queryName: 'MONTHLY_PREVIEW_BY_ID_GROQ_QUERY',
      query: MONTHLY_PREVIEW_BY_ID_GROQ_QUERY,
      params: { $monthDocId: 'month-2098-03', $yearMonth: '2098-03' },
    },
    {
      queryName: 'MONTHLY_DETAIL_BY_ID_GROQ_QUERY',
      query: MONTHLY_DETAIL_BY_ID_GROQ_QUERY,
      params: { $monthDocId: 'month-2098-04', $yearMonth: '2098-04' },
    },
    {
      queryName: 'NEWS_ARTICLES_GROQ_QUERY',
      query: NEWS_ARTICLES_GROQ_QUERY,
      params: { $authorizedLocalDate: '2098-02-27', $category: 'monthlyPreview' },
    },
    {
      queryName: 'CATALOG_GROQ_QUERY',
      query: CATALOG_GROQ_QUERY,
      params: { $nowUtc: '2098-04-15T12:00:00.000Z', $authorizedLocalDate: '2098-04-15' },
    },
    {
      queryName: 'CHALLENGE_BY_SLUG_GROQ_QUERY',
      query: CHALLENGE_BY_SLUG_GROQ_QUERY,
      params: {
        $slug: 'r08a-stg-2098-04-day-01',
        $nowUtc: '2098-04-15T12:00:00.000Z',
        $authorizedLocalDate: '2098-04-15',
      },
    },
  ]

  const queries: GroqProbeQueryResult[] = []

  for (const spec of probeSpecs) {
    const url = buildSanityQueryUrl(
      EXPECTED_PROJECT_ID,
      EXPECTED_DATASET,
      SANITY_API_VERSION,
      spec.query,
      spec.params,
    )
    try {
      const response = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        queries.push({
          queryName: spec.queryName,
          httpStatus: response.status,
          syntaxAndConnectivity: 'FAIL',
          semanticsStatus: 'FAIL',
          resultKind: 'error',
          note: `Upstream Sanity returned HTTP ${response.status} (response body suppressed for privacy).`,
        })
        continue
      }

      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        queries.push({
          queryName: spec.queryName,
          httpStatus: response.status,
          syntaxAndConnectivity: 'FAIL',
          semanticsStatus: 'FAIL',
          resultKind: 'error',
          note: 'Upstream Sanity returned invalid JSON.',
        })
        continue
      }

      if (!payload || typeof payload !== 'object' || !('result' in payload)) {
        queries.push({
          queryName: spec.queryName,
          httpStatus: response.status,
          syntaxAndConnectivity: 'FAIL',
          semanticsStatus: 'FAIL',
          resultKind: 'error',
          note: 'Upstream Sanity JSON response missing result property.',
        })
        continue
      }

      const result = (payload as { result: unknown }).result
      if (result === null) {
        queries.push({
          queryName: spec.queryName,
          httpStatus: response.status,
          syntaxAndConnectivity: 'PASS',
          semanticsStatus: 'INCONCLUSIVE/NOT YET EXERCISED',
          resultKind: 'null',
          note: 'Query parsed and executed (null result because synthetic R08A monthly documents are absent). Dereference/ancestor ^.^._id semantics and live gating remain NOT YET EXERCISED.',
        })
        continue
      }

      if (Array.isArray(result) && result.length === 0) {
        queries.push({
          queryName: spec.queryName,
          httpStatus: response.status,
          syntaxAndConnectivity: 'PASS',
          semanticsStatus: 'INCONCLUSIVE/NOT YET EXERCISED',
          resultKind: 'empty_array',
          note: 'Query parsed and executed (empty array because synthetic R08A monthly documents are absent). Dereference/ancestor ^.^._id semantics and live gating remain NOT YET EXERCISED.',
        })
        continue
      }

      // For array queries like CATALOG_GROQ_QUERY / NEWS_ARTICLES_GROQ_QUERY, check if R08A docs exist
      if (Array.isArray(result)) {
        const hasR08a = result.some(item => {
          const id = (item as Record<string, unknown> | null)?._id
          return typeof id === 'string' && (id.startsWith('r08a-stg-') || id.startsWith('news-preview-209'))
        })
        if (!hasR08a) {
          queries.push({
            queryName: spec.queryName,
            httpStatus: response.status,
            syntaxAndConnectivity: 'PASS',
            semanticsStatus: 'INCONCLUSIVE/NOT YET EXERCISED',
            resultKind: 'empty_array',
            note: 'Query parsed and executed without R08A synthetic documents present; R08A semantics remain INCONCLUSIVE/NOT YET EXERCISED.',
          })
          continue
        }
      }

      const sem = validatePopulatedProbeSemantics(spec.queryName, result)
      queries.push({
        queryName: spec.queryName,
        httpStatus: response.status,
        syntaxAndConnectivity: 'PASS',
        semanticsStatus: sem.ok ? 'PASS' : 'FAIL',
        resultKind: 'populated',
        note: sem.note,
      })
    } catch (err) {
      queries.push({
        queryName: spec.queryName,
        httpStatus: null,
        syntaxAndConnectivity: 'FAIL',
        semanticsStatus: 'FAIL',
        resultKind: 'error',
        note: `Network/fetch error (${err instanceof Error ? err.name : 'Error'}).`,
      })
    }
  }

  const hasFailure = queries.some(q => q.syntaxAndConnectivity === 'FAIL' || q.semanticsStatus === 'FAIL')
  const hasInconclusive = queries.some(q => q.semanticsStatus === 'INCONCLUSIVE/NOT YET EXERCISED')
  const status: LiveGroqProbeReport['status'] = hasFailure
    ? 'FAIL'
    : hasInconclusive
      ? 'INCONCLUSIVE'
      : 'PASS'

  return {
    status,
    projectId: EXPECTED_PROJECT_ID,
    dataset: EXPECTED_DATASET,
    perspective: 'published',
    readOnlyMethod: 'GET',
    queries,
    summaryNote:
      status === 'INCONCLUSIVE'
        ? 'All GROQ queries parsed and connected cleanly, but dereference/ancestor (^.^._id, slots[].challenge->, assignedMonthIds, relatedMonth->) semantics are INCONCLUSIVE/NOT YET EXERCISED until owner-approved R08A synthetic fixtures are inserted.'
        : status === 'PASS'
          ? 'All GROQ queries parsed, executed, and passed populated dereference/projection checks.'
          : 'One or more live GROQ probe queries failed.',
  }
}

// ---------------------------------------------------------------------------
// Read-Only Preflight Collision Report (perspective=raw, GET only)
// ---------------------------------------------------------------------------

export interface PreflightCollisionReport {
  readonly status: 'CLEAR' | 'BLOCKED' | 'INCONCLUSIVE' | 'NOT_RUN'
  readonly applyAllowed: false
  readonly wouldAllowFutureApply: boolean
  readonly projectId: string
  readonly dataset: string
  readonly perspective: 'raw'
  readonly readOnlyMethod: 'GET'
  readonly checkedBatchCount: number
  readonly checkedIntendedIdCount: number
  readonly checkedDraftIdCount: number
  readonly checkedSlugCount: number
  readonly conflictingDocumentIds: readonly string[]
  readonly conflictingSlugs: readonly string[]
  readonly note: string
}

const PREFLIGHT_BATCH_SIZE = 35
const PREFLIGHT_COLLISION_GROQ = `*[_id in $ids || _id in $draftIds || slug.current in $slugs]{ _id, _type, "slug": slug.current }`

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export async function runPreflightCollisionReport(options: {
  readonly env?: Record<string, string | undefined>
  readonly fetchImpl?: typeof fetch
}): Promise<PreflightCollisionReport> {
  const env = options.env ?? process.env
  const token = env.SANITY_READ_TOKEN?.trim()
  const intendedIds = ALL_R08A_INTENDED_DOCUMENT_IDS
  const draftIds = intendedIds.map(id => `drafts.${id}`)
  const intendedSlugs = ALL_R08A_INTENDED_SLUGS

  if (!token) {
    return {
      status: 'NOT_RUN',
      applyAllowed: false,
      wouldAllowFutureApply: false,
      projectId: EXPECTED_PROJECT_ID,
      dataset: EXPECTED_DATASET,
      perspective: 'raw',
      readOnlyMethod: 'GET',
      checkedBatchCount: 0,
      checkedIntendedIdCount: intendedIds.length,
      checkedDraftIdCount: draftIds.length,
      checkedSlugCount: intendedSlugs.length,
      conflictingDocumentIds: [],
      conflictingSlugs: [],
      note: 'NOT RUN: SANITY_READ_TOKEN is not set in the local environment.',
    }
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const idBatches = chunkArray(intendedIds, PREFLIGHT_BATCH_SIZE)
  const slugBatches = chunkArray(intendedSlugs, PREFLIGHT_BATCH_SIZE)
  const batchCount = Math.max(idBatches.length, slugBatches.length)

  const conflictingDocIds = new Set<string>()
  const conflictingSlugSet = new Set<string>()
  const intendedSlugSet = new Set(intendedSlugs)

  for (let i = 0; i < batchCount; i++) {
    const batchIds = idBatches[i] ?? []
    const batchDraftIds = batchIds.map(id => `drafts.${id}`)
    const batchSlugs = slugBatches[i] ?? []

    const url = new URL(
      `https://${EXPECTED_PROJECT_ID}.api.sanity.io/v${SANITY_API_VERSION}/data/query/${EXPECTED_DATASET}`,
    )
    url.searchParams.set('query', PREFLIGHT_COLLISION_GROQ)
    url.searchParams.set('perspective', 'raw')
    url.searchParams.set('$ids', JSON.stringify(batchIds))
    url.searchParams.set('$draftIds', JSON.stringify(batchDraftIds))
    url.searchParams.set('$slugs', JSON.stringify(batchSlugs))

    try {
      const response = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        return {
          status: 'INCONCLUSIVE',
          applyAllowed: false,
          wouldAllowFutureApply: false,
          projectId: EXPECTED_PROJECT_ID,
          dataset: EXPECTED_DATASET,
          perspective: 'raw',
          readOnlyMethod: 'GET',
          checkedBatchCount: i + 1,
          checkedIntendedIdCount: intendedIds.length,
          checkedDraftIdCount: draftIds.length,
          checkedSlugCount: intendedSlugs.length,
          conflictingDocumentIds: [],
          conflictingSlugs: [],
          note: `Preflight failed closed (INCONCLUSIVE): Sanity returned HTTP ${response.status}.`,
        }
      }

      const payload = (await response.json()) as { result?: unknown }
      if (!payload || !Array.isArray(payload.result)) {
        return {
          status: 'INCONCLUSIVE',
          applyAllowed: false,
          wouldAllowFutureApply: false,
          projectId: EXPECTED_PROJECT_ID,
          dataset: EXPECTED_DATASET,
          perspective: 'raw',
          readOnlyMethod: 'GET',
          checkedBatchCount: i + 1,
          checkedIntendedIdCount: intendedIds.length,
          checkedDraftIdCount: draftIds.length,
          checkedSlugCount: intendedSlugs.length,
          conflictingDocumentIds: [],
          conflictingSlugs: [],
          note: 'Preflight failed closed (INCONCLUSIVE): Malformed Sanity query result (expected array).',
        }
      }

      for (const rawItem of payload.result) {
        if (!rawItem || typeof rawItem !== 'object') {
          return {
            status: 'INCONCLUSIVE',
            applyAllowed: false,
            wouldAllowFutureApply: false,
            projectId: EXPECTED_PROJECT_ID,
            dataset: EXPECTED_DATASET,
            perspective: 'raw',
            readOnlyMethod: 'GET',
            checkedBatchCount: i + 1,
            checkedIntendedIdCount: intendedIds.length,
            checkedDraftIdCount: draftIds.length,
            checkedSlugCount: intendedSlugs.length,
            conflictingDocumentIds: [],
            conflictingSlugs: [],
            note: 'Preflight failed closed (INCONCLUSIVE): Malformed collision record in query result.',
          }
        }
        const item = rawItem as { _id?: unknown; slug?: unknown }
        if (typeof item._id === 'string' && item._id.length > 0) {
          conflictingDocIds.add(item._id)
        }
        if (typeof item.slug === 'string' && intendedSlugSet.has(item.slug)) {
          conflictingSlugSet.add(item.slug)
        }
      }
    } catch (err) {
      return {
        status: 'INCONCLUSIVE',
        applyAllowed: false,
        wouldAllowFutureApply: false,
        projectId: EXPECTED_PROJECT_ID,
        dataset: EXPECTED_DATASET,
        perspective: 'raw',
        readOnlyMethod: 'GET',
        checkedBatchCount: i + 1,
        checkedIntendedIdCount: intendedIds.length,
        checkedDraftIdCount: draftIds.length,
        checkedSlugCount: intendedSlugs.length,
        conflictingDocumentIds: [],
        conflictingSlugs: [],
        note: `Preflight failed closed (INCONCLUSIVE): Network error (${err instanceof Error ? err.name : 'Error'}).`,
      }
    }
  }

  const conflictingDocumentIds = [...conflictingDocIds].sort()
  const conflictingSlugs = [...conflictingSlugSet].sort()
  const blocked = conflictingDocumentIds.length > 0 || conflictingSlugs.length > 0

  return {
    status: blocked ? 'BLOCKED' : 'CLEAR',
    applyAllowed: false,
    wouldAllowFutureApply: !blocked,
    projectId: EXPECTED_PROJECT_ID,
    dataset: EXPECTED_DATASET,
    perspective: 'raw',
    readOnlyMethod: 'GET',
    checkedBatchCount: batchCount,
    checkedIntendedIdCount: intendedIds.length,
    checkedDraftIdCount: draftIds.length,
    checkedSlugCount: intendedSlugs.length,
    conflictingDocumentIds,
    conflictingSlugs,
    note: blocked
      ? `Preflight BLOCKED: Found ${conflictingDocumentIds.length} conflicting document ID(s) and ${conflictingSlugs.length} conflicting slug(s). Future apply must refuse.`
      : 'Preflight CLEAR: Zero published IDs, draft IDs, or slug conflicts found in staging (perspective=raw). No writes performed in R08A-4A.',
  }
}

// ---------------------------------------------------------------------------
// Unified Runner
// ---------------------------------------------------------------------------

export interface R08aExecutionResult {
  readonly success: boolean
  readonly dryRun: true
  readonly writePathPresent: false
  readonly manifestVersion: string
  readonly checksumSha256: string
  readonly target: { readonly projectId: string; readonly dataset: string }
  readonly counts: {
    readonly totalDocuments: number
    readonly monthlyPublications: number
    readonly challenges: number
    readonly newsArticles: number
    readonly months: readonly {
      readonly monthId: string
      readonly yearMonth: string
      readonly days: number
      readonly previewStartDate: string
      readonly challengeCount: number
      readonly previewNewsId: string
    }[]
  }
  readonly offlineGatewayValidation: OfflineGatewayValidationSummary
  readonly liveGroqProbe: LiveGroqProbeReport
  readonly preflight: PreflightCollisionReport
  readonly message: string
}

export async function executeR08aMonthlyFixtures(options: {
  readonly args?: readonly string[]
  readonly env?: Record<string, string | undefined>
  readonly fetchImpl?: typeof fetch
} = {}): Promise<R08aExecutionResult> {
  const args = options.args ?? []
  const env = options.env ?? process.env
  const checksumSha256 = computeR08aManifestChecksum()

  const baseCounts = {
    totalDocuments: ALL_R08A_MONTHLY_DOCUMENTS.length,
    monthlyPublications: R08A_MONTHLY_PUBLICATION_DOCUMENTS.length,
    challenges: R08A_MONTHLY_CHALLENGE_DOCUMENTS.length,
    newsArticles: R08A_MONTHLY_NEWS_DOCUMENTS.length,
    months: R08A_MONTH_SPECS.map(spec => ({
      monthId: `month-${spec.yearMonth}`,
      yearMonth: spec.yearMonth,
      days: spec.expectedDays,
      previewStartDate: spec.previewStartDate,
      challengeCount: spec.expectedDays,
      previewNewsId: `news-preview-${spec.yearMonth}`,
    })),
  }

  const parsedArgs = parseR08aCliArgs(args)
  if (parsedArgs.securityViolation) {
    return {
      success: false,
      dryRun: true,
      writePathPresent: false,
      manifestVersion: R08A_MANIFEST_VERSION,
      checksumSha256,
      target: { projectId: EXPECTED_PROJECT_ID, dataset: EXPECTED_DATASET },
      counts: baseCounts,
      offlineGatewayValidation: { passed: false, checksRun: 0, errors: [parsedArgs.securityViolation] },
      liveGroqProbe: {
        status: 'NOT_RUN',
        projectId: EXPECTED_PROJECT_ID,
        dataset: EXPECTED_DATASET,
        perspective: 'published',
        readOnlyMethod: 'GET',
        queries: [],
        summaryNote: 'NOT RUN due to CLI security/flag error.',
      },
      preflight: {
        status: 'NOT_RUN',
        applyAllowed: false,
        wouldAllowFutureApply: false,
        projectId: EXPECTED_PROJECT_ID,
        dataset: EXPECTED_DATASET,
        perspective: 'raw',
        readOnlyMethod: 'GET',
        checkedBatchCount: 0,
        checkedIntendedIdCount: ALL_R08A_INTENDED_DOCUMENT_IDS.length,
        checkedDraftIdCount: ALL_R08A_INTENDED_DOCUMENT_IDS.length,
        checkedSlugCount: ALL_R08A_INTENDED_SLUGS.length,
        conflictingDocumentIds: [],
        conflictingSlugs: [],
        note: 'NOT RUN due to CLI security/flag error.',
      },
      message: parsedArgs.securityViolation,
    }
  }

  const targetValidation = validateR08aStagingTarget(env)
  if (!targetValidation.valid) {
    return {
      success: false,
      dryRun: true,
      writePathPresent: false,
      manifestVersion: R08A_MANIFEST_VERSION,
      checksumSha256,
      target: {
        projectId: env.SANITY_PROJECT_ID ?? EXPECTED_PROJECT_ID,
        dataset: env.SANITY_DATASET ?? EXPECTED_DATASET,
      },
      counts: baseCounts,
      offlineGatewayValidation: {
        passed: false,
        checksRun: 0,
        errors: [targetValidation.error!],
      },
      liveGroqProbe: {
        status: 'NOT_RUN',
        projectId: EXPECTED_PROJECT_ID,
        dataset: EXPECTED_DATASET,
        perspective: 'published',
        readOnlyMethod: 'GET',
        queries: [],
        summaryNote: 'NOT RUN due to target validation failure.',
      },
      preflight: {
        status: 'NOT_RUN',
        applyAllowed: false,
        wouldAllowFutureApply: false,
        projectId: EXPECTED_PROJECT_ID,
        dataset: EXPECTED_DATASET,
        perspective: 'raw',
        readOnlyMethod: 'GET',
        checkedBatchCount: 0,
        checkedIntendedIdCount: ALL_R08A_INTENDED_DOCUMENT_IDS.length,
        checkedDraftIdCount: ALL_R08A_INTENDED_DOCUMENT_IDS.length,
        checkedSlugCount: ALL_R08A_INTENDED_SLUGS.length,
        conflictingDocumentIds: [],
        conflictingSlugs: [],
        note: 'NOT RUN due to target validation failure.',
      },
      message: targetValidation.error!,
    }
  }

  const offlineGatewayValidation = runOfflineGatewayContractValidation()

  const liveGroqProbe: LiveGroqProbeReport = parsedArgs.checkLiveGroq
    ? await runLiveGroqProbe({ env, fetchImpl: options.fetchImpl })
    : {
        status: 'NOT_RUN',
        projectId: EXPECTED_PROJECT_ID,
        dataset: EXPECTED_DATASET,
        perspective: 'published',
        readOnlyMethod: 'GET',
        queries: [],
        summaryNote: 'NOT RUN: Pass --check-live-groq with local SANITY_READ_TOKEN to execute read-only GROQ probe.',
      }

  const preflight: PreflightCollisionReport = parsedArgs.preflight
    ? await runPreflightCollisionReport({ env, fetchImpl: options.fetchImpl })
    : {
        status: 'NOT_RUN',
        applyAllowed: false,
        wouldAllowFutureApply: false,
        projectId: EXPECTED_PROJECT_ID,
        dataset: EXPECTED_DATASET,
        perspective: 'raw',
        readOnlyMethod: 'GET',
        checkedBatchCount: 0,
        checkedIntendedIdCount: ALL_R08A_INTENDED_DOCUMENT_IDS.length,
        checkedDraftIdCount: ALL_R08A_INTENDED_DOCUMENT_IDS.length,
        checkedSlugCount: ALL_R08A_INTENDED_SLUGS.length,
        conflictingDocumentIds: [],
        conflictingSlugs: [],
        note: 'NOT RUN: Pass --preflight with local SANITY_READ_TOKEN to run read-only perspective=raw collision check.',
      }

  const probeFailure =
    (parsedArgs.checkLiveGroq && (liveGroqProbe.status === 'FAIL' || liveGroqProbe.status === 'NOT_RUN')) ||
    (parsedArgs.preflight && (preflight.status === 'INCONCLUSIVE' || preflight.status === 'NOT_RUN'))

  const success = offlineGatewayValidation.passed && !probeFailure

  return {
    success,
    dryRun: true,
    writePathPresent: false,
    manifestVersion: R08A_MANIFEST_VERSION,
    checksumSha256,
    target: { projectId: EXPECTED_PROJECT_ID, dataset: EXPECTED_DATASET },
    counts: baseCounts,
    offlineGatewayValidation,
    liveGroqProbe,
    preflight,
    message: success
      ? `DRY-RUN COMPLETE (zero writes): ${baseCounts.totalDocuments} deterministic documents validated offline (${offlineGatewayValidation.checksRun} checks, sha256=${checksumSha256.slice(0, 16)}...).`
      : 'R08A-4A validation or read-only probe reported an error or missing read credential.',
  }
}

async function main() {
  const args = process.argv.slice(2)
  const parsed = parseR08aCliArgs(args)
  if (parsed.help) {
    console.log(
      [
        'R08A-4A Monthly Fixture Manifest, Offline Validator & Read-Only GROQ Probe',
        'Usage: node --experimental-strip-types scripts/r08a-monthly-fixtures.ts [options]',
        'Options:',
        '  --json              Output full machine-readable JSON manifest and validation report',
        '  --check-live-groq   Run read-only GET GROQ probe (perspective=published) using SANITY_READ_TOKEN',
        '  --preflight         Run read-only GET collision report (perspective=raw) using SANITY_READ_TOKEN',
        '  --help, -h          Show help',
        'Note: Zero write paths exist. --apply, --teardown, --delete, and CLI tokens are rejected.',
      ].join('\n'),
    )
    return
  }

  const result = await executeR08aMonthlyFixtures({ args })
  if (parsed.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`[R08A-4A] Manifest version: ${result.manifestVersion}`)
    console.log(`[R08A-4A] Target: ${result.target.projectId} / ${result.target.dataset} (dryRun=${result.dryRun}, writePathPresent=${result.writePathPresent})`)
    console.log(`[R08A-4A] Checksum (sha256): ${result.checksumSha256}`)
    console.log(
      `[R08A-4A] Counts: ${result.counts.monthlyPublications} months, ${result.counts.challenges} challenges, ${result.counts.newsArticles} news articles (${result.counts.totalDocuments} total documents)`,
    )
    for (const m of result.counts.months) {
      console.log(`  - ${m.monthId}: ${m.days} days/challenges, previewStart=${m.previewStartDate}, news=${m.previewNewsId}`)
    }
    console.log(
      `[R08A-4A] Offline gateway validation: ${result.offlineGatewayValidation.passed ? 'PASS' : 'FAIL'} (${result.offlineGatewayValidation.checksRun} checks)`,
    )
    if (result.offlineGatewayValidation.errors.length > 0) {
      for (const err of result.offlineGatewayValidation.errors) {
        console.error(`  ! ${err}`)
      }
    }
    console.log(`[R08A-4A] Live GROQ probe: ${result.liveGroqProbe.status} — ${result.liveGroqProbe.summaryNote}`)
    console.log(`[R08A-4A] Preflight collision check: ${result.preflight.status} (applyAllowed=${result.preflight.applyAllowed}) — ${result.preflight.note}`)
    console.log(`[R08A-4A] ${result.message}`)
  }

  if (!result.success) {
    process.exitCode = 1
  }
}

const isDirectExecution =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  await main()
}
