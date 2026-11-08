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
 * 4. CONFLICT DETECTION & ZERO OVERWRITES: In create mode, checks for existing documents
 *    and aborts if any ID collisions exist. Strictly uses `createIfNotExists`.
 *    Never mutates or updates existing records.
 * 5. CREDENTIAL ISOLATION: Never prints, logs, or transmits tokens in output or logs.
 */

import {
  ALL_SYNTHETIC_STAGING_DOCUMENTS,
  ALL_SYNTHETIC_DOCUMENT_IDS,
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
  teardown: boolean
  help: boolean
  securityViolation?: string
} {
  let apply = false
  let teardown = false
  let help = false

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg === '--apply') {
      apply = true
    } else if (arg === '--teardown') {
      teardown = true
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
        teardown: false,
        help: false,
        securityViolation:
          'Security error: Do not supply tokens via CLI arguments (avoids process table and history leaks). Set SANITY_WRITE_TOKEN in your local protected shell environment.',
      }
    }
  }

  return { apply, teardown, help }
}

export interface StagingExecutionOptions {
  args?: string[]
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
}

export interface StagingExecutionResult {
  success: boolean
  dryRun: boolean
  mode: 'setup' | 'teardown'
  actionCount: number
  message: string
  details?: Record<string, unknown>
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
      mode: cli.teardown ? 'teardown' : 'setup',
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
        '  node scripts/staging-fixtures.ts                # Dry-run inspection (default)',
        '  node scripts/staging-fixtures.ts --apply        # Authoritative setup (requires SANITY_WRITE_TOKEN)',
        '  node scripts/staging-fixtures.ts --teardown --apply # Clean up synthetic fixtures',
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
      mode: cli.teardown ? 'teardown' : 'setup',
      actionCount: 0,
      message: targetCheck.error ?? 'Target validation failed.',
    }
  }

  const mode = cli.teardown ? 'teardown' : 'setup'

  // 3. Dry-Run Mode (Default when --apply is omitted)
  if (!cli.apply) {
    const lines = [
      '========================================================================',
      ' Bibleberry Guarded Staging Fixture Setup — DRY RUN (No writes performed)',
      '========================================================================',
      `Target Project:  ${EXPECTED_PROJECT_ID}`,
      `Target Dataset:  ${EXPECTED_DATASET} (Private)`,
      `Mode:            ${mode === 'teardown' ? 'TEARDOWN (Synthetic document removal)' : 'SETUP (Create-only installation)'}`,
      '',
      `Synthetic Document Manifest (${ALL_SYNTHETIC_STAGING_DOCUMENTS.length} records):`,
      ...ALL_SYNTHETIC_STAGING_DOCUMENTS.map((doc, idx) => {
        const isChallenge = doc._type === 'challenge'
        const slug = isChallenge ? (doc as { slug: { current: string } }).slug.current : (doc as { slug: { current: string } }).slug.current
        const releaseAt = isChallenge ? (doc as { releaseAt: string }).releaseAt : 'N/A'
        return `  ${idx + 1}. [${doc._type}] ${doc._id} (slug: ${slug}, releaseAt: ${releaseAt})`
      }),
      '',
      'SAFETY CHECKPOINT:',
      '  • Zero network mutations were issued.',
      '  • Production dataset is protected by strict hard-coded rejection.',
      '  • When authorized by Aaron after PR review, run with:',
      '      SANITY_WRITE_TOKEN="<token>" node --experimental-strip-types scripts/staging-fixtures.ts --apply',
      '========================================================================',
    ]

    return {
      success: true,
      dryRun: true,
      mode,
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
      mode,
      actionCount: 0,
      message:
        'Error: --apply requested, but SANITY_WRITE_TOKEN is not set in the local environment.\n' +
        'Supply the administrative write token via SANITY_WRITE_TOKEN environment variable (never on CLI arguments).',
    }
  }

  // Pre-flight check: query Sanity staging dataset for existing documents
  const queryUrl = new URL(
    `https://${EXPECTED_PROJECT_ID}.api.sanity.io/v${SANITY_API_VERSION}/data/query/${EXPECTED_DATASET}`,
  )
  queryUrl.searchParams.set(
    'query',
    `*[_id in $ids]{ _id, _type }`,
  )
  queryUrl.searchParams.set('$ids', JSON.stringify(ALL_SYNTHETIC_DOCUMENT_IDS))

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
      mode,
      actionCount: 0,
      message: `Failed to connect to Sanity staging dataset: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  if (!queryResponse.ok) {
    return {
      success: false,
      dryRun: false,
      mode,
      actionCount: 0,
      message: `Sanity pre-flight query failed with HTTP ${queryResponse.status} ${queryResponse.statusText}. Verify SANITY_WRITE_TOKEN has access to ${EXPECTED_PROJECT_ID}/${EXPECTED_DATASET}.`,
    }
  }

  const queryPayload = (await queryResponse.json()) as {
    result?: Array<{ _id: string; _type: string }>
  }
  const existingDocs = queryPayload.result ?? []
  const existingIds = existingDocs.map(d => d._id)

  const mutateUrl = `https://${EXPECTED_PROJECT_ID}.api.sanity.io/v${SANITY_API_VERSION}/data/mutate/${EXPECTED_DATASET}`

  // 5. Handle Teardown Mode
  if (mode === 'teardown') {
    if (existingIds.length === 0) {
      return {
        success: true,
        dryRun: false,
        mode: 'teardown',
        actionCount: 0,
        message: 'No synthetic documents found in staging dataset to tear down.',
      }
    }

    // Safety guard: only delete IDs that strictly match synthetic namespace
    const safeToDelete = existingIds.filter(
      id => id.startsWith('r05-3b-') || id.startsWith('drafts.r05-3b-'),
    )

    const deleteMutations = safeToDelete.map(id => ({
      delete: { id },
    }))

    const mutateResponse = await fetchImpl(mutateUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${writeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mutations: deleteMutations }),
    })

    if (!mutateResponse.ok) {
      return {
        success: false,
        dryRun: false,
        mode: 'teardown',
        actionCount: 0,
        message: `Sanity teardown mutation failed with HTTP ${mutateResponse.status} ${mutateResponse.statusText}.`,
      }
    }

    return {
      success: true,
      dryRun: false,
      mode: 'teardown',
      actionCount: safeToDelete.length,
      message: `Successfully deleted ${safeToDelete.length} synthetic acceptance documents from staging dataset.`,
      details: { deletedIds: safeToDelete },
    }
  }

  // 6. Handle Setup Mode
  // If any documents already exist, abort to prevent silent overwrites
  if (existingIds.length > 0) {
    return {
      success: false,
      dryRun: false,
      mode: 'setup',
      actionCount: 0,
      message:
        `ABORT: Staging dataset already contains ${existingIds.length} synthetic document ID(s):\n` +
        existingIds.map(id => `  • ${id}`).join('\n') +
        '\nTo prevent conflicting or stale state, refusing to overwrite. Run with `--teardown --apply` first to remove prior fixtures if authorized.',
    }
  }

  // Build createIfNotExists mutations for each synthetic document
  const createMutations = ALL_SYNTHETIC_STAGING_DOCUMENTS.map(doc => ({
    createIfNotExists: doc,
  }))

  const mutateResponse = await fetchImpl(mutateUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${writeToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mutations: createMutations }),
  })

  if (!mutateResponse.ok) {
    return {
      success: false,
      dryRun: false,
      mode: 'setup',
      actionCount: 0,
      message: `Sanity setup mutation failed with HTTP ${mutateResponse.status} ${mutateResponse.statusText}.`,
    }
  }

  return {
    success: true,
    dryRun: false,
    mode: 'setup',
    actionCount: createMutations.length,
    message: `Successfully created ${createMutations.length} synthetic acceptance documents in staging dataset (${EXPECTED_DATASET}).`,
    details: { createdIds: ALL_SYNTHETIC_DOCUMENT_IDS },
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

// Run CLI when executed directly
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith('staging-fixtures.ts') || process.argv[1].endsWith('staging-fixtures.js'))

if (isMainModule) {
  runCli().catch(err => {
    console.error('Fatal unhandled error:', err)
    process.exit(1)
  })
}
