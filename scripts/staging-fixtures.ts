#!/usr/bin/env node
/**
 * Guarded Staging Fixture Setup Mechanism for Milestone R05 Stage 3B.3A.
 *
 * SAFETY INVARIANTS:
 * 1. DRY-RUN BY DEFAULT: Does not perform network mutations unless `--apply` is explicitly passed.
 * 2. STRICT TARGET PINNING: Hard-coded to project `80016lrq` and dataset `staging`.
 *    Immediately aborts if targeted at `production` or any other project/dataset.
 * 3. EXPLICIT SEPARATE ADMINISTRATIVE WRITE CREDENTIAL: Requires `SANITY_WRITE_TOKEN`
 *    supplied only via local environment variable. Refuses command-line argument tokens.
 * 4. COMPREHENSIVE PREFLIGHT (perspective=raw): Queries both published and draft documents
 *    as well as slug conflicts. Fails closed if any conflict exists or if the query
 *    response is malformed.
 * 5. POST-MUTATION READBACK VERIFICATION (perspective=raw): Queries the raw documents
 *    after mutation to verify exact creation and critical field invariants.
 * 6. CREATE-ONLY TOOL: Never updates, mutates, or deletes existing records. Destructive
 *    teardown is disarmed in code and governed by documented operator procedure.
 * 7. CREDENTIAL ISOLATION: Never prints, logs, or transmits tokens in output or logs.
 */

import {
  ALL_SYNTHETIC_STAGING_DOCUMENTS,
  ALL_SYNTHETIC_DOCUMENT_IDS,
  SYNTHETIC_SERIES_ID,
  type SyntheticChallengeDocument,
} from '../src/gateway/fixtures/stagingAcceptanceFixtures.ts'

export const EXPECTED_PROJECT_ID = '80016lrq'
export const EXPECTED_DATASET = 'staging'
export const SANITY_API_VERSION = '2026-11-01'

export interface TargetValidationResult {
  valid: boolean
  error?: string
}

export function validateStagingTarget(env: {
  SANITY_PROJECT_ID?: string
  SANITY_DATASET?: string
}): TargetValidationResult {
  const projectId = env.SANITY_PROJECT_ID ?? EXPECTED_PROJECT_ID
  const dataset = env.SANITY_DATASET ?? EXPECTED_DATASET

  if (projectId !== EXPECTED_PROJECT_ID) {
    return {
      valid: false,
      error: `Prohibited project ID '${projectId}'. Fixture setup strictly restricted to '${EXPECTED_PROJECT_ID}'.`,
    }
  }

  if (dataset !== EXPECTED_DATASET) {
    return {
      valid: false,
      error: `Prohibited dataset '${dataset}'. Fixture setup strictly restricted to private '${EXPECTED_DATASET}' dataset. Never write to production!`,
    }
  }

  return { valid: true }
}

export function checkCliArguments(args: string[]): {
  apply: boolean
  help: boolean
  securityViolation?: string
} {
  let apply = false
  let help = false

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg === '--apply') {
      apply = true
    } else if (arg === '--teardown') {
      return {
        apply: false,
        help: false,
        securityViolation:
          'Safety error: Executable teardown is disabled in this tool to prevent accidental deletion. Clean up synthetic fixtures only through documented, separately authorized operator procedures (see docs/architecture/r05-stage3-infrastructure-runbook.md §10.6).',
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
        apply: false,
        help: false,
        securityViolation:
          'Security error: Do not supply tokens via CLI arguments (avoids process table and history leaks). Set SANITY_WRITE_TOKEN in your local protected shell environment.',
      }
    }
  }

  return { apply, help }
}

export interface StagingExecutionOptions {
  args?: string[]
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
}

export interface StagingExecutionResult {
  success: boolean
  dryRun: boolean
  mode: 'setup'
  actionCount: number
  message: string
  details?: Record<string, unknown>
}

/**
 * Validates critical fields of readback synthetic documents.
 */
