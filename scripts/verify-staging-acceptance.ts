#!/usr/bin/env node
/**
 * Staging Acceptance Verification Harness for Milestone R05 Stage 3B.3A.
 *
 * READ-ONLY SAFETY GUARANTEES:
 * 1. Strictly read-only: performs only GET and HEAD requests.
 * 2. Never requires or prompts for the Worker's `SANITY_READ_TOKEN` secret.
 * 3. Supports anonymous perimeter verification and authenticated Cloudflare Access checks.
 * 4. Deterministically validates catalog and detail outcomes (Cases A through F).
 * 5. Honest status reporting: PASS, FAIL, SKIP, INCONCLUSIVE.
 * 6. Cloudflare Access 302 Location inspection: verifies redirect to Access login.
 * 7. Positive control privacy validation: distinguishes 401/403 (proven private),
 *    200 with 0 records (requires positive control proof), and 200 with records (failure).
 * 8. Network errors fail closed (FAIL or INCONCLUSIVE, never PASS).
 */

import {
  FIXTURE_A_ID,
  FIXTURE_A_SLUG,
  FIXTURE_B_SLUG,
  FIXTURE_C_SLUG,
  FIXTURE_D_SLUG,
  FIXTURE_F_SLUG,
  NONEXISTENT_SLUG,
} from '../src/gateway/fixtures/stagingAcceptanceFixtures.ts'

export const DEFAULT_STAGING_URL = 'https://bibleberry-staging.aw-e44.workers.dev'
export const DEFAULT_SANITY_PROJECT_ID = '80016lrq'
export const DEFAULT_SANITY_DATASET = 'staging'
export const SANITY_API_VERSION = '2026-11-01'

export type CheckStatus = 'PASS' | 'FAIL' | 'SKIP' | 'INCONCLUSIVE'

export interface CheckResult {
  id: string
  name: string
  status: CheckStatus
  passed: boolean
  httpStatus?: number
  expectedStatus?: number | string
  message: string
  details?: Record<string, unknown>
}

export interface VerificationOptions {
  stagingUrl?: string
  sanityProjectId?: string
  sanityDataset?: string
  accessClientId?: string
  accessClientSecret?: string
  perimeterOnly?: boolean
  fixtureAPresentInStaging?: boolean
  fetchImpl?: typeof fetch
}

export interface VerificationRunResult {
  passed: boolean
  results: CheckResult[]
  summary: string
  counts: {
    passed: number
    failed: number
    skipped: number
    inconclusive: number
    total: number
  }
}

