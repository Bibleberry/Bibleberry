import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import {
  createAccountSessionController,
  createMockAuthProvider,
  isSessionExpired,
  isValidSixDigitOtpCode,
  validateVerifiedAuthSession,
} from '../../src/accountAuth/index.ts'
import type {
  AccountSessionState,
  VerifiedAuthSession,
  AuthProvider,
  AuthProviderRestoreResult,
  AuthProviderSignInResult,
} from '../../src/accountAuth/index.ts'
import {
  createMockAuthorizedAccountTransport,
  parseAccountId,
} from '../../src/accountSync/index.ts'
import type {
  AccountTransportFetchResult,
  GuestClearanceDecision,
  GuestParticipationEnvelopeV2,
  GuestReconciliationInput,
  GuestStorageAccessor,
  SyncLogger,
} from '../../src/accountSync/index.ts'
import {
  parseLocalCalendarDate,
  parseStoredChallengeId,
} from '../../src/participation/identity.ts'

const ACCT_A = parseAccountId('550e8400-e29b-41d4-a716-446655440000')!
const c1 = parseStoredChallengeId('cms:berrymark-challenge-2026-11-01-true-vine')!
const c2 = parseStoredChallengeId('cms:berrymark-challenge-2026-11-02-rejoice-always')!
const dNov01 = parseLocalCalendarDate('2026-11-01')!
const dNov02 = parseLocalCalendarDate('2026-11-02')!

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function verifiedSession(): VerifiedAuthSession {
  return {
    accountId: ACCT_A,
    method: 'google',
    verificationSource: 'serverVerified',
    token: 'verified-token',
    expiresAt: Date.now() + 60_000,
  }
}

function makeGuestEnvelope(): GuestParticipationEnvelopeV2 {
  return {
    schemaVersion: 2,
    data: {
      completedChallenges: {
        [c1]: { completedOn: dNov01 },
      },
      inProgressChallenges: {},
      savedChallenges: {},
      savedScriptures: [],
      lastOpenedChallenge: null,
      earnedAwards: {},
    },
  }
}

class InMemoryGuestStorageAccessor implements GuestStorageAccessor {
  private snapshot: GuestReconciliationInput
  public clearCalls = 0
  public lastClearDecision: GuestClearanceDecision | null = null
  public cleared = false
  public mutateInFlightOnSecondRead = false
  private readCount = 0

  constructor(initial: GuestReconciliationInput) {
    this.snapshot = JSON.parse(JSON.stringify(initial))
  }

  getSnapshot(): GuestReconciliationInput {
    this.readCount += 1
    const copy = JSON.parse(JSON.stringify(this.snapshot)) as GuestReconciliationInput
    if (this.mutateInFlightOnSecondRead && this.readCount === 1) {
      const env = this.snapshot.envelope as GuestParticipationEnvelopeV2
      env.data.completedChallenges[c2] = { completedOn: dNov02 }
    }
    return copy
  }

  clearGuestStorage(decision: GuestClearanceDecision): boolean {
    this.clearCalls += 1
    this.lastClearDecision = decision
    this.cleared = true
    return true
  }
}