function verifyReadbackDocuments(
  readbackDocs: Array<Record<string, unknown>>,
): { verified: boolean; errors: string[] } {
  const errors: string[] = []
  const docMap = new Map<string, Record<string, unknown>>()
  const docMapByBaseId = new Map<string, Record<string, unknown>>()

  for (const d of readbackDocs) {
    if (typeof d._id === 'string') {
      docMap.set(d._id, d)
      const baseId = d._id.replace(/^drafts\./, '')
      docMapByBaseId.set(baseId, d)
    }
  }

  if (docMap.size !== ALL_SYNTHETIC_STAGING_DOCUMENTS.length) {
    errors.push(
      `Expected ${ALL_SYNTHETIC_STAGING_DOCUMENTS.length} documents in raw readback, found ${docMap.size}.`,
    )
  }

  for (const expected of ALL_SYNTHETIC_STAGING_DOCUMENTS) {
    const actual = docMap.get(expected._id)
    if (!actual) {
      const baseId = expected._id.replace(/^drafts\./, '')
      const altActual = docMapByBaseId.get(baseId)
      if (altActual && altActual._id !== expected._id) {
        const expectedIsDraft = expected._id.startsWith('drafts.')
        const actualIsDraft = typeof altActual._id === 'string' && altActual._id.startsWith('drafts.')
        errors.push(
          `Document ${expected._id} draft status mismatch: expected ${expectedIsDraft ? 'draft' : 'published'}, got ${actualIsDraft ? 'draft' : 'published'} (${altActual._id}).`,
        )
        continue
      }
      errors.push(`Document ${expected._id} is missing from raw readback verification.`)
      continue
    }

    // Draft vs published status distinction
    const expectedIsDraft = expected._id.startsWith('drafts.')
    const actualIsDraft = typeof actual._id === 'string' && actual._id.startsWith('drafts.')
    if (expectedIsDraft !== actualIsDraft) {
      errors.push(
        `Document ${expected._id} draft status mismatch: expected ${expectedIsDraft ? 'draft' : 'published'}, got ${actualIsDraft ? 'draft' : 'published'}.`,
      )
    }

    if (actual._type !== expected._type) {
      errors.push(`Document ${expected._id} type mismatch: expected ${expected._type}, got ${actual._type}.`)
    }

    const actualSlug = typeof actual.slug === 'string' ? actual.slug : (actual.slug as { current?: string } | undefined)?.current
    if (actualSlug !== expected.slug.current) {
      errors.push(`Document ${expected._id} slug mismatch: expected ${expected.slug.current}, got ${actualSlug}.`)
    }

    if (expected._type === 'challenge') {
      const expChal = expected as SyntheticChallengeDocument
      if (actual.releaseAt !== expChal.releaseAt) {
        errors.push(`Document ${expected._id} releaseAt mismatch: expected ${expChal.releaseAt}, got ${actual.releaseAt}.`)
      }

      if (actual.sequence !== expChal.sequence) {
        errors.push(`Document ${expected._id} sequence mismatch: expected ${expChal.sequence}, got ${actual.sequence}.`)
      }

      const seriesRef = (actual.series as { _ref?: string } | undefined)?._ref
      if (seriesRef !== SYNTHETIC_SERIES_ID) {
        errors.push(`Document ${expected._id} series ref mismatch: expected ${SYNTHETIC_SERIES_ID}, got ${seriesRef}.`)
      }

      const primScrip = actual.primaryScripture as Record<string, unknown> | undefined
      if (primScrip?.textStatus !== 'referenceOnly' || primScrip?.practiceStatus !== 'notConfigured' || primScrip?.passage !== undefined) {
        errors.push(`Document ${expected._id} primaryScripture violates reference-only invariants in readback.`)
      }

      const review = actual.editorialReview as Record<string, unknown> | undefined
      if (review?.adaptationReviewed !== expChal.editorialReview.adaptationReviewed) {
        errors.push(`Document ${expected._id} adaptationReviewed mismatch in readback.`)
      }

      if (expChal.editorialReview.reviewNotes) {
        if (!review?.reviewNotes || typeof review.reviewNotes !== 'string' || !review.reviewNotes.includes('SIMULATED SYNTHETIC ELIGIBILITY')) {
          errors.push(`Document ${expected._id} missing expected synthetic fixture review note in readback.`)
        }
      }

      // Screen and structured block content verification
      const actualScreens = Array.isArray(actual.screens)
        ? (actual.screens as Array<Record<string, unknown>>)
        : null

      if (!actualScreens) {
        errors.push(`Document ${expected._id} screens array is missing or malformed in readback.`)
      } else {
        if (actualScreens.length !== expChal.screens.length) {
          errors.push(
            `Document ${expected._id} screen count mismatch: expected ${expChal.screens.length}, got ${actualScreens.length}.`,
          )
        }

        for (let sIdx = 0; sIdx < expChal.screens.length; sIdx++) {
          const expScreen = expChal.screens[sIdx]
          const actScreen = actualScreens[sIdx]
          if (!actScreen) {
            errors.push(`Document ${expected._id} screen[${sIdx}] missing in readback.`)
            continue
          }

          if (actScreen._key !== expScreen._key) {
            errors.push(
              `Document ${expected._id} screen[${sIdx}] key mismatch: expected '${expScreen._key}', got '${actScreen._key}'.`,
            )
          }
          if (actScreen._type !== expScreen._type) {
            errors.push(
              `Document ${expected._id} screen[${sIdx}] type mismatch: expected '${expScreen._type}', got '${actScreen._type}'.`,
            )
          }

          const actBlocks = Array.isArray(actScreen.blocks)
            ? (actScreen.blocks as Array<Record<string, unknown>>)
            : null

          if (!actBlocks) {
            errors.push(
              `Document ${expected._id} screen[${sIdx}] blocks array is missing or malformed in readback.`,
            )
            continue
          }

          if (actBlocks.length !== expScreen.blocks.length) {
            errors.push(
              `Document ${expected._id} screen[${sIdx}] block count mismatch: expected ${expScreen.blocks.length}, got ${actBlocks.length}.`,
            )
          }

          for (let bIdx = 0; bIdx < expScreen.blocks.length; bIdx++) {
            const expBlock = expScreen.blocks[bIdx]
            const actBlock = actBlocks[bIdx]
            if (!actBlock) {
              errors.push(
                `Document ${expected._id} screen[${sIdx}] block[${bIdx}] missing in readback.`,
              )
              continue
            }

            if (actBlock._key !== expBlock._key) {
              errors.push(
                `Document ${expected._id} screen[${sIdx}] block[${bIdx}] key mismatch: expected '${expBlock._key}', got '${actBlock._key}'.`,
              )
            }
            if (actBlock._type !== expBlock._type) {
              errors.push(
                `Document ${expected._id} screen[${sIdx}] block[${bIdx}] type mismatch: expected '${expBlock._type}', got '${actBlock._type}'.`,
              )
            }

            // Verify block reviewStatus if defined on expected block (critical for Fixture F and A)
            if (typeof expBlock.reviewStatus === 'string') {
              if (actBlock.reviewStatus !== expBlock.reviewStatus) {
                errors.push(
                  `Document ${expected._id} block '${expBlock._key}' reviewStatus mismatch: expected '${expBlock.reviewStatus}', got '${actBlock.reviewStatus}'.`,
                )
              }
            }

            // Verify nested scriptures in optionalStudyBlock if present
            if (expBlock._type === 'optionalStudyBlock' && Array.isArray(expBlock.scriptures)) {
              const actScriptures = Array.isArray(actBlock.scriptures)
                ? (actBlock.scriptures as Array<Record<string, unknown>>)
                : null

              if (!actScriptures || actScriptures.length !== expBlock.scriptures.length) {
                errors.push(
                  `Document ${expected._id} block '${expBlock._key}' nested scriptures count mismatch.`,
                )
              } else {
                for (let scIdx = 0; scIdx < expBlock.scriptures.length; scIdx++) {
                  const expSc = expBlock.scriptures[scIdx] as Record<string, unknown>
                  const actSc = actScriptures[scIdx]
                  if (actSc._key !== expSc._key) {
                    errors.push(
                      `Document ${expected._id} block '${expBlock._key}' scripture[${scIdx}] key mismatch: expected '${expSc._key}', got '${actSc._key}'.`,
                    )
                  }
                  if (actSc.textStatus !== 'referenceOnly' || actSc.passage !== undefined) {
                    errors.push(
                      `Document ${expected._id} block '${expBlock._key}' scripture '${expSc._key}' violates reference-only scripture invariants.`,
                    )
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return { verified: errors.length === 0, errors }
}

export async function executeStagingFixtures(
  options: StagingExecutionOptions = {},
): Promise<StagingExecutionResult> {
  const env = options.env ?? process.env
  const args = options.args ?? process.argv.slice(2)
  const fetchImpl = options.fetchImpl ?? fetch

  // 1. Argument validation & security check
  const cli = checkCliArguments(args)
  if (cli.securityViolation) {
    return {
      success: false,
      dryRun: !cli.apply,
      mode: 'setup',
      actionCount: 0,
      message: cli.securityViolation,
    }
  }

  if (cli.help) {
    return {
      success: true,
      dryRun: true,
      mode: 'setup',
      actionCount: 0,
      message: [
        'Bibleberry Staging Fixture Setup Tool (R05 Stage 3B.3A)',
        '',
        'Usage:',
        '  node scripts/staging-fixtures.ts         # Dry-run inspection (default)',
        '  node scripts/staging-fixtures.ts --apply # Authoritative setup (requires SANITY_WRITE_TOKEN in env)',
        '',
        'Environment variables:',
        '  SANITY_WRITE_TOKEN  Administrative Sanity write token (required only when --apply is passed)',
        '  SANITY_PROJECT_ID   Must match 80016lrq if specified',
        '  SANITY_DATASET      Must match staging if specified (production is strictly rejected)',
      ].join('\n'),
    }
  }

  // 2. Strict target validation
  const targetCheck = validateStagingTarget(env)
  if (!targetCheck.valid) {
    return {
      success: false,
      dryRun: !cli.apply,
      mode: 'setup',
      actionCount: 0,
      message: targetCheck.error ?? 'Target validation failed.',
    }
  }

  // 3. Dry-Run Mode (Default when --apply is omitted)
  if (!cli.apply) {
    const lines = [
      '========================================================================',
      ' Bibleberry Guarded Staging Fixture Setup — DRY RUN (No writes performed)',
      '========================================================================',
      `Target Project:  ${EXPECTED_PROJECT_ID}`,
      `Target Dataset:  ${EXPECTED_DATASET} (Private)`,
      'Mode:            SETUP (Create-only installation)',
      '',
      `Synthetic Document Manifest (${ALL_SYNTHETIC_STAGING_DOCUMENTS.length} records):`,
      ...ALL_SYNTHETIC_STAGING_DOCUMENTS.map((doc, idx) => {
        const isChallenge = doc._type === 'challenge'
        const slug = (doc as { slug: { current: string } }).slug.current
        const releaseAt = isChallenge ? (doc as { releaseAt: string }).releaseAt : 'N/A'
        return `  ${idx + 1}. [${doc._type}] ${doc._id} (slug: ${slug}, releaseAt: ${releaseAt})`
      }),
      '',
      'SAFETY CHECKPOINT:',
      '  • Zero network mutations were issued.',
      '  • Production dataset is protected by strict hard-coded rejection.',
      '  • When authorized by Aaron after PR review, supply SANITY_WRITE_TOKEN securely via env:',
      '      read -s -p "Enter SANITY_WRITE_TOKEN: " SANITY_WRITE_TOKEN; echo; export SANITY_WRITE_TOKEN',
      '      node --experimental-strip-types scripts/staging-fixtures.ts --apply',
      '========================================================================',
    ]

    return {
      success: true,
      dryRun: true,
      mode: 'setup',
      actionCount: ALL_SYNTHETIC_STAGING_DOCUMENTS.length,
      message: lines.join('\n'),
      details: {
        targetProject: EXPECTED_PROJECT_ID,
        targetDataset: EXPECTED_DATASET,
        documentIds: ALL_SYNTHETIC_DOCUMENT_IDS,
      },
    }
  }

  // 4. Authoritative Write Mode (--apply)
  const writeToken = env.SANITY_WRITE_TOKEN?.trim()
  if (!writeToken) {
    return {
      success: false,
      dryRun: false,
      mode: 'setup',
      actionCount: 0,
      message:
        'Error: --apply requested, but SANITY_WRITE_TOKEN is not set in the local environment.\n' +
        'Supply the administrative write token via SANITY_WRITE_TOKEN environment variable (never on CLI arguments).',
    }
  }

  // Pre-flight check: query Sanity staging dataset for existing documents using perspective=raw
  // Checks both IDs and draft IDs as well as slug conflicts
  const queryUrl = new URL(
    `https://${EXPECTED_PROJECT_ID}.api.sanity.io/v${SANITY_API_VERSION}/data/query/${EXPECTED_DATASET}`,
  )
  queryUrl.searchParams.set(
    'query',
    `*[_id in $ids || _id in $draftIds || slug.current in $slugs]{ _id, "slug": slug.current, _type }`,
  )
  queryUrl.searchParams.set('perspective', 'raw')

  const draftIds = ALL_SYNTHETIC_STAGING_DOCUMENTS.map(d =>
    d._id.startsWith('drafts.') ? d._id : `drafts.${d._id}`,
  )
  const slugs = ALL_SYNTHETIC_STAGING_DOCUMENTS.map(d => d.slug.current)

  queryUrl.searchParams.set('$ids', JSON.stringify(ALL_SYNTHETIC_DOCUMENT_IDS))
  queryUrl.searchParams.set('$draftIds', JSON.stringify(draftIds))
  queryUrl.searchParams.set('$slugs', JSON.stringify(slugs))

  let queryResponse: Response
  try {
    queryResponse = await fetchImpl(queryUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${writeToken}`,
        Accept: 'application/json',
      },
    })
  } catch (err) {
    return {
      success: false,
      dryRun: false,
      mode: 'setup',
      actionCount: 0,
      message: `Failed to connect to Sanity staging dataset: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  if (!queryResponse.ok) {
    return {
      success: false,
      dryRun: false,
      mode: 'setup',
      actionCount: 0,
      message: `Sanity pre-flight query failed with HTTP ${queryResponse.status} ${queryResponse.statusText}. Verify SANITY_WRITE_TOKEN has access to ${EXPECTED_PROJECT_ID}/${EXPECTED_DATASET}.`,
    }
  }

  let queryPayload: unknown
  try {
    queryPayload = await queryResponse.json()
  } catch {
    return {
      success: false,
      dryRun: false,
      mode: 'setup',
      actionCount: 0,
      message: 'Sanity pre-flight query returned a malformed non-JSON payload. Aborting to prevent silent corruption.',
    }
  }

  if (
    !queryPayload ||
    typeof queryPayload !== 'object' ||
    !Array.isArray((queryPayload as Record<string, unknown>).result)
  ) {
    return {
      success: false,
      dryRun: false,
      mode: 'setup',
      actionCount: 0,
      message: 'Sanity pre-flight query response is missing a valid result array. Aborting to prevent silent corruption.',
    }
  }

  const existingDocs = (queryPayload as { result: Array<{ _id?: string; slug?: string; _type?: string }> }).result

  // If any matching documents exist (published or draft or slug collision), abort
  if (existingDocs.length > 0) {
    return {
      success: false,
      dryRun: false,
      mode: 'setup',
      actionCount: 0,
      message:
        `ABORT: Staging dataset already contains ${existingDocs.length} conflicting document(s) matching synthetic IDs or slugs (detected with perspective=raw):\n` +
        existingDocs
          .map(d => `  • ID: ${d._id ?? 'unknown'}, Slug: ${d.slug ?? 'unknown'}, Type: ${d._type ?? 'unknown'}`)
          .join('\n') +
        '\nTo prevent conflicting or stale state, refusing to overwrite. Follow the authorized operator cleanup procedure before creating new fixtures.',
    }
  }

  // 5. Send createIfNotExists mutations
  const mutateUrl = `https://${EXPECTED_PROJECT_ID}.api.sanity.io/v${SANITY_API_VERSION}/data/mutate/${EXPECTED_DATASET}`
  const createMutations = ALL_SYNTHETIC_STAGING_DOCUMENTS.map(doc => ({
    createIfNotExists: doc,
  }))

  let mutateResponse: Response
  try {
    mutateResponse = await fetchImpl(mutateUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${writeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mutations: createMutations }),
    })
  } catch (err) {
    return {
      success: false,
      dryRun: false,
      mode: 'setup',
      actionCount: 0,
      message: `Failed to post mutation to Sanity staging dataset: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  if (!mutateResponse.ok) {
    return {
      success: false,
      dryRun: false,
      mode: 'setup',
      actionCount: 0,
      message: `Sanity setup mutation failed with HTTP ${mutateResponse.status} ${mutateResponse.statusText}.`,
    }
  }

  // 6. Post-Mutation Readback Verification with perspective=raw
  const readbackUrl = new URL(
    `https://${EXPECTED_PROJECT_ID}.api.sanity.io/v${SANITY_API_VERSION}/data/query/${EXPECTED_DATASET}`,
  )
  readbackUrl.searchParams.set(
    'query',
    `*[_id in $ids]{
      _id,
      _type,
      title,
      "slug": slug.current,
      sequence,
      releaseAt,
      editorialReview,
      screens,
      series,
      primaryScripture
    }`,
  )
  readbackUrl.searchParams.set('perspective', 'raw')
  readbackUrl.searchParams.set('$ids', JSON.stringify(ALL_SYNTHETIC_DOCUMENT_IDS))

  let readbackResponse: Response
  try {
    readbackResponse = await fetchImpl(readbackUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${writeToken}`,
        Accept: 'application/json',
      },
    })
  } catch (err) {
    return {
      success: false,
      dryRun: false,
      mode: 'setup',
      actionCount: 0,
      message: `Post-mutation readback query failed with network error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  if (!readbackResponse.ok) {
    return {
      success: false,
      dryRun: false,
      mode: 'setup',
      actionCount: 0,
      message: `Post-mutation readback query returned HTTP ${readbackResponse.status} ${readbackResponse.statusText}. Verification incomplete.`,
    }
  }

  let readbackPayload: unknown
  try {
    readbackPayload = await readbackResponse.json()
  } catch {
    return {
      success: false,
      dryRun: false,
      mode: 'setup',
      actionCount: 0,
      message: 'Post-mutation readback returned malformed non-JSON payload. Verification failed.',
    }
  }

  const readbackResult = (readbackPayload as { result?: Array<Record<string, unknown>> })?.result
  if (!Array.isArray(readbackResult)) {
    return {
      success: false,
      dryRun: false,
      mode: 'setup',
      actionCount: 0,
      message: 'Post-mutation readback response is missing result array. Verification failed.',
    }
  }

  const verification = verifyReadbackDocuments(readbackResult)
  if (!verification.verified) {
    return {
      success: false,
      dryRun: false,
      mode: 'setup',
      actionCount: 0,
      message:
        `Post-mutation readback verification FAILED (${verification.errors.length} errors):\n` +
        verification.errors.map(e => `  • ${e}`).join('\n') +
        '\nDo not treat mutations as successful.',
      details: { errors: verification.errors },
    }
  }

  return {
    success: true,
    dryRun: false,
    mode: 'setup',
    actionCount: createMutations.length,
    message: `Successfully verified ${ALL_SYNTHETIC_STAGING_DOCUMENTS.length} synthetic acceptance documents present in staging dataset (${EXPECTED_DATASET}) with perspective=raw readback.`,
    details: {
      verifiedIds: ALL_SYNTHETIC_DOCUMENT_IDS,
      readbackCount: readbackResult.length,
    },
  }
}

// ---------------------------------------------------------------------------
// CLI Execution
// ---------------------------------------------------------------------------

async function runCli(): Promise<void> {
  const result = await executeStagingFixtures()
  if (result.message) {
    if (result.success) {
      console.log(result.message)
    } else {
      console.error(result.message)
    }
  }
  process.exit(result.success ? 0 : 1)
}

const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith('staging-fixtures.ts') || process.argv[1].endsWith('staging-fixtures.js'))

if (isMainModule) {
  runCli().catch(err => {
    console.error('Fatal unhandled error:', err)
    process.exit(1)
  })
}
