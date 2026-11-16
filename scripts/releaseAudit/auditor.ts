import { buildChallengeId } from '../../src/gateway/fixtures/r08aMonthlyFixtures.ts'
import { handleGatewayRequest } from '../../src/gateway/handler.ts'
import {
  DEFAULT_RELEASE_TIME_ZONE,
  computeAdvancePreviewStartDate,
  resolveAuthorizedReaderDate,
} from '../../src/gateway/localRelease.ts'
import {
  evaluateMonthProgress,
  validateAndProjectLibraryMonthSummary,
  validateAndProjectMonthDetail,
  validateAndProjectMonthPreview,
  validateAndProjectNewsArticle,
} from '../../src/gateway/monthlyProjection.ts'
import { validateAndProjectChallenge } from '../../src/gateway/projection.ts'
import type { GatewayEnv, GatewayFetch, GatewayServerContext } from '../../src/gateway/types.ts'
import { buildAuditFixtureBundle, validateAuditFixtureBundle } from './fixtures.ts'
import { findLeakedMarkerIds, sanitizeAuditText } from './redaction.ts'
import type {
  AuditContractId,
  AuditFinding,
  AuditFixtureBundle,
  AuditGatewayProjectors,
  AuditReport,
  AuditRunOptions,
  SecretMarker,
} from './types.ts'

export const AUDIT_VERSION = '1.0.0'

const DEFAULT_OFFLINE_ENV: GatewayEnv = {
  SANITY_PROJECT_ID: '80016lrq',
  SANITY_DATASET: 'staging',
  SANITY_READ_TOKEN: 'offline-audit-synthetic-token-never-used-on-network',
  ALLOWED_ORIGINS: 'http://localhost:3000',
}

const ALLOWED_PREVIEW_MONTH_KEYS = new Set([
  'monthId',
  'documentId',
  'year',
  'month',
  'daysInMonth',
  'phase',
  'monthStartsOn',
  'title',
  'subtitle',
  'coverImage',
  'introduction',
  'slots',
])

const ALLOWED_PREVIEW_SLOT_KEYS = new Set(['dayOfMonth', 'date', 'title', 'availability'])

function makeFinding(
  checkId: string,
  title: string,
  contract: AuditContractId,
  ok: boolean,
  summary: string,
  markers: readonly SecretMarker[],
  extraSecrets: readonly string[] = [],
  details?: readonly string[],
): AuditFinding {
  return {
    checkId,
    title,
    contract,
    status: ok ? 'PASS' : 'FAIL',
    summary: sanitizeAuditText(summary, markers, extraSecrets),
    ...(details && details.length > 0
      ? { details: details.map(d => sanitizeAuditText(d, markers, extraSecrets)) }
      : {}),
  }
}