describe('R13-2A Account Session Lifecycle & Safe Sync Boundary', () => {
  test('starts in initial guest mode without requiring authentication', () => {
    const provider = createMockAuthProvider({ accountId: ACCT_A })
    const controller = createAccountSessionController(provider)

    assert.deepEqual(controller.getState(), { status: 'guest' })
    assert.equal(provider.restoreCalls, 0)
    assert.equal(provider.signInCalls, 0)
  })

  test('session restoration returns guest when no persisted session exists', async () => {
    const provider = createMockAuthProvider({ accountId: ACCT_A })
    const controller = createAccountSessionController(provider)

    const outcome = await controller.restoreSession()
    assert.equal(outcome.ok, true)
    assert.deepEqual(outcome.state, { status: 'guest' })
    assert.equal(provider.restoreCalls, 1)
  })

  test('session restoration promotes server-verified session and triggers safe guest sync', async () => {
    const nowMs = Date.now()
    const provider = createMockAuthProvider({
      accountId: ACCT_A,
      restoreQueue: [
        {
          status: 'authenticated',
          session: {
            accountId: ACCT_A,
            method: 'google',
            verificationSource: 'serverVerified',
            token: 'verified-tok-1',
            expiresAt: nowMs + 60_000,
          },
        },
      ],
    })
    const guest = new InMemoryGuestStorageAccessor({ envelope: makeGuestEnvelope() })
    const transport = createMockAuthorizedAccountTransport()
    const controller = createAccountSessionController(provider, {
      guest,
      transport,
      now: () => nowMs,
    })

    const outcome = await controller.restoreSession()
    assert.equal(outcome.ok, true)
    assert.equal(outcome.state.status, 'authenticated')
    if (outcome.state.status === 'authenticated') {
      assert.equal(outcome.state.syncStatus, 'synced')
      assert.equal(outcome.state.session.accountId, ACCT_A)
      assert.equal(outcome.state.lastSyncOutcome?.guestCleared, true)
    }
    assert.equal(guest.cleared, true)
    assert.equal(guest.clearCalls, 1)
  })

  test('rejects unverified sessions and client-supplied/invalid account IDs (never treated as server authority)', async () => {
    const unverifiedSession = {
      accountId: ACCT_A,
      method: 'google',
      verificationSource: 'clientClaimed',
    } as unknown as VerifiedAuthSession

    const invalidIdSession = {
      accountId: 'invalid account id with spaces',
      method: 'apple',
      verificationSource: 'serverVerified',
    } as unknown as VerifiedAuthSession

    assert.equal(validateVerifiedAuthSession(unverifiedSession).valid, false)
    assert.equal(validateVerifiedAuthSession(invalidIdSession).valid, false)

    const provider = createMockAuthProvider({
      accountId: ACCT_A,
      signInQueue: [
        { status: 'authenticated', session: unverifiedSession },
        { status: 'authenticated', session: invalidIdSession },
      ],
    })
    const guest = new InMemoryGuestStorageAccessor({ envelope: makeGuestEnvelope() })
    const transport = createMockAuthorizedAccountTransport()
    const controller = createAccountSessionController(provider, { guest, transport })

    const first = await controller.signIn({ method: 'google' })
    assert.equal(first.ok, false)
    assert.equal(first.error?.code, 'unverifiedSession')
    assert.equal(controller.getState().status, 'guest')
    assert.equal(guest.cleared, false)

    const second = await controller.signIn({ method: 'apple' })
    assert.equal(second.ok, false)
    assert.equal(second.error?.code, 'invalidSession')
    assert.equal(controller.getState().status, 'guest')
    assert.equal(guest.cleared, false)
  })

  test('Continue with Google and Continue with Apple transition to authenticated and safely sync', async () => {
    for (const method of ['google', 'apple'] as const) {
      const provider = createMockAuthProvider({ accountId: ACCT_A })
      const guest = new InMemoryGuestStorageAccessor({ envelope: makeGuestEnvelope() })
      const transport = createMockAuthorizedAccountTransport()
      const controller = createAccountSessionController(provider, { guest, transport })

      const states: AccountSessionState['status'][] = []
      controller.subscribe((s) => states.push(s.status))

      const outcome = await controller.signIn({ method })
      assert.equal(outcome.ok, true)
      assert.equal(outcome.state.status, 'authenticated')
      assert.equal(guest.cleared, true)
      assert.deepEqual(states, ['signingIn', 'authenticated', 'authenticated', 'authenticated'])
    }
  })

  test('Continue with email verification code handles invalid input, wrong code retry, and valid 6-digit OTP', async () => {
    assert.equal(isValidSixDigitOtpCode('123456'), true)
    assert.equal(isValidSixDigitOtpCode('12345'), false)
    assert.equal(isValidSixDigitOtpCode('abcdef'), false)

    const provider = createMockAuthProvider({
      accountId: ACCT_A,
      validOtpCode: '654321',
    })
    const guest = new InMemoryGuestStorageAccessor({ envelope: makeGuestEnvelope() })
    const transport = createMockAuthorizedAccountTransport()
    const controller = createAccountSessionController(provider, { guest, transport })

    // Invalid email rejected before calling provider
    const badEmail = await controller.signIn({ method: 'emailOtp', email: 'not-an-email' })
    assert.equal(badEmail.ok, false)
    assert.equal(badEmail.error?.code, 'invalidRequest')
    assert.equal(provider.signInCalls, 0)

    // Valid email starts challenge
    const challengeOutcome = await controller.signIn({
      method: 'emailOtp',
      email: 'reader@example.com',
    })
    assert.equal(challengeOutcome.ok, true)
    assert.equal(challengeOutcome.state.status, 'awaitingEmailOtp')
    if (challengeOutcome.state.status !== 'awaitingEmailOtp') {
      throw new Error('Expected awaitingEmailOtp')
    }
    const challengeId = challengeOutcome.state.challenge.challengeId

    // Malformed OTP keeps challenge active without calling provider
    const malformedOtp = await controller.verifyEmailOtp({ challengeId, code: '12ab' })
    assert.equal(malformedOtp.ok, false)
    assert.equal(malformedOtp.error?.code, 'invalidRequest')
    assert.equal(controller.getState().status, 'awaitingEmailOtp')
    assert.equal(provider.verifyOtpCalls, 0)

    // Wrong 6-digit OTP stays awaitingEmailOtp so reader can retry
    const wrongOtp = await controller.verifyEmailOtp({ challengeId, code: '000000' })
    assert.equal(wrongOtp.ok, false)
    assert.equal(wrongOtp.error?.code, 'unauthorized')
    assert.equal(wrongOtp.error?.retryable, true)
    assert.equal(controller.getState().status, 'awaitingEmailOtp')
    assert.equal(guest.cleared, false)

    // Correct 6-digit OTP authenticates and syncs
    const validOtp = await controller.verifyEmailOtp({ challengeId, code: '654321' })
    assert.equal(validOtp.ok, true)
    assert.equal(validOtp.state.status, 'authenticated')
    assert.equal(guest.cleared, true)
  })

  test('cancellation during sign-in aborts provider and ignores late async completion', async () => {
    const provider = createMockAuthProvider({
      accountId: ACCT_A,
      delayMs: 40,
    })
    const guest = new InMemoryGuestStorageAccessor({ envelope: makeGuestEnvelope() })
    const transport = createMockAuthorizedAccountTransport()
    const controller = createAccountSessionController(provider, { guest, transport })

    const signInPromise = controller.signIn({ method: 'google' })
    assert.equal(controller.getState().status, 'signingIn')

    const cancelOutcome = controller.cancelSignIn()
    assert.equal(cancelOutcome.ok, false)
    assert.equal(cancelOutcome.error?.code, 'cancelled')
    assert.equal(controller.getState().status, 'guest')

    const finished = await signInPromise
    assert.equal(finished.ok, false)
    assert.equal(controller.getState().status, 'guest')
    assert.equal(guest.cleared, false)
  })

  test('external abort fails closed when providers ignore the signal on sign-in, restore, OTP, and recovery', async () => {
    const cases = ['signIn', 'restore', 'otp', 'recover'] as const
    for (const operation of cases) {
      const pending = deferred<AuthProviderRestoreResult | AuthProviderSignInResult>()
      let nowMs = Date.now()
      const base = createMockAuthProvider({
        accountId: ACCT_A,
        expiresAt: operation === 'recover' ? nowMs + 10 : nowMs + 60_000,
      })
      const overrides = {
        ...(operation === 'signIn' ? { signIn: () => pending.promise as Promise<AuthProviderSignInResult> } : {}),
        ...(operation === 'restore' ? { restoreSession: () => pending.promise as Promise<AuthProviderRestoreResult> } : {}),
        ...(operation === 'recover' ? { recoverSession: () => pending.promise as Promise<AuthProviderRestoreResult> } : {}),
        ...(operation === 'otp' ? { verifyEmailOtp: () => pending.promise as Promise<AuthProviderSignInResult> } : {}),
      }
      const provider = Object.assign(Object.create(base) as AuthProvider, overrides)
      const guest = new InMemoryGuestStorageAccessor({ envelope: makeGuestEnvelope() })
      const transport = createMockAuthorizedAccountTransport()
      const controller = createAccountSessionController(provider, {
        guest,
        transport,
        autoSyncOnSignIn: false,
        now: () => nowMs,
      })
      const observedStates: AccountSessionState['status'][] = []
      controller.subscribe((state) => observedStates.push(state.status))

      if (operation === 'otp') {
        const challenge = await controller.signIn({ method: 'emailOtp', email: 'reader@example.com' })
        assert.equal(challenge.state.status, 'awaitingEmailOtp')
      }
      if (operation === 'recover') {
        await controller.signIn({ method: 'google' })
        nowMs += 20
      }

      observedStates.length = 0
      const abort = new AbortController()
      const action = operation === 'signIn'
        ? controller.signIn({ method: 'google' }, { signal: abort.signal })
        : operation === 'restore'
          ? controller.restoreSession({ signal: abort.signal })
          : operation === 'otp'
            ? controller.verifyEmailOtp({ challengeId: (controller.getState() as Extract<AccountSessionState, { status: 'awaitingEmailOtp' }>).challenge.challengeId, code: '123456' }, { signal: abort.signal })
            : controller.recoverSession({ signal: abort.signal })
      await Promise.resolve()
      abort.abort()
      pending.resolve({ status: 'authenticated', session: verifiedSession() })
      const outcome = await action
      assert.equal(outcome.ok, false, `${operation}: ${JSON.stringify(outcome)}`)
      assert.notEqual(controller.getState().status, 'authenticated', operation)
      assert.equal(observedStates.includes('authenticated'), false, operation)
      assert.equal(guest.cleared, false, operation)
      assert.equal(transport.commitCount, 0, operation)
    }
  })

  test('duplicate sign-in is rejected while signing in or already authenticated', async () => {
    const provider = createMockAuthProvider({
      accountId: ACCT_A,
      delayMs: 25,
    })
    const controller = createAccountSessionController(provider)

    const firstPromise = controller.signIn({ method: 'google' })
    const duplicateInFlight = await controller.signIn({ method: 'apple' })

    assert.equal(duplicateInFlight.ok, false)
    assert.equal(duplicateInFlight.error?.code, 'signInAlreadyInProgress')
    assert.equal(provider.signInCalls, 1)

    const firstOutcome = await firstPromise
    assert.equal(firstOutcome.ok, true)
    assert.equal(controller.getState().status, 'authenticated')

    const duplicateWhileAuthed = await controller.signIn({ method: 'apple' })
    assert.equal(duplicateWhileAuthed.ok, false)
    assert.equal(duplicateWhileAuthed.error?.code, 'alreadyAuthenticated')
    assert.equal(provider.signInCalls, 1)
  })

  test('authorization failure during sign-in or sync preserves guest data', async () => {
    // 1. Auth failure during sign-in
    const providerAuthFail = createMockAuthProvider({
      accountId: ACCT_A,
      signInQueue: [
        {
          status: 'unauthorized',
          reason: 'accountDisabled',
          message: 'Account access is disabled.',
        },
      ],
    })
    const guest = new InMemoryGuestStorageAccessor({ envelope: makeGuestEnvelope() })
    const transportOk = createMockAuthorizedAccountTransport()
    const c1Ctrl = createAccountSessionController(providerAuthFail, {
      guest,
      transport: transportOk,
    })

    const signInFail = await c1Ctrl.signIn({ method: 'google' })
    assert.equal(signInFail.ok, false)
    assert.equal(signInFail.error?.code, 'unauthorized')
    assert.equal(c1Ctrl.getState().status, 'guest')
    assert.equal(guest.cleared, false)

    // 2. Auth failure during sync transitions to expired and preserves guest data
    const providerOk = createMockAuthProvider({ accountId: ACCT_A })
    const transportAuthFail = createMockAuthorizedAccountTransport({
      hooks: { authError: true },
    })
    const c2Ctrl = createAccountSessionController(providerOk, {
      guest,
      transport: transportAuthFail,
    })

    const syncAuthFail = await c2Ctrl.signIn({ method: 'apple' })
    assert.equal(syncAuthFail.ok, false)
    assert.equal(syncAuthFail.error?.code, 'unauthorized')
    assert.equal(syncAuthFail.syncOutcome?.status, 'authFailure')
    assert.equal(syncAuthFail.syncOutcome?.guestCleared, false)
    assert.equal(c2Ctrl.getState().status, 'expired')
    assert.equal(guest.cleared, false)
  })

  test('network failure during sign-in and sync preserves guest data and supports retry', async () => {
    const provider = createMockAuthProvider({
      accountId: ACCT_A,
      signInQueue: [
        { status: 'networkError', retryable: true, message: 'Offline during sign-in.' },
      ],
    })
    const guest = new InMemoryGuestStorageAccessor({ envelope: makeGuestEnvelope() })
    const transport = createMockAuthorizedAccountTransport({
      hooks: { commitNetworkError: 'permanent' },
    })
    const controller = createAccountSessionController(provider, { guest, transport })

    // 1. Sign-in network error -> guest preserved, retryable
    const signInErr = await controller.signIn({ method: 'google' })
    assert.equal(signInErr.ok, false)
    assert.equal(signInErr.error?.code, 'networkError')
    assert.equal(signInErr.error?.retryable, true)
    assert.equal(controller.getState().status, 'guest')
    assert.equal(guest.cleared, false)

    // 2. Retry sign-in succeeds, but sync hits permanent network error -> guest preserved
    const signInOkSyncFail = await controller.signIn({ method: 'google' })
    assert.equal(signInOkSyncFail.ok, false)
    assert.equal(signInOkSyncFail.error?.code, 'syncFailed')
    assert.equal(signInOkSyncFail.error?.retryable, true)
    assert.equal(signInOkSyncFail.syncOutcome?.status, 'networkError')
    assert.equal(signInOkSyncFail.syncOutcome?.guestCleared, false)
    assert.equal(controller.getState().status, 'authenticated')
    if (controller.getState().status === 'authenticated') {
      assert.equal((controller.getState() as Extract<AccountSessionState, { status: 'authenticated' }>).syncStatus, 'syncFailed')
    }
    assert.equal(guest.cleared, false)

    // 3. Clear transport hook and retrySync -> succeeds and clears guest storage
    transport.hooks = {}
    const retryOutcome = await controller.retrySync()
    assert.equal(retryOutcome.ok, true)
    assert.equal(retryOutcome.syncOutcome?.guestCleared, true)
    assert.equal(guest.cleared, true)
  })

  test('expired session blocks sync until recovered, and recovery handles retry', async () => {
    let nowMs = Date.now()
    const provider = createMockAuthProvider({
      accountId: ACCT_A,
      expiresAt: nowMs + 10_000,
      recoverQueue: [
        { status: 'networkError', retryable: true, message: 'Refresh timed out.' },
        {
          status: 'authenticated',
          session: {
            accountId: ACCT_A,
            method: 'google',
            verificationSource: 'serverVerified',
            token: 'refreshed-tok',
            expiresAt: nowMs + 120_000,
          },
        },
      ],
    })
    const guest = new InMemoryGuestStorageAccessor({ envelope: makeGuestEnvelope() })
    const transport = createMockAuthorizedAccountTransport()
    const controller = createAccountSessionController(provider, {
      guest,
      transport,
      autoSyncOnSignIn: false,
      now: () => nowMs,
    })

    const signedIn = await controller.signIn({ method: 'google' })
    assert.equal(signedIn.ok, true)
    assert.equal(isSessionExpired({ expiresAt: nowMs + 10_000 }, nowMs), false)

    // Advance clock past expiration
    nowMs += 20_000
    assert.equal(isSessionExpired({ expiresAt: nowMs - 10_000 }, nowMs), true)

    // Attempting sync with expired session fails closed and transitions to expired
    const expiredSync = await controller.syncGuestToAccount()
    assert.equal(expiredSync.ok, false)
    assert.equal(expiredSync.error?.code, 'expired')
    assert.equal(controller.getState().status, 'expired')
    assert.equal(guest.cleared, false)

    // First recovery fails with networkError -> stays expired
    const recoverFail = await controller.recoverSession()
    assert.equal(recoverFail.ok, false)
    assert.equal(recoverFail.error?.code, 'networkError')
    assert.equal(controller.getState().status, 'expired')

    // Second recovery succeeds -> authenticated, then explicit sync succeeds
    const recoverOk = await controller.recoverSession()
    assert.equal(recoverOk.ok, true)
    assert.equal(controller.getState().status, 'authenticated')

    const syncedAfterRecover = await controller.syncGuestToAccount()
    assert.equal(syncedAfterRecover.ok, true)
    assert.equal(guest.cleared, true)
  })

  test('local in-flight guest mutation prevents guest storage clearance even after remote commit', async () => {
    const provider = createMockAuthProvider({ accountId: ACCT_A })
    const guest = new InMemoryGuestStorageAccessor({ envelope: makeGuestEnvelope() })
    guest.mutateInFlightOnSecondRead = true
    const transport = createMockAuthorizedAccountTransport()
    const controller = createAccountSessionController(provider, { guest, transport })

    const outcome = await controller.signIn({ method: 'google' })
    assert.equal(outcome.ok, true)
    assert.equal(outcome.syncOutcome?.status, 'committed')
    assert.equal(outcome.syncOutcome?.guestCleared, false)
    assert.equal(outcome.syncOutcome?.guestClearanceDecision?.reason, 'localGuestMutatedInFlight')
    assert.equal(guest.cleared, false)
    assert.equal(guest.clearCalls, 0)
  })

  test('signOut clears authenticated state to guest even on remote signOut networkError', async () => {
    const provider = createMockAuthProvider({
      accountId: ACCT_A,
      signOutQueue: [{ status: 'networkError', retryable: true, message: 'Offline signOut.' }],
    })
    const controller = createAccountSessionController(provider)

    await controller.signIn({ method: 'apple' })
    assert.equal(controller.getState().status, 'authenticated')

    const signOutOutcome = await controller.signOut()
    assert.equal(signOutOutcome.ok, true)
    assert.equal(controller.getState().status, 'guest')
    assert.equal(signOutOutcome.error?.code, 'networkError')
  })

  test('sync is single-flight and sign-out aborts a pending sync before guest clearance', async () => {
    const provider = createMockAuthProvider({ accountId: ACCT_A })
    const guest = new InMemoryGuestStorageAccessor({ envelope: makeGuestEnvelope() })
    const transport = createMockAuthorizedAccountTransport()
    const pendingFetch = deferred<AccountTransportFetchResult>()
    let fetchCalls = 0
    transport.getAccount = async () => {
      fetchCalls += 1
      return pendingFetch.promise
    }
    const controller = createAccountSessionController(provider, {
      guest,
      transport,
      autoSyncOnSignIn: false,
    })
    await controller.signIn({ method: 'google' })

    const first = controller.syncGuestToAccount()
    await Promise.resolve()
    const duplicate = await controller.retrySync()
    assert.equal(duplicate.ok, false)
    assert.equal(duplicate.error?.code, 'operationInProgress')
    assert.equal(fetchCalls, 1)

    const signedOut = await controller.signOut()
    assert.equal(signedOut.ok, true)
    pendingFetch.resolve({ status: 'notFound', accountId: ACCT_A })
    const syncOutcome = await first
    assert.equal(syncOutcome.ok, false)
    assert.equal(controller.getState().status, 'guest')
    assert.equal(guest.clearCalls, 0)
    assert.equal(guest.cleared, false)
    assert.equal(transport.commitCount, 0)
  })

  test('late commit completion after sign-out cannot clear guest storage', async () => {
    const provider = createMockAuthProvider({ accountId: ACCT_A })
    const guest = new InMemoryGuestStorageAccessor({ envelope: makeGuestEnvelope() })
    const transport = createMockAuthorizedAccountTransport()
    const originalCommit = transport.commitAccount.bind(transport)
    const commitStarted = deferred<void>()
    const allowCommitToFinish = deferred<void>()
    transport.commitAccount = async (session, payload) => {
      commitStarted.resolve()
      await allowCommitToFinish.promise
      // Simulate a remote transport that cannot stop an already-issued request.
      return originalCommit(session, payload)
    }
    const controller = createAccountSessionController(provider, {
      guest,
      transport,
      autoSyncOnSignIn: false,
    })
    await controller.signIn({ method: 'google' })

    const syncing = controller.syncGuestToAccount()
    await commitStarted.promise
    await controller.signOut()
    allowCommitToFinish.resolve()
    const outcome = await syncing

    assert.equal(outcome.ok, false)
    assert.equal(controller.getState().status, 'guest')
    assert.equal(guest.clearCalls, 0)
    assert.equal(guest.cleared, false)
  })

  test('privacy & dependency isolation: no UUIDs/tokens in logs and zero forbidden imports/globals', () => {
    const logs: string[] = []
    const logger: SyncLogger = {
      warn: (m) => logs.push(m),
      error: (m) => logs.push(m),
      info: (m) => logs.push(m),
    }

    const provider = createMockAuthProvider({
      accountId: ACCT_A,
      signInQueue: [
        {
          status: 'authenticated',
          session: {
            accountId: ACCT_A,
            method: 'google',
            verificationSource: 'clientClaimed' as unknown as 'serverVerified',
            token: 'Bearer super-secret-jwt-token',
          },
        },
      ],
    })
    const controller = createAccountSessionController(provider, { logger })
    void controller.signIn({ method: 'google' })

    for (const msg of logs) {
      assert.equal(msg.includes(ACCT_A), false)
      assert.equal(msg.includes('super-secret-jwt-token'), false)
    }

    const authDir = join(process.cwd(), 'src', 'accountAuth')
    const files = readdirSync(authDir).filter((f) => f.endsWith('.ts'))
    assert.ok(files.length >= 4)

    for (const file of files) {
      const content = readFileSync(join(authDir, file), 'utf8')
      assert.equal(content.includes('@supabase/'), false, `${file} must not import @supabase/`)
      assert.equal(content.includes('@capacitor/'), false, `${file} must not import @capacitor/`)
      assert.equal(content.includes("from 'react'"), false, `${file} must not import react`)
      assert.equal(content.includes('node:'), false, `${file} must not import node: modules`)
      assert.equal(/\blocalStorage\b/.test(content), false, `${file} must not access localStorage`)
      assert.equal(/\bsessionStorage\b/.test(content), false, `${file} must not access sessionStorage`)
      assert.equal(/\bwindow\b/.test(content), false, `${file} must not access window`)
      assert.equal(/\bdocument\b/.test(content), false, `${file} must not access document`)
    }
  })
})
