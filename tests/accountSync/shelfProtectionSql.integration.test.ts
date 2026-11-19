import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import {
  coordinateGuestSync,
  parseAccountId,
} from '../../src/accountSync/index.ts'
import type {
  AccountTransportCommitPayload,
  AccountTransportCommitResult,
  AuthorizedAccountSession,
  AuthorizedAccountTransport,
  CommitAckReceipt,
  ProposedAccountParticipationEnvelope,
} from '../../src/accountSync/index.ts'
import type { GuestParticipationEnvelopeV2 } from '../../src/participation/types.ts'
import {
  parseLocalCalendarDate,
  parsePublicationYearMonth,
} from '../../src/participation/identity.ts'

const databaseUrl = process.env.LOCAL_TEST_DATABASE_URL

function assertLocalDatabaseUrl(value: string): void {
  for (const setting of ['PGHOST', 'PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE']) {
    assert.equal(process.env[setting], undefined, `${setting} must be unset for the local-only test`)
  }
  assert.match(value, /^postgres(?:ql)?:\/\//, 'Use an explicit local PostgreSQL URL')

  const url = new URL(value)
  assert.equal(url.searchParams.has('service'), false, 'PostgreSQL service aliases are not allowed')
  assert.equal(url.searchParams.has('hostaddr'), false, 'Explicit host addresses are not allowed')
  const destinations = [url.hostname, ...url.searchParams.getAll('host')].filter(Boolean)
  assert.ok(destinations.length > 0, 'Specify an explicit local socket or loopback host')

  for (const destination of destinations) {
    assert.equal(destination.includes(','), false, 'Multiple PostgreSQL destinations are not allowed')
    assert.ok(
      destination.startsWith('/')
        || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(destination.toLowerCase()),
      'PostgreSQL target must be a local socket or loopback host',
    )
  }
}

function runPsql(sql: string): string {
  if (!databaseUrl) throw new Error('LOCAL_TEST_DATABASE_URL is required')
  const result = spawnSync(
    'psql',
    [databaseUrl, '-XAtq', '-v', 'ON_ERROR_STOP=1'],
    { encoding: 'utf8', input: sql, maxBuffer: 1024 * 1024 },
  )
  if (result.error || result.status !== 0) {
    throw new Error(`Local PostgreSQL command failed: ${result.stderr || result.error?.message || 'unknown error'}`)
  }
  return result.stdout.trim()
}

function queryAsAccount(accountId: string, query: string): string {
  return runPsql(`
BEGIN;
SET LOCAL request.jwt.claim.sub = '${accountId}';
SET LOCAL ROLE authenticated;
SELECT ${query};
COMMIT;
`)
}

function sqlJson(value: unknown): string {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`
}

class LocalSqlAccountTransport implements AuthorizedAccountTransport {
  async getAccount(session: AuthorizedAccountSession) {
    const snapshot = JSON.parse(
      queryAsAccount(session.accountId, 'public.get_account_participation()'),
    ) as {
      status: string
      reason?: string
      revision?: number
      envelope?: ProposedAccountParticipationEnvelope
    }

    if (snapshot.status === 'notFound') {
      return { status: 'notFound' as const, accountId: session.accountId }
    }
    if (snapshot.status === 'found' && snapshot.envelope && snapshot.revision !== undefined) {
      return {
        status: 'found' as const,
        envelope: snapshot.envelope,
        revision: snapshot.revision,
      }
    }
    return {
      status: 'unauthorized' as const,
      reason: 'forbidden' as const,
      message: `Local account read failed (${snapshot.reason ?? snapshot.status})`,
    }
  }

  async commitAccount(
    session: AuthorizedAccountSession,
    payload: AccountTransportCommitPayload,
  ): Promise<AccountTransportCommitResult> {
    const envelope = {
      schemaVersion: payload.envelope.schemaVersion,
      namespace: payload.envelope.namespace,
      revision: payload.envelope.revision,
      data: payload.envelope.data,
    }
    const response = JSON.parse(queryAsAccount(
      session.accountId,
      `public.reconcile_guest_participation(${sqlJson({
        accountId: payload.accountId,
        expectedRevision: payload.expectedRevision,
        envelope,
        idempotencyKey: payload.idempotencyKey,
        guestPayloadFingerprint: payload.guestPayloadFingerprint,
        mode: payload.mode,
        unresolvedItems: payload.unresolvedItems ?? [],
      })})`,
    )) as {
      status: string
      reason?: string
      message?: string
      receipt?: CommitAckReceipt
      committedEnvelope?: ProposedAccountParticipationEnvelope
    }

    if (
      response.status === 'committed'
      && response.receipt
      && response.committedEnvelope
    ) {
      return {
        status: 'committed',
        receipt: response.receipt,
        committedEnvelope: response.committedEnvelope,
      }
    }
    if (response.status === 'conflict') {
      return {
        status: 'conflict',
        reason: 'revisionMismatch',
        message: response.message ?? 'Local PostgreSQL revision conflict',
      }
    }
    if (response.status === 'unauthorized') {
      return {
        status: 'unauthorized',
        reason: 'forbidden',
        message: response.message ?? 'Local PostgreSQL authorization failed',
      }
    }
    return {
      status: 'rejected',
      reason: 'invalidPayload',
      message: `${response.reason ?? response.status}: ${response.message ?? 'Local PostgreSQL rejected the transaction'}`,
    }
  }
}

function makeEmptyGuestEnvelope(): GuestParticipationEnvelopeV2 {
  return {
    schemaVersion: 2,
    namespace: 'cms',
    data: {
      completedChallenges: {},
      inProgressChallenges: {},
      savedChallenges: {},
      savedScriptures: [],
      lastOpenedChallenge: null,
      earnedAwards: {},
    },
  }
}

test(
  'coordinator preserves explicit Shelf protection through SQL reconciliation and account readback',
  { skip: databaseUrl ? false : 'Set LOCAL_TEST_DATABASE_URL to a fresh local database after running the R13-TX1 harness' },
  async () => {
    assert.ok(databaseUrl)
    assertLocalDatabaseUrl(databaseUrl)

    const accountId = parseAccountId(randomUUID())!
    runPsql(`INSERT INTO auth.users (id) VALUES ('${accountId}');`)

    const outcome = await coordinateGuestSync(
      new LocalSqlAccountTransport(),
      {
        session: { accountId },
        guest: {
          envelope: makeEmptyGuestEnvelope(),
          shelf: {
            months: [
              {
                yearMonth: parsePublicationYearMonth('2026-10')!,
                admissionKind: 'autoAdmitted',
                isProtected: true,
                admittedOn: parseLocalCalendarDate('2026-11-17')!,
              },
              {
                yearMonth: parsePublicationYearMonth('2026-09')!,
                admissionKind: 'readerSelected',
                isProtected: false,
                admittedOn: parseLocalCalendarDate('2026-11-17')!,
              },
              {
                yearMonth: parsePublicationYearMonth('2026-08')!,
                admissionKind: 'readerSelected',
                admittedOn: parseLocalCalendarDate('2026-11-17')!,
              },
            ],
            activeFocusMonth: parsePublicationYearMonth('2026-09')!,
            updatedOn: parseLocalCalendarDate('2026-11-17')!,
          },
        },
        mode: 'newAccountTransfer',
      },
      { idempotencyKey: `shelf-protection-${randomUUID()}` },
    )

    assert.equal(outcome.ok, true, outcome.message)
    assert.equal(outcome.status, 'committed')
    assert.equal(outcome.committedRevision, 1)

    const readback = await new LocalSqlAccountTransport().getAccount({ accountId })
    assert.equal(readback.status, 'found')
    if (readback.status === 'found') {
      assert.deepEqual(
        readback.envelope.data.shelf?.months.map(({ yearMonth, admissionKind, isProtected }) => ({
          yearMonth,
          admissionKind,
          isProtected,
        })),
        [
          { yearMonth: '2026-10', admissionKind: 'autoAdmitted', isProtected: true },
          { yearMonth: '2026-09', admissionKind: 'readerSelected', isProtected: false },
          { yearMonth: '2026-08', admissionKind: 'readerSelected', isProtected: true },
        ],
      )
      assert.equal(readback.envelope.data.shelf?.activeFocusMonth, '2026-09')
    }
  },
)
