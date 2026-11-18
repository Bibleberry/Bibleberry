import assert from 'node:assert/strict'
import test from 'node:test'
import { runMonthlyPublicationAudit } from '../../scripts/releaseAudit/auditor.ts'
import { parseAuditCliArgs } from '../../scripts/releaseAudit/cli.ts'
import {
  AUDIT_FIXTURE_MARKERS,
  buildAuditFixtureBundle,
  validateAuditFixtureBundle,
} from '../../scripts/releaseAudit/fixtures.ts'
import { sanitizeAuditText } from '../../scripts/releaseAudit/redaction.ts'
import {
  formatAuditReportHuman,
  formatAuditReportJson,
} from '../../scripts/releaseAudit/reporter.ts'
import type { AuditFixtureBundle } from '../../scripts/releaseAudit/types.ts'

test('offline audit passes all 15 checks with zero network calls and zero leaked sentinel tokens', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => {
    throw new Error('Network calls are forbidden during offline confidentiality audit')
  }

  try {
    const report = await runMonthlyPublicationAudit()
    assert.equal(report.ok, true)
    assert.equal(report.mode, 'offline-synthetic')
    assert.equal(report.summary.total, 15)
    assert.equal(report.summary.passed, 15)
    assert.equal(report.summary.failed, 0)

    const jsonOutput = formatAuditReportJson(report)
    const humanOutput = formatAuditReportHuman(report)
    assert.ok(humanOutput.includes('Status: PASS (15/15 checks passed, 0 failed)'))

    const parsedJson = JSON.parse(jsonOutput) as typeof report
    assert.equal(parsedJson.ok, true)
    assert.equal(parsedJson.findings.length, 15)

    for (const marker of AUDIT_FIXTURE_MARKERS) {
      assert.equal(
        jsonOutput.includes(marker.token),
        false,
        `JSON report leaked secret marker ${marker.markerId}`,
      )
      assert.equal(
        humanOutput.includes(marker.token),
        false,
        `Human report leaked secret marker ${marker.markerId}`,
      )
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('audit fails clearly with AUTHORIZATION_CONTEXT_REQUIRED when credentials or server clock are missing/invalid', async () => {
  const missingEnvReport = await runMonthlyPublicationAudit({ env: null })
  assert.equal(missingEnvReport.ok, false)
  assert.equal(missingEnvReport.findings[0]?.contract, 'AUTHORIZATION_CONTEXT_REQUIRED')
  assert.equal(missingEnvReport.findings[0]?.status, 'FAIL')

  const missingTokenReport = await runMonthlyPublicationAudit({
    env: {
      SANITY_PROJECT_ID: '80016lrq',
      SANITY_DATASET: 'staging',
      SANITY_READ_TOKEN: '',
    },
  })
  assert.equal(missingTokenReport.ok, false)
  assert.equal(missingTokenReport.findings[0]?.contract, 'AUTHORIZATION_CONTEXT_REQUIRED')

  const invalidClockReport = await runMonthlyPublicationAudit({
    serverNowUtc: new Date('not-a-date'),
  })
  assert.equal(invalidClockReport.ok, false)
  assert.equal(invalidClockReport.findings[0]?.contract, 'AUTHORIZATION_CONTEXT_REQUIRED')
})

test('audit fails clearly with FIXTURE_INTEGRITY_VALIDATION when fixture bundle is invalid', async () => {
  const invalidCheck = validateAuditFixtureBundle(null)
  assert.equal(invalidCheck.ok, false)

  const partialBundle = { bundleId: 'broken' } as unknown as AuditFixtureBundle
  const report = await runMonthlyPublicationAudit({ fixtures: partialBundle })
  assert.equal(report.ok, false)
  assert.equal(report.findings[0]?.contract, 'FIXTURE_INTEGRITY_VALIDATION')
  assert.equal(report.findings[0]?.status, 'FAIL')
})

test('audit fails clearly with FIXTURE_INTEGRITY_VALIDATION when a required secret marker is dropped or duplicated', async () => {
  const base = buildAuditFixtureBundle()

  const droppedMarkerBundle: AuditFixtureBundle = {
    ...base,
    secretMarkers: base.secretMarkers.slice(1),
  }
  const droppedReport = await runMonthlyPublicationAudit({ fixtures: droppedMarkerBundle })
  assert.equal(droppedReport.ok, false)
  assert.equal(droppedReport.summary.passed, 0)
  assert.equal(droppedReport.summary.failed, 1)
  assert.equal(droppedReport.findings.length, 1)
  assert.equal(droppedReport.findings[0]?.contract, 'FIXTURE_INTEGRITY_VALIDATION')
  assert.equal(droppedReport.findings[0]?.status, 'FAIL')

  const unrelatedOnlyBundle: AuditFixtureBundle = {
    ...base,
    secretMarkers: [{ markerId: 'unrelated_only', token: 'UNRELATED_TOKEN' }],
  }
  const unrelatedCheck = validateAuditFixtureBundle(unrelatedOnlyBundle)
  assert.equal(unrelatedCheck.ok, false)

  const duplicateMarkerBundle: AuditFixtureBundle = {
    ...base,
    secretMarkers: [...base.secretMarkers, base.secretMarkers[0]!],
  }
  const duplicateCheck = validateAuditFixtureBundle(duplicateMarkerBundle)
  assert.equal(duplicateCheck.ok, false)

  const missingInjectionBundle: AuditFixtureBundle = {
    ...base,
    draftChallengeDoc: { _id: 'drafts.empty' },
  }
  const missingInjectionCheck = validateAuditFixtureBundle(missingInjectionBundle)
  assert.equal(missingInjectionCheck.ok, false)
})

test('auditor detects and redacts leaked welcomeScreen, future Challenge body, hidden discovery mapping, and unrewarded card art', async () => {
  const bundle = buildAuditFixtureBundle()

  // Tamper with handleGatewayRequest to simulate a regression where preview leaks welcomeScreen
  // and future Challenge leaks embargoed body, and detail/progress leaks discovery mapping & card art.
  const tamperedReport = await runMonthlyPublicationAudit({
    fixtures: bundle,
    projectors: {
      handleGatewayRequest: async request => {
        const url = new URL(request.url)
        if (url.pathname.endsWith('/preview')) {
          return new Response(
            JSON.stringify({
              ok: true,
              month: {
                monthId: '2098-03',
                introduction: {
                  version: 'v1',
                  previewScreens: [],
                  welcomeScreen: { title: 'SENTINEL_PREMATURE_WELCOME_SCREEN' },
                },
                slots: [],
              },
            }),
            { status: 200 },
          )
        }
        if (url.pathname === '/api/challenges/r08a-stg-2098-03-day-20') {
          return new Response(
            JSON.stringify({
              ok: true,
              challenge: { text: 'SENTINEL_FUTURE_BODY_2098_03_20' },
            }),
            { status: 200 },
          )
        }
        if (url.pathname === '/api/months/2098-03') {
          return new Response(
            JSON.stringify({
              ok: true,
              month: {
                discoveries: [{ qualifyingChallengeIds: ['x'] }],
              },
            }),
            { status: 200 },
          )
        }
        if (url.pathname === '/api/months/2098-03/progress') {
          return new Response(
            JSON.stringify({
              ok: true,
              completedInMonthCount: 1,
              discoveries: [
                {
                  isEarned: false,
                  earnedCard: {
                    imageUrl:
                      'https://cdn.sanity.io/images/80016lrq/staging/SENTINEL_UNEARNED_CARD_ART_URL.png',
                  },
                },
              ],
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ ok: false }), { status: 404 })
      },
    },
  })

  assert.equal(tamperedReport.ok, false)
  const failedContracts = new Set(
    tamperedReport.findings.filter(f => f.status === 'FAIL').map(f => f.contract),
  )
  assert.equal(failedContracts.has('ADVANCE_PREVIEW_ALLOWLIST'), true)
  assert.equal(failedContracts.has('EMBARGOED_CHALLENGE_BODY_LEAK'), true)
  assert.equal(failedContracts.has('HIDDEN_DISCOVERY_MAPPING_LEAK'), true)
  assert.equal(failedContracts.has('UNREWARDED_CARD_ARTWORK_LEAK'), true)

  // Verify the failure report itself never echoes raw sentinel strings
  const reportText = formatAuditReportJson(tamperedReport) + formatAuditReportHuman(tamperedReport)
  for (const marker of AUDIT_FIXTURE_MARKERS) {
    assert.equal(reportText.includes(marker.token), false)
  }
})

test('unrewarded-card-artwork fails closed when progress endpoint returns non-200 or omits discoveries array', async () => {
  const bundle = buildAuditFixtureBundle()

  const failingStatusReport = await runMonthlyPublicationAudit({
    fixtures: bundle,
    projectors: {
      handleGatewayRequest: async request => {
        const url = new URL(request.url)
        if (url.pathname === '/api/months/2098-03/progress') {
          return new Response(JSON.stringify({ ok: false, error: 'progress unavailable' }), {
            status: 500,
          })
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      },
    },
  })

  assert.equal(failingStatusReport.ok, false)
  const artFindingOn500 = failingStatusReport.findings.find(
    f => f.contract === 'UNREWARDED_CARD_ARTWORK_LEAK',
  )
  assert.ok(artFindingOn500)
  assert.equal(artFindingOn500.status, 'FAIL')

  const missingDiscoveriesReport = await runMonthlyPublicationAudit({
    fixtures: bundle,
    projectors: {
      handleGatewayRequest: async request => {
        const url = new URL(request.url)
        if (url.pathname === '/api/months/2098-03/progress') {
          return new Response(JSON.stringify({ ok: true, completedInMonthCount: 0 }), {
            status: 200,
          })
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      },
    },
  })

  assert.equal(missingDiscoveriesReport.ok, false)
  const artFindingOnMissingDiscoveries = missingDiscoveriesReport.findings.find(
    f => f.contract === 'UNREWARDED_CARD_ARTWORK_LEAK',
  )
  assert.ok(artFindingOnMissingDiscoveries)
  assert.equal(artFindingOnMissingDiscoveries.status, 'FAIL')
})

test('sanitizeAuditText redacts secret markers and extra secret tokens', () => {
  const input = 'Leak SENTINEL_FUTURE_BODY_2098_03_20 and my-secret-token-123'
  const sanitized = sanitizeAuditText(input, AUDIT_FIXTURE_MARKERS, ['my-secret-token-123'])
  assert.equal(sanitized.includes('SENTINEL_FUTURE_BODY_2098_03_20'), false)
  assert.equal(sanitized.includes('my-secret-token-123'), false)
  assert.equal(sanitized.includes('[REDACTED:embargoed_future_challenge_body]'), true)
  assert.equal(sanitized.includes('[REDACTED_MARKER]'), true)
})

test('parseAuditCliArgs validates --format options and rejects unknown flags', () => {
  assert.deepEqual(parseAuditCliArgs([]), { format: 'both' })
  assert.deepEqual(parseAuditCliArgs(['--format', 'json']), { format: 'json' })
  assert.deepEqual(parseAuditCliArgs(['--format=human']), { format: 'human' })
  assert.throws(() => parseAuditCliArgs(['--format', 'xml']))
  assert.throws(() => parseAuditCliArgs(['--unknown']))
})