export async function runStagingVerification(
  options: VerificationOptions = {},
): Promise<VerificationRunResult> {
  const stagingUrl = (options.stagingUrl ?? DEFAULT_STAGING_URL).replace(/\/+$/, '')
  const sanityProjectId = options.sanityProjectId ?? DEFAULT_SANITY_PROJECT_ID
  const sanityDataset = options.sanityDataset ?? DEFAULT_SANITY_DATASET
  const accessClientId = options.accessClientId ?? process.env.CF_ACCESS_CLIENT_ID
  const accessClientSecret = options.accessClientSecret ?? process.env.CF_ACCESS_CLIENT_SECRET
  const perimeterOnly = Boolean(options.perimeterOnly)
  const fixtureAPresentInStaging = Boolean(options.fixtureAPresentInStaging)
  const fetchImpl = options.fetchImpl ?? fetch

  const results: CheckResult[] = []
  const hasAccessCredentials = Boolean(accessClientId && accessClientSecret)

  const accessHeaders: Record<string, string> = hasAccessCredentials
    ? {
        'CF-Access-Client-Id': accessClientId!,
        'CF-Access-Client-Secret': accessClientSecret!,
      }
    : {}

  // -------------------------------------------------------------------------
  // Check 1: Direct Unauthenticated Sanity Query Denial / Privacy Enforcement
  // -------------------------------------------------------------------------
  try {
    const query = `*[_id == "${FIXTURE_A_ID}" || _type == "challenge"]`
    const sanityUrl = new URL(
      `https://${sanityProjectId}.api.sanity.io/v${SANITY_API_VERSION}/data/query/${sanityDataset}`,
    )
    sanityUrl.searchParams.set('query', query)

    const sanityRes = await fetchImpl(sanityUrl.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    if (sanityRes.status === 401 || sanityRes.status === 403) {
      results.push({
        id: 'sanity-direct-denial',
        name: 'Direct unauthenticated Sanity query is denied (dataset private)',
        status: 'PASS',
        passed: true,
        httpStatus: sanityRes.status,
        expectedStatus: '401, 403, or 200 with 0 records against verified seeded dataset',
        message: `Direct unauthenticated Sanity query failed closed with HTTP ${sanityRes.status} (private dataset access denied).`,
      })
    } else if (sanityRes.status === 200) {
      let payload: { result?: unknown[] } | null = null
      try {
        payload = (await sanityRes.json()) as { result?: unknown[] }
      } catch {
        payload = null
      }

      if (!payload || !Array.isArray(payload.result)) {
        results.push({
          id: 'sanity-direct-denial',
          name: 'Direct unauthenticated Sanity query is denied (dataset private)',
          status: 'FAIL',
          passed: false,
          httpStatus: 200,
          expectedStatus: '401, 403, or 200 with 0 records',
          message: 'Sanity query returned HTTP 200 with malformed JSON body (no result array).',
        })
      } else {
        const records = payload.result
        if (records.length > 0) {
          results.push({
            id: 'sanity-direct-denial',
            name: 'Direct unauthenticated Sanity query is denied (dataset private)',
            status: 'FAIL',
            passed: false,
            httpStatus: 200,
            expectedStatus: '401, 403, or 200 with 0 records',
            message: `SECURITY FAILURE: Direct unauthenticated Sanity query exposed ${records.length} records!`,
            details: { exposedRecordCount: records.length },
          })
        } else if (fixtureAPresentInStaging) {
          results.push({
            id: 'sanity-direct-denial',
            name: 'Direct unauthenticated Sanity query is denied (dataset private)',
            status: 'PASS',
            passed: true,
            httpStatus: 200,
            expectedStatus: '401, 403, or 200 with 0 records',
            message:
              'Direct unauthenticated Sanity query returned HTTP 200 with 0 records while positive control Fixture A is present; unauthenticated read restriction verified.',
          })
        } else {
          results.push({
            id: 'sanity-direct-denial',
            name: 'Direct unauthenticated Sanity query is denied (dataset private)',
            status: 'INCONCLUSIVE',
            passed: false,
            httpStatus: 200,
            expectedStatus: '401, 403, or 200 with 0 records against verified seeded dataset',
            message:
              'Direct unauthenticated Sanity query returned HTTP 200 with 0 records, but dataset is unverified or empty without positive control (Fixture A). Confirm Fixture A is seeded to prove private read restrictions, or verify 401/403.',
          })
        }
      }
    } else {
      results.push({
        id: 'sanity-direct-denial',
        name: 'Direct unauthenticated Sanity query is denied (dataset private)',
        status: 'FAIL',
        passed: false,
        httpStatus: sanityRes.status,
        expectedStatus: '401, 403, or 200 with 0 records',
        message: `Unexpected HTTP ${sanityRes.status} from direct Sanity query.`,
      })
    }
  } catch (err) {
    results.push({
      id: 'sanity-direct-denial',
      name: 'Direct unauthenticated Sanity query is denied (dataset private)',
      status: 'FAIL',
      passed: false,
      message: `Network error connecting to direct Sanity API: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  // Helper for Cloudflare Access redirect checks
  const verifyAccessPerimeter = async (
    checkId: string,
    checkName: string,
    url: string,
  ): Promise<CheckResult> => {
    try {
      const res = await fetchImpl(url, {
        method: 'GET',
        redirect: 'manual',
      })

      if (res.status === 401 || res.status === 403) {
        return {
          id: checkId,
          name: checkName,
          status: 'PASS',
          passed: true,
          httpStatus: res.status,
          expectedStatus: '302 (to Access login), 401, or 403',
          message: `Anonymous request blocked with HTTP ${res.status} (Access perimeter active).`,
        }
      }

      if (res.status === 302) {
        const location = res.headers.get('Location') ?? res.headers.get('location') ?? ''
        const isAccessLogin =
          location.includes('.cloudflareaccess.com') ||
          location.includes('cdn-cgi/access/login')

        if (isAccessLogin) {
          return {
            id: checkId,
            name: checkName,
            status: 'PASS',
            passed: true,
            httpStatus: 302,
            expectedStatus: '302 (to Access login), 401, or 403',
            message: `Anonymous request redirected to Cloudflare Access login (${location}).`,
            details: { location },
          }
        }

        return {
          id: checkId,
          name: checkName,
          status: 'FAIL',
          passed: false,
          httpStatus: 302,
          expectedStatus: '302 (to Access login), 401, or 403',
          message: `Anonymous request returned 302 redirecting to unexpected location (${location || 'none'}), not Cloudflare Access login.`,
          details: { location },
        }
      }

      return {
        id: checkId,
        name: checkName,
        status: 'FAIL',
        passed: false,
        httpStatus: res.status,
        expectedStatus: '302 (to Access login), 401, or 403',
        message: `SECURITY WARNING: Anonymous request returned HTTP ${res.status}! Expected Cloudflare Access login redirect or denial.`,
      }
    } catch (err) {
      return {
        id: checkId,
        name: checkName,
        status: 'FAIL',
        passed: false,
        message: `Network error verifying perimeter: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  // -------------------------------------------------------------------------
  // Check 2: Anonymous Cloudflare Access Perimeter (Root SPA)
  // -------------------------------------------------------------------------
  results.push(
    await verifyAccessPerimeter(
      'perimeter-anonymous-root',
      'Anonymous root SPA access is blocked by Cloudflare Access',
      `${stagingUrl}/`,
    ),
  )

  // -------------------------------------------------------------------------
  // Check 3: Anonymous Cloudflare Access Perimeter (API Endpoint)
  // -------------------------------------------------------------------------
  results.push(
    await verifyAccessPerimeter(
      'perimeter-anonymous-api',
      'Anonymous /api/challenges access is blocked by Cloudflare Access',
      `${stagingUrl}/api/challenges`,
    ),
  )

  // -------------------------------------------------------------------------
  // Authenticated Gateway Checks
  // -------------------------------------------------------------------------
  const detailCases = [
    { slug: FIXTURE_A_SLUG, expectedStatus: 200, label: 'Fixture A (Released)' },
    { slug: FIXTURE_B_SLUG, expectedStatus: 404, label: 'Fixture B (Future embargoed)' },
    { slug: FIXTURE_C_SLUG, expectedStatus: 404, label: 'Fixture C (Unreviewed)' },
    { slug: FIXTURE_D_SLUG, expectedStatus: 404, label: 'Fixture D (Draft-only)' },
    { slug: FIXTURE_F_SLUG, expectedStatus: 404, label: 'Fixture F (Unapproved block)' },
    { slug: NONEXISTENT_SLUG, expectedStatus: 404, label: 'Case E (Nonexistent slug)' },
  ]

  if (!hasAccessCredentials) {
    // Record explicit SKIP for catalog and all detail checks
    results.push({
      id: 'gateway-catalog-outcomes',
      name: 'Authenticated GET /api/challenges correctly admits A and excludes B, C, D, F',
      status: 'SKIP',
      passed: false,
      expectedStatus: 200,
      message:
        'Skipped: CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET not provided in environment. Requires Cloudflare Access Service Token with Service Auth policy.',
    })

    for (const item of detailCases) {
      results.push({
        id: `gateway-detail-${item.slug}`,
        name: `Detail check for ${item.label} (${item.slug})`,
        status: 'SKIP',
        passed: false,
        expectedStatus: item.expectedStatus,
        message:
          'Skipped: CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET not provided in environment.',
      })
    }
  } else {
    // 4A. Authenticated Catalog Request
    let catalogContainsA = false
    try {
      const catalogRes = await fetchImpl(`${stagingUrl}/api/challenges`, {
        method: 'GET',
        headers: { ...accessHeaders, Accept: 'application/json' },
      })

      const cacheControl = catalogRes.headers.get('Cache-Control')
      const hasNoStore = cacheControl?.includes('no-store') === true

      let catalogPayload: { ok?: boolean; challenges?: Array<{ slug?: string; _id?: string }> } = {}
      try {
        catalogPayload = (await catalogRes.json()) as {
          ok?: boolean
          challenges?: Array<{ slug?: string; _id?: string }>
        }
      } catch {
        // payload parse failure
      }

      const challenges = catalogPayload.challenges ?? []
      const slugs = challenges.map(c => c.slug)

      const containsA = slugs.includes(FIXTURE_A_SLUG)
      const excludesB = !slugs.includes(FIXTURE_B_SLUG)
      const excludesC = !slugs.includes(FIXTURE_C_SLUG)
      const excludesD = !slugs.includes(FIXTURE_D_SLUG) && !challenges.some(c => c._id?.startsWith('drafts.'))
      const excludesF = !slugs.includes(FIXTURE_F_SLUG)

      catalogContainsA = containsA

      const catalogPassed =
        catalogRes.status === 200 &&
        hasNoStore &&
        catalogPayload.ok === true &&
        containsA &&
        excludesB &&
        excludesC &&
        excludesD &&
        excludesF

      results.push({
        id: 'gateway-catalog-outcomes',
        name: 'Authenticated GET /api/challenges correctly admits A and excludes B, C, D, F',
        status: catalogPassed ? 'PASS' : 'FAIL',
        passed: catalogPassed,
        httpStatus: catalogRes.status,
        expectedStatus: 200,
        message: catalogPassed
          ? 'Catalog returned HTTP 200, Cache-Control: no-store, admits Challenge A, and strictly excludes B, C, D, F.'
          : `Catalog validation failed: status=${catalogRes.status}, noStore=${hasNoStore}, containsA=${containsA}, excludesB=${excludesB}, excludesC=${excludesC}, excludesD=${excludesD}, excludesF=${excludesF}`,
        details: { returnedSlugs: slugs, cacheControl },
      })
    } catch (err) {
      results.push({
        id: 'gateway-catalog-outcomes',
        name: 'Authenticated GET /api/challenges correctly admits A and excludes B, C, D, F',
        status: 'FAIL',
        passed: false,
        message: `Error verifying catalog: ${err instanceof Error ? err.message : String(err)}`,
      })
    }

    // If Check 1 was INCONCLUSIVE because positive control wasn't confirmed upfront,
    // but the authenticated gateway catalog confirmed Fixture A is present in staging:
    if (catalogContainsA) {
      const sanityCheck = results.find(r => r.id === 'sanity-direct-denial')
      if (sanityCheck && sanityCheck.status === 'INCONCLUSIVE') {
        sanityCheck.status = 'PASS'
        sanityCheck.passed = true
        sanityCheck.message =
          'Direct unauthenticated Sanity query returned HTTP 200 with 0 records while positive control Fixture A is confirmed present by gateway; unauthenticated read restriction verified.'
      }
    }

    // 4B. Detail Checks for Cases A through F
    for (const item of detailCases) {
      try {
        const detailRes = await fetchImpl(`${stagingUrl}/api/challenges/${item.slug}`, {
          method: 'GET',
          headers: { ...accessHeaders, Accept: 'application/json' },
        })

        const cacheControl = detailRes.headers.get('Cache-Control')
        const hasNoStore = cacheControl?.includes('no-store') === true

        let detailPayload: Record<string, unknown> = {}
        try {
          detailPayload = (await detailRes.json()) as Record<string, unknown>
        } catch {
          // ignore
        }

        let payloadValid = false
        if (item.expectedStatus === 200) {
          const challenge = detailPayload.challenge as Record<string, unknown> | undefined
          const review = challenge?.editorialEligibility as Record<string, unknown> | undefined
          const hasLeakedNotes =
            typeof (challenge as Record<string, unknown> | undefined)?.reviewNotes === 'string' ||
            typeof review?.reviewNotes === 'string'
          payloadValid =
            detailPayload.ok === true &&
            challenge?.slug === item.slug &&
            review?.adaptationReviewed === true &&
            !hasLeakedNotes
        } else {
          const error = detailPayload.error as Record<string, unknown> | undefined
          payloadValid =
            detailPayload.ok === false &&
            error?.kind === 'notFound' &&
            detailPayload.challenge === undefined
        }

        const passed = detailRes.status === item.expectedStatus && hasNoStore && payloadValid

        results.push({
          id: `gateway-detail-${item.slug}`,
          name: `Detail check for ${item.label} (${item.slug})`,
          status: passed ? 'PASS' : 'FAIL',
          passed,
          httpStatus: detailRes.status,
          expectedStatus: item.expectedStatus,
          message: passed
            ? `Returned HTTP ${detailRes.status}, Cache-Control: no-store, zero leakage.`
            : `Detail check failed for ${item.slug}: status=${detailRes.status} (expected ${item.expectedStatus}), noStore=${hasNoStore}, payloadValid=${payloadValid}`,
        })
      } catch (err) {
        results.push({
          id: `gateway-detail-${item.slug}`,
          name: `Detail check for ${item.label} (${item.slug})`,
          status: 'FAIL',
          passed: false,
          message: `Network error checking detail: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }
  }

  const counts = {
    passed: results.filter(r => r.status === 'PASS').length,
    failed: results.filter(r => r.status === 'FAIL').length,
    skipped: results.filter(r => r.status === 'SKIP').length,
    inconclusive: results.filter(r => r.status === 'INCONCLUSIVE').length,
    total: results.length,
  }

  // Honest overall evaluation:
  // In perimeter-only mode: requires perimeter checks to pass, with zero failures/inconclusive.
  // In full mode: requires ALL checks to pass (no SKIP, no FAIL, no INCONCLUSIVE).
  const overallPassed = perimeterOnly
    ? counts.failed === 0 && counts.inconclusive === 0 && counts.passed > 0
    : counts.failed === 0 &&
      counts.inconclusive === 0 &&
      counts.skipped === 0 &&
      counts.passed === counts.total

  return {
    passed: overallPassed,
    results,
    counts,
    summary: formatSummary(results, perimeterOnly, hasAccessCredentials, overallPassed),
  }
}

function formatSummary(
  results: CheckResult[],
  perimeterOnly: boolean,
  hasAccessCredentials: boolean,
  overallPassed: boolean,
): string {
  const counts = {
    passed: results.filter(r => r.status === 'PASS').length,
    failed: results.filter(r => r.status === 'FAIL').length,
    skipped: results.filter(r => r.status === 'SKIP').length,
    inconclusive: results.filter(r => r.status === 'INCONCLUSIVE').length,
    total: results.length,
  }

  const lines = [
    '========================================================================',
    ` Bibleberry Staging Acceptance Verification Results (${counts.passed}/${counts.total} Passed, ${counts.skipped} Skipped, ${counts.failed} Failed, ${counts.inconclusive} Inconclusive)`,
    '========================================================================',
    ...results.map(r => `  [${r.status}] ${r.name}\n         ${r.message}`),
    '========================================================================',
    perimeterOnly
      ? `Mode: --perimeter-only active. Anonymous perimeter verification ${overallPassed ? 'SUCCEEDED' : 'FAILED'}.`
      : hasAccessCredentials
        ? `Mode: Full authenticated acceptance run ${overallPassed ? 'SUCCEEDED' : 'FAILED'}.`
        : 'Mode: Full acceptance check FAILED CLOSED (authenticated checks SKIPPED due to missing CF Access credentials). Supply CF_ACCESS_CLIENT_ID & CF_ACCESS_CLIENT_SECRET, or pass --perimeter-only.',
    '========================================================================',
  ]
  return lines.join('\n')
}

// CLI Execution
async function runCli(): Promise<void> {
  const args = process.argv.slice(2)
  const perimeterOnly = args.includes('--perimeter-only')

  const result = await runStagingVerification({ perimeterOnly })
  console.log(result.summary)
  process.exit(result.passed ? 0 : 1)
}

const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith('verify-staging-acceptance.ts') ||
    process.argv[1].endsWith('verify-staging-acceptance.js'))

if (isMainModule) {
  runCli().catch(err => {
    console.error('Fatal unhandled error:', err)
    process.exit(1)
  })
}