function createOfflineMockFetch(
  responder: (url: URL, init?: RequestInit) => unknown,
): GatewayFetch {
  return async (input, init) => {
    const url =
      typeof input === 'string'
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url)
    const result = responder(url, init)
    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

function assertNoLeakedMarkers(
  payloads: readonly string[],
  markers: readonly SecretMarker[],
): string[] {
  const leaked = new Set<string>()
  for (const text of payloads) {
    for (const id of findLeakedMarkerIds(text, markers)) {
      leaked.add(id)
    }
  }
  return Array.from(leaked)
}

function buildReport(findings: readonly AuditFinding[], executedAtUtc: string): AuditReport {
  const passed = findings.filter(f => f.status === 'PASS').length
  const failed = findings.length - passed
  return {
    ok: failed === 0,
    auditVersion: AUDIT_VERSION,
    mode: 'offline-synthetic',
    executedAtUtc,
    summary: {
      total: findings.length,
      passed,
      failed,
    },
    findings,
  }
}

/**
 * Runs the offline R18/R08A Monthly Publication Confidentiality Audit against
 * the approved gateway projection contracts and synthetic fixtures.
 */
export async function runMonthlyPublicationAudit(
  options: AuditRunOptions = {},
): Promise<AuditReport> {
  const serverNowUtc = options.serverNowUtc ?? new Date('2098-03-10T15:00:00.000Z')
  const executedAtUtc = Number.isFinite(serverNowUtc.getTime())
    ? serverNowUtc.toISOString()
    : new Date(0).toISOString()

  const envCandidate = options.env === undefined ? DEFAULT_OFFLINE_ENV : options.env
  const markers = options.fixtures?.secretMarkers ?? []
  const extraSecrets =
    envCandidate && typeof envCandidate.SANITY_READ_TOKEN === 'string'
      ? [envCandidate.SANITY_READ_TOKEN]
      : []

  // 1. Fail clearly if required authorization context is missing or invalid
  if (
    !envCandidate ||
    typeof envCandidate.SANITY_PROJECT_ID !== 'string' ||
    envCandidate.SANITY_PROJECT_ID.trim().length === 0 ||
    typeof envCandidate.SANITY_DATASET !== 'string' ||
    envCandidate.SANITY_DATASET.trim().length === 0 ||
    typeof envCandidate.SANITY_READ_TOKEN !== 'string' ||
    envCandidate.SANITY_READ_TOKEN.trim().length === 0 ||
    !Number.isFinite(serverNowUtc.getTime())
  ) {
    const finding = makeFinding(
      'auth-context',
      'Authorization context and server clock validation',
      'AUTHORIZATION_CONTEXT_REQUIRED',
      false,
      'Missing or invalid authorization context (SANITY_PROJECT_ID, SANITY_DATASET, SANITY_READ_TOKEN, or valid serverNowUtc).',
      markers,
      extraSecrets,
    )
    return buildReport([finding], executedAtUtc)
  }

  const env: GatewayEnv = {
    SANITY_PROJECT_ID: envCandidate.SANITY_PROJECT_ID,
    SANITY_DATASET: envCandidate.SANITY_DATASET,
    SANITY_READ_TOKEN: envCandidate.SANITY_READ_TOKEN,
    SANITY_API_VERSION: envCandidate.SANITY_API_VERSION,
    ALLOWED_ORIGINS: envCandidate.ALLOWED_ORIGINS,
  }

  // 2. Fail clearly if fixtures are missing or invalid
  let bundle: AuditFixtureBundle
  try {
    bundle = options.fixtures ?? buildAuditFixtureBundle()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to construct fixture bundle.'
    const finding = makeFinding(
      'fixture-integrity',
      'Synthetic fixture bundle integrity',
      'FIXTURE_INTEGRITY_VALIDATION',
      false,
      `Fixture construction failed: ${message}`,
      markers,
      extraSecrets,
    )
    return buildReport([finding], executedAtUtc)
  }

  const fixtureCheck = validateAuditFixtureBundle(bundle)
  if (!fixtureCheck.ok) {
    const finding = makeFinding(
      'fixture-integrity',
      'Synthetic fixture bundle integrity',
      'FIXTURE_INTEGRITY_VALIDATION',
      false,
      fixtureCheck.reason ?? 'Fixture bundle validation failed.',
      bundle.secretMarkers ?? markers,
      extraSecrets,
    )
    return buildReport([finding], executedAtUtc)
  }

  const auditMarkers = bundle.secretMarkers
  const projectors: AuditGatewayProjectors = {
    validateAndProjectMonthPreview:
      options.projectors?.validateAndProjectMonthPreview ?? validateAndProjectMonthPreview,
    validateAndProjectMonthDetail:
      options.projectors?.validateAndProjectMonthDetail ?? validateAndProjectMonthDetail,
    evaluateMonthProgress: options.projectors?.evaluateMonthProgress ?? evaluateMonthProgress,
    validateAndProjectNewsArticle:
      options.projectors?.validateAndProjectNewsArticle ?? validateAndProjectNewsArticle,
    validateAndProjectLibraryMonthSummary:
      options.projectors?.validateAndProjectLibraryMonthSummary ??
      validateAndProjectLibraryMonthSummary,
    validateAndProjectChallenge:
      options.projectors?.validateAndProjectChallenge ?? validateAndProjectChallenge,
    handleGatewayRequest: options.projectors?.handleGatewayRequest ?? handleGatewayRequest,
  }

  const findings: AuditFinding[] = []
  findings.push(
    makeFinding(
      'auth-context',
      'Authorization context and server clock validation',
      'AUTHORIZATION_CONTEXT_REQUIRED',
      true,
      'Gateway environment and authoritative server clock are present and valid.',
      auditMarkers,
      extraSecrets,
    ),
    makeFinding(
      'fixture-integrity',
      'Synthetic fixture bundle integrity',
      'FIXTURE_INTEGRITY_VALIDATION',
      true,
      `Validated synthetic audit fixture bundle "${bundle.bundleId}".`,
      auditMarkers,
      extraSecrets,
    ),
  )

  const collectedPayloads: string[] = []

  // 3. Advance preview allowlist check
  {
    const previewDate = new Date('2098-02-27T12:00:00.000Z')
    const previewRes = await projectors.handleGatewayRequest(
      new Request('http://localhost/api/months/2098-03/preview', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      env,
      {
        getNow: () => previewDate,
        fetchImpl: createOfflineMockFetch(() => bundle.previewDoc209803),
      },
    )
    const previewText = await previewRes.text()
    collectedPayloads.push(previewText)

    const issues: string[] = []
    if (previewRes.status !== 200) {
      issues.push(`Expected HTTP 200 on 2098-02-27 preview, received ${previewRes.status}.`)
    } else {
      const parsed = JSON.parse(previewText) as { month?: Record<string, unknown> }
      const month = parsed.month
      if (!month) {
        issues.push('Missing month object in preview response.')
      } else {
        for (const key of Object.keys(month)) {
          if (!ALLOWED_PREVIEW_MONTH_KEYS.has(key)) {
            issues.push(`Disallowed month key in advance preview: "${key}".`)
          }
        }
        const intro = month.introduction as Record<string, unknown> | undefined
        if (!intro || 'welcomeScreen' in intro) {
          issues.push('Advance preview exposed welcomeScreen prematurely.')
        }
        const slots = month.slots as Array<Record<string, unknown>> | undefined
        if (!Array.isArray(slots) || slots.length !== 31) {
          issues.push('Advance preview slots missing or unexpected length.')
        } else {
          for (const slot of slots) {
            for (const key of Object.keys(slot)) {
              if (!ALLOWED_PREVIEW_SLOT_KEYS.has(key)) {
                issues.push(`Disallowed slot key in advance preview: "${key}".`)
              }
            }
            if (slot.availability !== 'comingSoon' && slot.availability !== 'unavailable') {
              issues.push(`Unexpected preview slot availability: "${String(slot.availability)}".`)
            }
          }
        }
      }
    }
    const leaked = assertNoLeakedMarkers([previewText], auditMarkers)
    if (leaked.length > 0) {
      issues.push(`Leaked marker IDs in advance preview: ${leaked.join(', ')}.`)
    }

    findings.push(
      makeFinding(
        'advance-preview-allowlist',
        'Advance preview exposes only theme, intro subset, dates, and future titles',
        'ADVANCE_PREVIEW_ALLOWLIST',
        issues.length === 0,
        issues.length === 0
          ? 'Advance preview strictly enforces allowlist and omits welcomeScreen, discoveries, and Challenge bodies.'
          : issues.join(' '),
        auditMarkers,
        extraSecrets,
        issues,
      ),
    )
  }

  // 4. Future Challenge body & catalog embargo check
  {
    const midMonthDate = new Date('2098-03-10T15:00:00.000Z')
    const futureRes = await projectors.handleGatewayRequest(
      new Request('http://localhost/api/challenges/r08a-stg-2098-03-day-20', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      env,
      {
        getNow: () => midMonthDate,
        fetchImpl: createOfflineMockFetch(() => bundle.futureChallenge209803Day20),
      },
    )
    const futureText = await futureRes.text()
    collectedPayloads.push(futureText)

    const catalogRes = await projectors.handleGatewayRequest(
      new Request('http://localhost/api/challenges', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      env,
      {
        getNow: () => midMonthDate,
        fetchImpl: createOfflineMockFetch(() => [
          bundle.activeChallenge209803Day05,
          bundle.futureChallenge209803Day20,
        ]),
      },
    )
    const catalogText = await catalogRes.text()
    collectedPayloads.push(catalogText)

    const issues: string[] = []
    if (futureRes.status !== 404) {
      issues.push(`Expected 404 for embargoed future Challenge, received ${futureRes.status}.`)
    }
    if (catalogRes.status !== 200) {
      issues.push(`Expected 200 for catalog, received ${catalogRes.status}.`)
    } else {
      const catalogJson = JSON.parse(catalogText) as {
        challenges?: Array<{ _id?: string }>
      }
      if (catalogJson.challenges?.some(c => c._id === bundle.futureChallenge209803Day20._id)) {
        issues.push('Future Challenge appeared in GET /api/challenges catalog.')
      }
    }
    const leaked = assertNoLeakedMarkers([futureText, catalogText], auditMarkers)
    if (leaked.length > 0) {
      issues.push(`Leaked marker IDs in Challenge/catalog responses: ${leaked.join(', ')}.`)
    }

    findings.push(
      makeFinding(
        'embargoed-challenge-body',
        'Future Challenge bodies and passages are withheld before release date',
        'EMBARGOED_CHALLENGE_BODY_LEAK',
        issues.length === 0,
        issues.length === 0
          ? 'Future Challenge endpoint returns 404 and catalog excludes unreleased Challenges with zero body leakage.'
          : issues.join(' '),
        auditMarkers,
        extraSecrets,
        issues,
      ),
    )
  }

  // 5. Hidden discovery mappings & oracle protection
  {
    const midMonthDate = new Date('2098-03-10T15:00:00.000Z')
    const detailRes = await projectors.handleGatewayRequest(
      new Request('http://localhost/api/months/2098-03', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      env,
      {
        getNow: () => midMonthDate,
        fetchImpl: createOfflineMockFetch(() => bundle.detailDoc209803),
      },
    )
    const detailText = await detailRes.text()
    collectedPayloads.push(detailText)

    const futureDay20Id = String(bundle.futureChallenge209803Day20._id)
    const progressRes = await projectors.handleGatewayRequest(
      new Request('http://localhost/api/months/2098-03/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bibleberry-Timezone': 'America/New_York',
        },
        body: JSON.stringify({ completedChallengeIds: [futureDay20Id] }),
      }),
      env,
      {
        getNow: () => midMonthDate,
        fetchImpl: createOfflineMockFetch(() => bundle.detailDoc209803),
      },
    )
    const progressText = await progressRes.text()
    collectedPayloads.push(progressText)

    const issues: string[] = []
    if (detailRes.status !== 200 || progressRes.status !== 200) {
      issues.push(
        `Unexpected status on detail (${detailRes.status}) or progress (${progressRes.status}).`,
      )
    } else {
      if (
        detailText.includes('qualifyingChallenge') ||
        progressText.includes('qualifyingChallenge')
      ) {
        issues.push('Discovery qualifyingChallenge mapping key appeared in projection.')
      }
      const progressJson = JSON.parse(progressText) as { completedInMonthCount?: number }
      if (progressJson.completedInMonthCount !== 0) {
        issues.push(
          `Unreleased Challenge ID incremented completedInMonthCount to ${String(progressJson.completedInMonthCount)}.`,
        )
      }
    }
    const leaked = assertNoLeakedMarkers([detailText, progressText], auditMarkers)
    if (leaked.length > 0) {
      issues.push(`Leaked marker IDs in discovery/progress responses: ${leaked.join(', ')}.`)
    }

    findings.push(
      makeFinding(
        'hidden-discovery-mappings',
        'Hidden discovery mappings and unreleased progress are withheld',
        'HIDDEN_DISCOVERY_MAPPING_LEAK',
        issues.length === 0,
        issues.length === 0
          ? 'Discovery projections omit qualifying Challenge mappings and ignore unreleased Challenge IDs.'
          : issues.join(' '),
        auditMarkers,
        extraSecrets,
        issues,
      ),
    )

    // 6. Unrewarded card artwork check (same unearned progress payload)
    const artIssues: string[] = []
    if (progressRes.status === 200) {
      const progressJson = JSON.parse(progressText) as {
        discoveries?: Array<{ isEarned?: boolean; earnedCard?: unknown }>
      }
      for (const disc of progressJson.discoveries ?? []) {
        if (!disc.isEarned && disc.earnedCard !== undefined) {
          artIssues.push('Unearned discovery included earnedCard payload.')
        }
      }
    }
    const artLeaked = assertNoLeakedMarkers([detailText, progressText], auditMarkers).filter(id =>
      id.startsWith('unrewarded_card_'),
    )
    if (artLeaked.length > 0) {
      artIssues.push(`Leaked unrewarded card marker IDs: ${artLeaked.join(', ')}.`)
    }

    findings.push(
      makeFinding(
        'unrewarded-card-artwork',
        'Unrewarded Scripture Card artwork, alt text, and transcriptions are withheld',
        'UNREWARDED_CARD_ARTWORK_LEAK',
        artIssues.length === 0,
        artIssues.length === 0
          ? 'Unearned discoveries expose title and numeric progress only, with zero card artwork.'
          : artIssues.join(' '),
        auditMarkers,
        extraSecrets,
        artIssues,
      ),
    )
  }

  // 7. Unauthorized asset references & unlicensed Scripture check
  {
    const aprDate = new Date('2098-04-10T15:00:00.000Z')
    const unlicensedRes = await projectors.handleGatewayRequest(
      new Request('http://localhost/api/challenges/r08a-stg-2098-04-day-07', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      env,
      {
        getNow: () => aprDate,
        fetchImpl: createOfflineMockFetch(() => bundle.unlicensedScriptureChallengeDoc),
      },
    )
    const unlicensedText = await unlicensedRes.text()
    collectedPayloads.push(unlicensedText)

    const issues: string[] = []
    if (unlicensedRes.status !== 404) {
      issues.push(
        `Expected 404 for unlicensed Scripture Challenge, received ${unlicensedRes.status}.`,
      )
    }
    const leaked = assertNoLeakedMarkers([...collectedPayloads], auditMarkers).filter(
      id => id === 'unauthorized_asset_reference' || id === 'unlicensed_scripture_passage',
    )
    if (leaked.length > 0) {
      issues.push(`Unauthorized asset/scripture marker IDs leaked: ${leaked.join(', ')}.`)
    }

    findings.push(
      makeFinding(
        'unauthorized-asset-references',
        'Unauthorized asset references and unlicensed Scripture fail closed',
        'UNAUTHORIZED_ASSET_REFERENCE_LEAK',
        issues.length === 0,
        issues.length === 0
          ? 'Unauthorized asset URLs are stripped and unconfirmed Scripture rights fail closed (404).'
          : issues.join(' '),
        auditMarkers,
        extraSecrets,
        issues,
      ),
    )
  }

  // 8. Private participation & internal editorial data check
  {
    const activeChallengeRes = await projectors.handleGatewayRequest(
      new Request('http://localhost/api/challenges/r08a-stg-2098-03-day-05', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      env,
      {
        getNow: () => new Date('2098-03-10T15:00:00.000Z'),
        fetchImpl: createOfflineMockFetch(() => bundle.activeChallenge209803Day05),
      },
    )
    const activeChallengeText = await activeChallengeRes.text()
    collectedPayloads.push(activeChallengeText)

    const libProjected = bundle.libraryMonthDocs
      .map(doc =>
        projectLibrarySafe(
          projectors.validateAndProjectLibraryMonthSummary,
          doc,
          '2098-04-05',
        ),
      )
      .filter(Boolean)
    const libText = JSON.stringify(libProjected)
    collectedPayloads.push(libText)

    const issues: string[] = []
    if (activeChallengeRes.status !== 200) {
      issues.push(`Expected 200 for active Day 5 Challenge, received ${activeChallengeRes.status}.`)
    }
    const leaked = assertNoLeakedMarkers(collectedPayloads, auditMarkers).filter(
      id => id === 'private_participation_data' || id === 'internal_editorial_notes',
    )
    if (leaked.length > 0) {
      issues.push(`Private/editorial marker IDs leaked: ${leaked.join(', ')}.`)
    }

    findings.push(
      makeFinding(
        'private-participation-data',
        'Private participation records and internal editorial notes are stripped',
        'PRIVATE_PARTICIPATION_LEAK',
        issues.length === 0,
        issues.length === 0
          ? 'Reader-facing projections strip all private participation and internal editorial fields.'
          : issues.join(' '),
        auditMarkers,
        extraSecrets,
        issues,
      ),
    )
  }

  // 9. Active vs historical months & upcoming publication dates
  {
    const issues: string[] = []
    const activeProj = projectors.validateAndProjectMonthDetail(
      bundle.detailDoc209803,
      '2098-03',
      serverContextFor('2098-03-15'),
    )
    if (!activeProj.ok || activeProj.document.month.phase !== 'active') {
      issues.push('Expected 2098-03 on 2098-03-15 to project as phase "active".')
    } else {
      const day15 = activeProj.document.month.slots[14]
      const day16 = activeProj.document.month.slots[15]
      if (day15?.availability !== 'available' || day16?.availability !== 'comingSoon') {
        issues.push('Active month boundary between Day 15 (available) and Day 16 (comingSoon) failed.')
      }
    }

    const histProj = projectors.validateAndProjectMonthDetail(
      bundle.detailDoc209803,
      '2098-03',
      serverContextFor('2098-04-05'),
    )
    if (!histProj.ok || histProj.document.month.phase !== 'historical') {
      issues.push('Expected 2098-03 on 2098-04-05 to project as phase "historical".')
    } else if (!histProj.document.month.slots.every(s => s.availability === 'available')) {
      issues.push('Historical month 2098-03 did not mark all 31 slots available.')
    }

    const upcomingDetail = projectors.validateAndProjectMonthDetail(
      bundle.detailDoc209804,
      '2098-04',
      serverContextFor('2098-03-20'),
    )
    if (upcomingDetail.ok) {
      issues.push('Upcoming month 2098-04 was accessible before 2098-04-01.')
    }

    const libRes = await projectors.handleGatewayRequest(
      new Request('http://localhost/api/library/months', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      env,
      {
        getNow: () => new Date('2098-04-05T12:00:00.000Z'),
        fetchImpl: createOfflineMockFetch(() => bundle.libraryMonthDocs),
      },
    )
    if (libRes.status !== 200) {
      issues.push(`Expected 200 from GET /api/library/months, received ${libRes.status}.`)
    } else {
      const libJson = (await libRes.json()) as { items?: Array<{ yearMonth: string }> }
      const yms = new Set((libJson.items ?? []).map(i => i.yearMonth))
      if (!yms.has('2098-03') || !yms.has('2098-02') || yms.has('2098-04')) {
        issues.push('Library months did not include historical 2098-03/2098-02 while excluding active 2098-04.')
      }
    }

    findings.push(
      makeFinding(
        'month-phase-lifecycle',
        'Active vs historical month phases, upcoming dates, and Library filtering',
        'MONTH_PHASE_LIFECYCLE',
        issues.length === 0,
        issues.length === 0
          ? 'Active, historical, upcoming, and Library month transitions conform to R08A-0.'
          : issues.join(' '),
        auditMarkers,
        extraSecrets,
        issues,
      ),
    )
  }

  // 10. February preview timing (28-day and 29-day leap Feb -> Feb 27; ordinary -> 28th)
  {
    const issues: string[] = []
    if (
      computeAdvancePreviewStartDate(2098, 3) !== '2098-02-27' ||
      computeAdvancePreviewStartDate(2096, 3) !== '2096-02-27' ||
      computeAdvancePreviewStartDate(2098, 4) !== '2098-03-28' ||
      computeAdvancePreviewStartDate(2098, 1) !== '2097-12-28'
    ) {
      issues.push('computeAdvancePreviewStartDate violated Feb 27 / preceding 28th rule.')
    }

    const nonLeapBefore = projectors.validateAndProjectMonthPreview(
      bundle.previewDoc209803,
      '2098-03',
      serverContextFor('2098-02-26'),
    )
    const nonLeapAt = projectors.validateAndProjectMonthPreview(
      bundle.previewDoc209803,
      '2098-03',
      serverContextFor('2098-02-27'),
    )
    const leapBefore = projectors.validateAndProjectMonthPreview(
      bundle.previewDoc209603,
      '2096-03',
      serverContextFor('2096-02-26'),
    )
    const leapAt = projectors.validateAndProjectMonthPreview(
      bundle.previewDoc209603,
      '2096-03',
      serverContextFor('2096-02-27'),
    )

    if (nonLeapBefore.ok || !nonLeapAt.ok) {
      issues.push('Non-leap February 2098 preview boundary (02-26 closed / 02-27 open) failed.')
    }
    if (leapBefore.ok || !leapAt.ok) {
      issues.push('Leap February 2096 preview boundary (02-26 closed / 02-27 open) failed.')
    }

    const marNews = bundle.previewNewsDocs.find(n => n._id === 'news-preview-2098-03')
    if (!marNews) {
      issues.push('Missing news-preview-2098-03 in fixture bundle.')
    } else {
      const newsBefore = projectors.validateAndProjectNewsArticle(marNews, '2098-02-26')
      const newsAt = projectors.validateAndProjectNewsArticle(marNews, '2098-02-27')
      if (newsBefore.ok || !newsAt.ok) {
        issues.push('Monthly preview News article did not align with Feb 27 preview boundary.')
      }
    }

    findings.push(
      makeFinding(
        'february-preview-timing',
        'February 27 (leap and non-leap) and preceding-28th preview timing',
        'FEBRUARY_PREVIEW_TIMING',
        issues.length === 0,
        issues.length === 0
          ? 'Both 28-day and 29-day February advance previews unlock strictly on Feb 27.'
          : issues.join(' '),
        auditMarkers,
        extraSecrets,
        issues,
      ),
    )
  }

  // 11. Withdrawal and unavailable states (Option 4A)
  {
    const issues: string[] = []
    const ctxApr20 = serverContextFor('2098-04-20')
    const imm = projectors.validateAndProjectMonthDetail(
      bundle.immediateWithdrawalDetailDoc,
      '2098-04',
      ctxApr20,
    )
    const ret = projectors.validateAndProjectMonthDetail(
      bundle.retractedWithdrawalDetailDoc,
      '2098-04',
      ctxApr20,
    )
    const amd = projectors.validateAndProjectMonthDetail(
      bundle.amendedV2WithdrawalDetailDoc,
      '2098-04',
      ctxApr20,
    )

    if (!imm.ok || imm.document.month.slots[17]?.availability !== 'unavailable') {
      issues.push('Immediate Day 18 withdrawal did not project as unavailable.')
    }
    if (!ret.ok || ret.document.month.slots[17]?.availability !== 'unavailable') {
      issues.push('Retracted Day 18 withdrawal did not project as unavailable.')
    }
    if (
      !amd.ok ||
      amd.document.month.slots[17]?.availability !== 'unavailable' ||
      amd.document.month.totalChallenges !== 29
    ) {
      issues.push('Amended v2 Day 18 withdrawal did not yield unavailable slot with totalChallenges=29.')
    }

    const immText = imm.ok ? JSON.stringify(imm.document) : ''
    const retText = ret.ok ? JSON.stringify(ret.document) : ''
    const leaked = assertNoLeakedMarkers([immText, retText], auditMarkers)
    if (leaked.length > 0) {
      issues.push(`Withdrawn slot leaked marker IDs: ${leaked.join(', ')}.`)
    }

    const all29Ids = Array.from({ length: 30 }, (_, idx) => idx + 1)
      .filter(day => day !== 18)
      .map(day => `cms:${buildChallengeId('2098-04', day)}`)
    const v2Progress = projectors.evaluateMonthProgress(
      bundle.amendedV2WithdrawalDetailDoc,
      '2098-04',
      serverContextFor('2098-04-30'),
      all29Ids,
    )
    const fullMonth = v2Progress.ok
      ? v2Progress.document.discoveries.find(d => d.kind === 'fullMonth')
      : undefined
    if (!fullMonth?.isEarned) {
      issues.push('Option 4A amended v2 month did not award fullMonth discovery at 29/29.')
    }

    findings.push(
      makeFinding(
        'withdrawal-unavailable-state',
        'Emergency withdrawal and unavailable slot states (Option 4A)',
        'WITHDRAWAL_AND_UNAVAILABLE_STATE',
        issues.length === 0,
        issues.length === 0
          ? 'Withdrawn slots project as unavailable without leaking retracted content and preserve 29/29 progress.'
          : issues.join(' '),
        auditMarkers,
        extraSecrets,
        issues,
      ),
    )
  }

  // 12. Direct-slug-guess protection (neutral 404 byte-identical)
  {
    const midMonthDate = new Date('2098-03-10T15:00:00.000Z')
    const embargoedRes = await projectors.handleGatewayRequest(
      new Request('http://localhost/api/challenges/r08a-stg-2098-03-day-20', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      env,
      {
        getNow: () => midMonthDate,
        fetchImpl: createOfflineMockFetch(() => bundle.futureChallenge209803Day20),
      },
    )
    const nonexistentRes = await projectors.handleGatewayRequest(
      new Request('http://localhost/api/challenges/nonexistent-guessed-slug-xyz', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      env,
      {
        getNow: () => midMonthDate,
        fetchImpl: createOfflineMockFetch(() => null),
      },
    )
    const embargoedBody = await embargoedRes.text()
    const nonexistentBody = await nonexistentRes.text()

    const issues: string[] = []
    if (embargoedRes.status !== 404 || nonexistentRes.status !== 404) {
      issues.push(`Expected 404 for both embargoed (${embargoedRes.status}) and nonexistent (${nonexistentRes.status}) slugs.`)
    }
    if (embargoedBody !== nonexistentBody) {
      issues.push('Embargoed slug 404 body was not byte-identical to nonexistent slug 404 body.')
    }
    if (embargoedRes.headers.get('Cache-Control') !== 'no-store') {
      issues.push('404 response missing Cache-Control: no-store.')
    }

    findings.push(
      makeFinding(
        'direct-slug-guess',
        'Direct slug guesses return byte-identical neutral 404 with no-store',
        'DIRECT_SLUG_GUESS_PROTECTION',
        issues.length === 0,
        issues.length === 0
          ? 'Embargoed and nonexistent slug probes return byte-identical neutral 404 responses.'
          : issues.join(' '),
        auditMarkers,
        extraSecrets,
        issues,
      ),
    )
  }

  // 13. Malformed timezone input & clock manipulation immunity (Option 1C)
  {
    const issues: string[] = []
    const testUtc = new Date('2098-04-01T09:00:00.000Z')
    const malformedZones = [
      null,
      undefined,
      '',
      '   ',
      '+14:00',
      '-05:00',
      'GMT+14',
      'UTC+2',
      'Mars/Olympus',
      'A'.repeat(65),
    ]
    for (const tz of malformedZones) {
      const resolved = resolveAuthorizedReaderDate(testUtc, tz)
      if (!resolved.usedFallback || resolved.effectiveTimeZone !== DEFAULT_RELEASE_TIME_ZONE) {
        issues.push(`Malformed timezone "${String(tz)}" did not fall back to ${DEFAULT_RELEASE_TIME_ZONE}.`)
      }
    }

    // Client Date header & query override immunity + UTC+14 ceiling
    const spoofedRes = await projectors.handleGatewayRequest(
      new Request('http://localhost/api/challenges/r08a-stg-2098-03-day-20?now=2099-12-31', {
        headers: {
          Date: 'Thu, 31 Dec 2099 23:59:59 GMT',
          'X-Bibleberry-Timezone': 'Pacific/Kiritimati',
        },
      }),
      env,
      {
        getNow: () => new Date('2098-03-10T15:00:00.000Z'),
        fetchImpl: createOfflineMockFetch(() => bundle.futureChallenge209803Day20),
      },
    )
    if (spoofedRes.status !== 404) {
      issues.push(`Client clock spoof or UTC+14 unlocked Day 20 on Mar 10 (status ${spoofedRes.status}).`)
    }

    findings.push(
      makeFinding(
        'timezone-fallback-and-ceiling',
        'Malformed timezone fallback and server clock / UTC+14 ceiling',
        'TIMEZONE_AUTHORIZATION_FALLBACK',
        issues.length === 0,
        issues.length === 0
          ? 'Malformed timezones fall back to America/New_York and client clock spoofs are ignored.'
          : issues.join(' '),
        auditMarkers,
        extraSecrets,
        issues,
      ),
    )
  }

  // 14. Unpublished / unreviewed / unapproved-block content exclusion
  {
    const issues: string[] = []
    const activeDate = new Date('2098-03-10T15:00:00.000Z')
    const cases: Array<[string, Record<string, unknown>]> = [
      ['draft', bundle.draftChallengeDoc],
      ['unreviewed', bundle.unreviewedChallengeDoc],
      ['unapprovedBlock', bundle.unapprovedBlockChallengeDoc],
    ]
    for (const [label, doc] of cases) {
      const res = await projectors.handleGatewayRequest(
        new Request('http://localhost/api/challenges/r08a-stg-2098-03-day-05', {
          headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
        }),
        env,
        {
          getNow: () => activeDate,
          fetchImpl: createOfflineMockFetch(() => doc),
        },
      )
      const text = await res.text()
      if (res.status !== 404) {
        issues.push(`Expected 404 for ${label} Challenge, received ${res.status}.`)
      }
      const leaked = assertNoLeakedMarkers([text], auditMarkers)
      if (leaked.length > 0) {
        issues.push(`Leaked marker IDs in ${label} response: ${leaked.join(', ')}.`)
      }
    }

    findings.push(
      makeFinding(
        'unpublished-content-exclusion',
        'Draft, unreviewed, and unapproved-block content fails closed',
        'UNPUBLISHED_CONTENT_EXCLUSION',
        issues.length === 0,
        issues.length === 0
          ? 'Draft, unreviewed, and unapproved-block Challenges return 404 with zero leakage.'
          : issues.join(' '),
        auditMarkers,
        extraSecrets,
        issues,
      ),
    )
  }

  // 15. Unauthorized projection & integrity failure cases
  {
    const issues: string[] = []
    const ctxApr20 = serverContextFor('2098-04-20')
    const dupProj = projectors.validateAndProjectMonthDetail(
      bundle.duplicateSlotDetailDoc,
      '2098-04',
      ctxApr20,
    )
    const foreignProj = projectors.validateAndProjectMonthDetail(
      bundle.foreignSlotDetailDoc,
      '2098-04',
      ctxApr20,
    )
    if (dupProj.ok) {
      issues.push('Duplicate intra-month slot reference was not rejected.')
    }
    if (foreignProj.ok) {
      issues.push('Foreign-month slot reference was not rejected.')
    }

    const missingTokenEnv = {
      SANITY_PROJECT_ID: env.SANITY_PROJECT_ID,
      SANITY_DATASET: env.SANITY_DATASET,
      SANITY_READ_TOKEN: '',
    }
    const missingTokenRes = await projectors.handleGatewayRequest(
      new Request('http://localhost/api/months/2098-03'),
      missingTokenEnv,
    )
    if (missingTokenRes.status !== 500) {
      issues.push(`Expected 500 when SANITY_READ_TOKEN is missing, received ${missingTokenRes.status}.`)
    }

    findings.push(
      makeFinding(
        'unauthorized-projection-fail-closed',
        'Duplicate/foreign slot integrity errors and missing auth fail closed',
        'UNAUTHORIZED_PROJECTION_FAIL_CLOSED',
        issues.length === 0,
        issues.length === 0
          ? 'Integrity violations and missing gateway credentials fail closed.'
          : issues.join(' '),
        auditMarkers,
        extraSecrets,
        issues,
      ),
    )
  }

  return buildReport(findings, executedAtUtc)
}

function serverContextFor(authorizedLocalDate: string): GatewayServerContext {
  return {
    authorizedLocalDate,
    effectiveTimeZone: DEFAULT_RELEASE_TIME_ZONE,
  }
}

function projectLibrarySafe(
  projector: typeof validateAndProjectLibraryMonthSummary,
  doc: Record<string, unknown>,
  authorizedLocalDate: string,
): unknown {
  const res = projector(doc, serverContextFor(authorizedLocalDate))
  return res.ok ? res.document : null
}
