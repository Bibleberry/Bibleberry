import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  abortBatch,
  advanceBatchOnPullRequestClosed,
  evaluatePullRequestPreflight,
  handleMergeGroupDestroyed,
  parseBatchEntries,
  reconcileBatch,
  startBatch,
  type ApprovalVerificationResult,
  type BatchState,
  type GitHubBatchClient,
  type PullRequestSnapshot,
} from '../../scripts/ci/merge-queue-batch-lib.ts';

const SHA_1 = '1111111111111111111111111111111111111111';
const SHA_2 = '2222222222222222222222222222222222222222';
const SHA_3 = '3333333333333333333333333333333333333333';

function makePr(overrides: Partial<PullRequestSnapshot> = {}): PullRequestSnapshot {
  return {
    id: 'PR_kwDO1',
    number: 180,
    url: 'https://github.com/Bibleberry/Bibleberry/pull/180',
    title: 'Test PR',
    state: 'OPEN',
    isDraft: false,
    baseRefName: 'main',
    baseRepository: { nameWithOwner: 'Bibleberry/Bibleberry' },
    headRefOid: SHA_1,
    isInMergeQueue: false,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    reviewDecision: null,
    reviewThreads: { totalCount: 0, pageInfo: { hasNextPage: false }, nodes: [] },
    statusCheckRollup: {
      state: 'SUCCESS',
      contexts: {
        nodes: [
          { __typename: 'CheckRun', name: 'Build reader application', status: 'COMPLETED', conclusion: 'SUCCESS' },
          { __typename: 'CheckRun', name: 'Verify Sanity Studio', status: 'COMPLETED', conclusion: 'SUCCESS' },
        ],
      },
    },
    ...overrides,
  };
}

class MockGitHubClient implements GitHubBatchClient {
  prs = new Map<number, PullRequestSnapshot | null>();
  prSequences = new Map<number, Array<PullRequestSnapshot | null>>();
  enqueued: Array<{ pullRequestId: string; expectedHeadOid: string }> = [];
  dequeued: string[] = [];
  enqueueError: Error | null = null;
  dequeueError: Error | null = null;
  saveErrors: Array<Error | null> = [];
  approvalResult: ApprovalVerificationResult = { ok: true, approvedBy: 'ContraPhilosophy' };
  state: BatchState | null = null;
  saveCount = 0;

  async getPullRequest(_owner: string, _repo: string, prNumber: number): Promise<PullRequestSnapshot | null> {
    const seq = this.prSequences.get(prNumber);
    if (seq && seq.length > 0) {
      return seq.shift() ?? null;
    }
    return this.prs.get(prNumber) ?? null;
  }

  async enqueuePullRequest(pullRequestId: string, expectedHeadOid: string): Promise<{ queueEntryId?: string }> {
    if (this.enqueueError) {
      throw this.enqueueError;
    }
    this.enqueued.push({ pullRequestId, expectedHeadOid });
    return { queueEntryId: `MQE_${this.enqueued.length}` };
  }

  async dequeuePullRequest(pullRequestId: string): Promise<void> {
    if (this.dequeueError) {
      throw this.dequeueError;
    }
    this.dequeued.push(pullRequestId);
  }

  async getBatchState(): Promise<BatchState | null> {
    return this.state;
  }

  async saveBatchState(_owner: string, _repo: string, state: BatchState): Promise<void> {
    const nextErr = this.saveErrors.shift();
    if (nextErr) {
      throw nextErr;
    }
    this.state = state;
    this.saveCount += 1;
  }

  async verifyWorkflowApproval(): Promise<ApprovalVerificationResult> {
    return this.approvalResult;
  }
}

test('parseBatchEntries parses comma, space, and newline separated PR@SHA entries', () => {
  const entries = parseBatchEntries(`180@${SHA_1.toUpperCase()},\n 181@${SHA_2} 183@${SHA_3}`);
  assert.deepEqual(entries, [
    { prNumber: 180, expectedHeadSha: SHA_1 },
    { prNumber: 181, expectedHeadSha: SHA_2 },
    { prNumber: 183, expectedHeadSha: SHA_3 },
  ]);
});

test('parseBatchEntries rejects empty, malformed, short-SHA, and duplicate entries', () => {
  assert.throws(() => parseBatchEntries('   '), /empty/i);
  assert.throws(() => parseBatchEntries('180'), /Expected format/);
  assert.throws(() => parseBatchEntries(`0@${SHA_1}`), /positive integer/);
  assert.throws(() => parseBatchEntries('180@abc1234'), /40-character/);
  assert.throws(() => parseBatchEntries(`180@${SHA_1},180@${SHA_2}`), /Duplicate PR #180/);
});

test('evaluatePullRequestPreflight allows BEHIND branch when mergeable and checks pass', () => {
  const pr = makePr({ mergeable: 'MERGEABLE', mergeStateStatus: 'BEHIND' });
  const res = evaluatePullRequestPreflight(pr, { prNumber: 180, expectedHeadSha: SHA_1 }, 'Bibleberry/Bibleberry');
  assert.equal(res.ok, true);
  assert.deepEqual(res.reasons, []);
});

test('evaluatePullRequestPreflight accepts prior SKIPPED check run when newer SUCCESS run exists', () => {
  const pr = makePr({
    statusCheckRollup: {
      state: 'SUCCESS',
      contexts: {
        nodes: [
          { __typename: 'CheckRun', name: 'Build reader application', status: 'COMPLETED', conclusion: 'SKIPPED' },
          { __typename: 'CheckRun', name: 'Build reader application', status: 'COMPLETED', conclusion: 'SUCCESS' },
          { __typename: 'CheckRun', name: 'Verify Sanity Studio', status: 'COMPLETED', conclusion: 'SUCCESS' },
        ],
      },
    },
  });
  const res = evaluatePullRequestPreflight(pr, { prNumber: 180, expectedHeadSha: SHA_1 }, 'Bibleberry/Bibleberry');
  assert.equal(res.ok, true);
});

test('evaluatePullRequestPreflight rejects SKIPPED-only required checks even when rollup state is SUCCESS', () => {
  const pr = makePr({
    statusCheckRollup: {
      state: 'SUCCESS',
      contexts: {
        nodes: [
          { __typename: 'CheckRun', name: 'Build reader application', status: 'COMPLETED', conclusion: 'SKIPPED' },
          { __typename: 'CheckRun', name: 'Verify Sanity Studio', status: 'COMPLETED', conclusion: 'SUCCESS' },
        ],
      },
    },
  });
  const res = evaluatePullRequestPreflight(pr, { prNumber: 180, expectedHeadSha: SHA_1 }, 'Bibleberry/Bibleberry');
  assert.equal(res.ok, false);
  assert.match(res.reasons.join(' '), /only has SKIPPED runs and no passing execution/);
});

test('evaluatePullRequestPreflight rejects negative cases: stale SHA, Draft, wrong state/base/repo, unapproved, unresolved threads, failed checks, conflicts', () => {
  const cases: Array<{ name: string; pr: PullRequestSnapshot | null; expectedReason: RegExp }> = [
    { name: 'missing PR', pr: null, expectedReason: /not found/ },
    { name: 'stale head SHA', pr: makePr({ headRefOid: SHA_2 }), expectedReason: /does not match authorized SHA/ },
    { name: 'Draft PR', pr: makePr({ isDraft: true }), expectedReason: /Draft PR/ },
    { name: 'closed PR', pr: makePr({ state: 'CLOSED' }), expectedReason: /expected OPEN/ },
    { name: 'wrong base', pr: makePr({ baseRefName: 'develop' }), expectedReason: /base branch/ },
    {
      name: 'wrong repo',
      pr: makePr({ baseRepository: { nameWithOwner: 'Other/Bibleberry' } }),
      expectedReason: /targets repository/,
    },
    {
      name: 'unapproved PR (REVIEW_REQUIRED)',
      pr: makePr({ reviewDecision: 'REVIEW_REQUIRED' }),
      expectedReason: /REVIEW_REQUIRED/,
    },
    {
      name: 'changes requested',
      pr: makePr({ reviewDecision: 'CHANGES_REQUESTED' }),
      expectedReason: /CHANGES_REQUESTED/,
    },
    {
      name: 'unresolved conversation',
      pr: makePr({ reviewThreads: { totalCount: 1, pageInfo: { hasNextPage: false }, nodes: [{ isResolved: false }] } }),
      expectedReason: /unresolved review conversation/,
    },
    {
      name: 'failed checks',
      pr: makePr({
        statusCheckRollup: {
          state: 'FAILURE',
          contexts: {
            nodes: [
              { __typename: 'CheckRun', name: 'Build reader application', status: 'COMPLETED', conclusion: 'FAILURE' },
              { __typename: 'CheckRun', name: 'Verify Sanity Studio', status: 'COMPLETED', conclusion: 'SUCCESS' },
            ],
          },
        },
      }),
      expectedReason: /statusCheckRollup state is FAILURE/,
    },
    {
      name: 'missing required check',
      pr: makePr({
        statusCheckRollup: {
          state: 'SUCCESS',
          contexts: {
            nodes: [{ __typename: 'CheckRun', name: 'Build reader application', status: 'COMPLETED', conclusion: 'SUCCESS' }],
          },
        },
      }),
      expectedReason: /missing required check "Verify Sanity Studio"/,
    },
    {
      name: 'merge conflicts',
      pr: makePr({ mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }),
      expectedReason: /merge conflicts/,
    },
  ];

  for (const c of cases) {
    const res = evaluatePullRequestPreflight(c.pr, { prNumber: 180, expectedHeadSha: SHA_1 }, 'Bibleberry/Bibleberry');
    assert.equal(res.ok, false, `${c.name} should fail preflight`);
    assert.match(res.reasons.join(' '), c.expectedReason, `${c.name} reason mismatch`);
  }
});

test('startBatch dry-run validates without enqueueing or saving state', async () => {
  const client = new MockGitHubClient();
  client.prs.set(180, makePr({ number: 180, headRefOid: SHA_1 }));
  client.prs.set(181, makePr({ number: 181, headRefOid: SHA_2 }));

  const outcome = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [
      { prNumber: 180, expectedHeadSha: SHA_1 },
      { prNumber: 181, expectedHeadSha: SHA_2 },
    ],
    authorizedBy: 'ContraPhilosophy',
    dryRun: true,
  });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.dryRun, true);
  assert.equal(client.enqueued.length, 0);
  assert.equal(client.saveCount, 0);
});

test('startBatch fails closed when actor is not an authorized owner or workflow approval is missing', async () => {
  const client = new MockGitHubClient();
  client.prs.set(180, makePr({ number: 180, headRefOid: SHA_1 }));

  const nonOwner = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 180, expectedHeadSha: SHA_1 }],
    authorizedBy: 'other-contributor',
    workflowRunId: '12345',
  });
  assert.equal(nonOwner.ok, false);
  assert.match(nonOwner.error ?? '', /not in authorized owners/);
  assert.equal(client.enqueued.length, 0);

  client.approvalResult = {
    ok: false,
    reason: 'Run 12345 has no recorded "merge-queue-approval" approval.',
  };
  const missingApproval = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 180, expectedHeadSha: SHA_1 }],
    authorizedBy: 'ContraPhilosophy',
    workflowRunId: '12345',
  });
  assert.equal(missingApproval.ok, false);
  assert.match(missingApproval.error ?? '', /Authorization failed \(fail-closed\)/);
  assert.equal(client.enqueued.length, 0);
});

test('startBatch rechecks SHA immediately before enqueueing to catch race drift', async () => {
  const client = new MockGitHubClient();
  client.prSequences.set(180, [
    makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1 }),
    makePr({ id: 'PR_180', number: 180, headRefOid: SHA_3 }),
  ]);

  const outcome = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 180, expectedHeadSha: SHA_1 }],
    authorizedBy: 'ContraPhilosophy',
  });

  assert.equal(outcome.ok, false);
  assert.match(outcome.error ?? '', /Pre-enqueue recheck failed/);
  assert.equal(client.enqueued.length, 0);
  assert.equal(client.saveCount, 0);
});

test('write-ahead state survives post-enqueue save failure and recovers via reconcileBatch', async () => {
  const client = new MockGitHubClient();
  client.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1 }));
  client.prs.set(181, makePr({ id: 'PR_181', number: 181, headRefOid: SHA_2 }));
  // First save (write-ahead 'enqueuing') succeeds, second save (confirm 'running') fails.
  client.saveErrors = [null, new Error('GitHub API 503')];

  const started = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [
      { prNumber: 180, expectedHeadSha: SHA_1 },
      { prNumber: 181, expectedHeadSha: SHA_2 },
    ],
    authorizedBy: 'ContraPhilosophy',
  });

  assert.equal(started.ok, false);
  assert.match(started.error ?? '', /write-ahead state saved \(status=enqueuing\)/);
  assert.equal(client.state?.status, 'enqueuing');
  assert.equal(client.state?.activePrNumber, 180);
  assert.equal(client.enqueued.length, 1);

  // Attempting to start another batch while 'enqueuing' is blocked (prevents double-start).
  const doubleStart = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 181, expectedHeadSha: SHA_2 }],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal(doubleStart.ok, false);
  assert.match(doubleStart.error ?? '', /already enqueuing/);

  // Reconcile while PR 180 is in the merge queue -> recovers to 'running' without re-enqueueing.
  client.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1, isInMergeQueue: true }));
  const reconciled = await reconcileBatch(client, { owner: 'Bibleberry', repo: 'Bibleberry' });
  assert.equal(reconciled.action, 'reconciled');
  assert.equal(client.state?.status, 'running');
  assert.equal(client.enqueued.length, 1);
});

test('reconcileBatch recovers interrupted advancement when save fails after enqueueing next PR and PR later merges', async () => {
  const client = new MockGitHubClient();
  client.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1 }));
  client.prs.set(181, makePr({ id: 'PR_181', number: 181, headRefOid: SHA_2 }));

  await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [
      { prNumber: 180, expectedHeadSha: SHA_1 },
      { prNumber: 181, expectedHeadSha: SHA_2 },
    ],
    authorizedBy: 'ContraPhilosophy',
  });

  // On advance from 180 -> 181, write-ahead save succeeds, enqueue succeeds, confirm save fails.
  client.saveErrors = [null, new Error('Variables API timeout')];
  const adv = await advanceBatchOnPullRequestClosed(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 180,
    merged: true,
  });
  assert.equal(adv.action, 'enqueued');
  assert.equal(client.state?.status, 'enqueuing');
  assert.equal(client.state?.activePrNumber, 181);

  // PR 181 subsequently merges -> reconcileBatch sees MERGED and completes the batch!
  client.prs.set(181, makePr({ id: 'PR_181', number: 181, headRefOid: SHA_2, state: 'MERGED' }));
  const rec = await reconcileBatch(client, { owner: 'Bibleberry', repo: 'Bibleberry' });
  assert.equal(rec.action, 'completed');
  assert.equal(client.state?.status, 'completed');
  assert.deepEqual(client.state?.completedPrNumbers, [180, 181]);
});

test('durable batch advancement enqueues one PR at a time and completes cleanly', async () => {
  const client = new MockGitHubClient();
  client.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1 }));
  client.prs.set(181, makePr({ id: 'PR_181', number: 181, headRefOid: SHA_2, mergeStateStatus: 'BEHIND' }));

  const started = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [
      { prNumber: 180, expectedHeadSha: SHA_1 },
      { prNumber: 181, expectedHeadSha: SHA_2 },
    ],
    authorizedBy: 'ContraPhilosophy',
    now: () => '2026-11-17T12:00:00.000Z',
  });

  assert.equal(started.ok, true);
  assert.deepEqual(client.enqueued, [{ pullRequestId: 'PR_180', expectedHeadOid: SHA_1 }]);
  assert.equal(client.state?.activePrNumber, 180);

  // Unrelated PR close is ignored.
  const ignored = await advanceBatchOnPullRequestClosed(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 999,
    merged: true,
  });
  assert.equal(ignored.action, 'ignored');

  // PR 180 merges -> advances to PR 181.
  const advanced = await advanceBatchOnPullRequestClosed(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 180,
    merged: true,
  });
  assert.equal(advanced.action, 'enqueued');
  assert.deepEqual(client.enqueued, [
    { pullRequestId: 'PR_180', expectedHeadOid: SHA_1 },
    { pullRequestId: 'PR_181', expectedHeadOid: SHA_2 },
  ]);
  assert.equal(client.state?.activePrNumber, 181);
  assert.deepEqual(client.state?.completedPrNumbers, [180]);

  // PR 181 merges -> batch completes.
  const completed = await advanceBatchOnPullRequestClosed(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 181,
    merged: true,
  });
  assert.equal(completed.action, 'completed');
  assert.equal(client.state?.status, 'completed');
  assert.deepEqual(client.state?.completedPrNumbers, [180, 181]);
});

test('batch stops on merge_group destruction, permission failure, or stale SHA during advance', async () => {
  const client = new MockGitHubClient();
  client.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1 }));
  client.prs.set(181, makePr({ id: 'PR_181', number: 181, headRefOid: SHA_2 }));

  await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [
      { prNumber: 180, expectedHeadSha: SHA_1 },
      { prNumber: 181, expectedHeadSha: SHA_2 },
    ],
    authorizedBy: 'ContraPhilosophy',
  });

  // Simulate merge_group destroyed due to failed queue check (PR 180 ejected).
  client.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1, isInMergeQueue: false }));
  const destroyed = await handleMergeGroupDestroyed(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    reason: 'invalidated',
    headSha: SHA_3,
  });
  assert.equal(destroyed.action, 'stopped');
  assert.equal(client.state?.status, 'stopped');
  assert.equal(client.enqueued.length, 1);

  // Test permission failure on enqueue during advance.
  client.state = {
    version: 1,
    batchId: 'batch-perm',
    status: 'running',
    createdAt: '2026-11-17T12:00:00.000Z',
    updatedAt: '2026-11-17T12:00:00.000Z',
    authorizedBy: 'ContraPhilosophy',
    entries: [
      { prNumber: 180, expectedHeadSha: SHA_1 },
      { prNumber: 181, expectedHeadSha: SHA_2 },
    ],
    nextIndex: 0,
    activePrNumber: 180,
    activeHeadSha: SHA_1,
    completedPrNumbers: [],
  };
  client.enqueueError = new Error('GitHub GraphQL error: Resource not accessible by integration');

  const permFail = await advanceBatchOnPullRequestClosed(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 180,
    merged: true,
  });
  assert.equal(permFail.action, 'stopped');
  assert.match(permFail.message, /Resource not accessible by integration/);
  assert.equal(client.state?.status, 'stopped');
});

test('abortBatch dequeues active queued PR and handles dequeue failures cleanly', async () => {
  const client = new MockGitHubClient();
  client.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1 }));
  await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 180, expectedHeadSha: SHA_1 }],
    authorizedBy: 'ContraPhilosophy',
  });

  // PR 180 is actively in the merge queue when abort is requested.
  client.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1, isInMergeQueue: true }));
  client.dequeueError = new Error('GraphQL dequeue failed');
  const failedAbort = await abortBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    actor: 'ContraPhilosophy',
    reason: 'Hold for hotfix',
    workflowRunId: '999',
  });
  assert.equal(failedAbort.aborted, false);
  assert.match(failedAbort.message, /Failed to dequeue active PR #180/);
  assert.equal(client.state?.status, 'running');

  // Clear dequeueError -> abort succeeds and dequeues PR_180.
  client.dequeueError = null;
  const aborted = await abortBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    actor: 'ContraPhilosophy',
    reason: 'Hold for hotfix',
    workflowRunId: '999',
  });
  assert.equal(aborted.aborted, true);
  assert.equal(aborted.dequeuedPrNumber, 180);
  assert.deepEqual(client.dequeued, ['PR_180']);
  assert.equal(client.state?.status, 'aborted');
  assert.match(client.state?.stopReason ?? '', /Hold for hotfix.*dequeued PR #180/);
});

test('enqueue succeeds remotely but client throws on initial start and next-PR advancement', async () => {
  // Case 1: Initial startBatch where enqueue succeeds at GitHub (isInMergeQueue becomes true) but client throws timeout.
  const startClient = new MockGitHubClient();
  let startEnqueueCalls = 0;
  startClient.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1, isInMergeQueue: false }));
  startClient.prs.set(181, makePr({ id: 'PR_181', number: 181, headRefOid: SHA_2 }));
  startClient.enqueuePullRequest = async () => {
    startEnqueueCalls += 1;
    // Simulate remote success followed by dropped response / timeout.
    startClient.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1, isInMergeQueue: true }));
    throw new Error('Request timeout (ETIMEDOUT)');
  };

  const started = await startBatch(startClient, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [
      { prNumber: 180, expectedHeadSha: SHA_1 },
      { prNumber: 181, expectedHeadSha: SHA_2 },
    ],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal(started.ok, true);
  assert.equal(startEnqueueCalls, 1);
  assert.equal(started.state?.status, 'running');
  assert.equal(started.state?.activePrNumber, 180);

  // Case 2: Next-PR advancement where enqueue succeeds at GitHub (isInMergeQueue becomes true) but client throws.
  const advClient = new MockGitHubClient();
  let advEnqueueCalls = 0;
  advClient.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1 }));
  advClient.prs.set(181, makePr({ id: 'PR_181', number: 181, headRefOid: SHA_2 }));
  await startBatch(advClient, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [
      { prNumber: 180, expectedHeadSha: SHA_1 },
      { prNumber: 181, expectedHeadSha: SHA_2 },
    ],
    authorizedBy: 'ContraPhilosophy',
  });

  advClient.enqueuePullRequest = async () => {
    advEnqueueCalls += 1;
    advClient.prs.set(181, makePr({ id: 'PR_181', number: 181, headRefOid: SHA_2, isInMergeQueue: true }));
    throw new Error('fetch failed: socket hang up');
  };

  const advanced = await advanceBatchOnPullRequestClosed(advClient, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 180,
    merged: true,
  });
  assert.equal(advanced.action, 'enqueued');
  assert.equal(advEnqueueCalls, 1);
  assert.equal(advClient.state?.status, 'running');
  assert.equal(advClient.state?.activePrNumber, 181);
});

test('indeterminate enqueue failure preserves enqueuing state for watchdog reconciliation', async () => {
  const client = new MockGitHubClient();
  client.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1 }));
  client.prs.set(181, makePr({ id: 'PR_181', number: 181, headRefOid: SHA_2 }));
  client.enqueueError = new Error('HTTP 502 Bad Gateway');

  const started = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [
      { prNumber: 180, expectedHeadSha: SHA_1 },
      { prNumber: 181, expectedHeadSha: SHA_2 },
    ],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal(started.ok, false);
  // Must preserve status='enqueuing' and activePrNumber=180 (not cleared to stopped).
  assert.equal(client.state?.status, 'enqueuing');
  assert.equal(client.state?.activePrNumber, 180);

  // Watchdog reconcile sees PR 180 actually entered the queue and recovers to running.
  client.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1, isInMergeQueue: true }));
  const rec = await reconcileBatch(client, { owner: 'Bibleberry', repo: 'Bibleberry' });
  assert.equal(rec.action, 'reconciled');
  assert.equal(client.state?.status, 'running');
});

test('back-to-back unrelated events and missed webhook recover unattended via reconcileBatch', async () => {
  const client = new MockGitHubClient();
  client.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1 }));
  client.prs.set(181, makePr({ id: 'PR_181', number: 181, headRefOid: SHA_2 }));

  await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [
      { prNumber: 180, expectedHeadSha: SHA_1 },
      { prNumber: 181, expectedHeadSha: SHA_2 },
    ],
    authorizedBy: 'ContraPhilosophy',
  });

  // Back-to-back unrelated PR close + merge_group destroyed (reason=merged) must not disturb PR 180.
  const unrelatedClose = await advanceBatchOnPullRequestClosed(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 999,
    merged: true,
  });
  assert.equal(unrelatedClose.action, 'ignored');
  const mgMerged = await handleMergeGroupDestroyed(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    reason: 'merged',
    headSha: SHA_3,
  });
  assert.equal(mgMerged.action, 'ignored');

  // Even if pull_request: closed for PR 180 was missed, scheduled reconcileBatch advances to PR 181.
  client.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1, state: 'MERGED' }));
  const watchdog = await reconcileBatch(client, { owner: 'Bibleberry', repo: 'Bibleberry' });
  assert.equal(watchdog.action, 'enqueued');
  assert.equal(client.state?.activePrNumber, 181);
  assert.deepEqual(client.state?.completedPrNumbers, [180]);
});

test('abort racing with advance prevents post-abort enqueue and preserves aborted state', async () => {
  const client = new MockGitHubClient();
  client.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1 }));
  client.prs.set(181, makePr({ id: 'PR_181', number: 181, headRefOid: SHA_2 }));

  const started = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [
      { prNumber: 180, expectedHeadSha: SHA_1 },
      { prNumber: 181, expectedHeadSha: SHA_2 },
    ],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal(started.ok, true);
  client.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1, state: 'MERGED' }));

  // Simulate abort arriving right as advanceBatchOnPullRequestClosed saves its write-ahead state
  // (before advance calls enqueuePullRequest for PR 181).
  let abortRanDuringAdvance = false;
  const originalSave = client.saveBatchState.bind(client);
  client.saveBatchState = async (owner, repo, state) => {
    await originalSave(owner, repo, state);
    if (!abortRanDuringAdvance && state.status === 'enqueuing' && state.activePrNumber === 181) {
      abortRanDuringAdvance = true;
      await abortBatch(client, {
        owner,
        repo,
        actor: 'ContraPhilosophy',
        reason: 'Emergency owner abort',
      });
    }
  };

  const adv = await advanceBatchOnPullRequestClosed(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 180,
    merged: true,
  });

  assert.equal(abortRanDuringAdvance, true);
  assert.equal(adv.action, 'ignored');
  // PR 181 MUST NOT be enqueued after abort, and final state MUST remain 'aborted'.
  assert.deepEqual(client.enqueued, [{ pullRequestId: 'PR_180', expectedHeadOid: SHA_1 }]);
  assert.equal(client.state?.status, 'aborted');
  assert.equal(client.state?.activePrNumber, null);
});

test('watchdog reconcile racing with advance does not regress state or double-enqueue', async () => {
  const client = new MockGitHubClient();
  client.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1 }));
  client.prs.set(181, makePr({ id: 'PR_181', number: 181, headRefOid: SHA_2 }));

  await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [
      { prNumber: 180, expectedHeadSha: SHA_1 },
      { prNumber: 181, expectedHeadSha: SHA_2 },
    ],
    authorizedBy: 'ContraPhilosophy',
  });

  // Simulate a stale reconcileBatch that read status='enqueuing' for PR 180, while a concurrent
  // advance already moved the batch to PR 181 (higher revision).
  client.state = {
    ...client.state!,
    status: 'enqueuing',
    revision: 1,
  };
  client.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1, isInMergeQueue: true }));

  const originalGetPr = client.getPullRequest.bind(client);
  let advancedConcurrently = false;
  client.getPullRequest = async (owner, repo, prNumber) => {
    const pr = await originalGetPr(owner, repo, prNumber);
    if (!advancedConcurrently && prNumber === 180) {
      advancedConcurrently = true;
      // Concurrent advance moves state to PR 181 (revision 3).
      client.state = {
        ...client.state!,
        revision: 3,
        status: 'running',
        nextIndex: 1,
        activePrNumber: 181,
        activeHeadSha: SHA_2,
        completedPrNumbers: [180],
      };
    }
    return pr;
  };

  const rec = await reconcileBatch(client, { owner: 'Bibleberry', repo: 'Bibleberry' });
  assert.equal(rec.action, 'ignored');
  // State must not regress back to PR 180 or overwrite revision 3.
  assert.equal(client.state?.revision, 3);
  assert.equal(client.state?.activePrNumber, 181);
  assert.equal(client.enqueued.length, 1);
});

test('merge-queue-batch workflow enforces main-only trusted checkout, single-writer concurrency, watchdog schedule, and least privilege', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/merge-queue-batch.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /^permissions: \{\}\s*$/m);
  assert.match(workflow, /environment: merge-queue-approval/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /schedule:\s*\n(?:\s*#.*\n)*\s*-\s*cron:\s*['"]\*\/15 \* \* \* \*['"]/);

  // All 5 state-mutating jobs must share the single-writer concurrency group with FIFO queuing (queue: max) and cancel-in-progress: false.
  assert.doesNotMatch(workflow, /^concurrency:\s*$/m);
  assert.doesNotMatch(workflow, /cancel-in-progress:\s*true/);
  const writerMatches =
    workflow.match(
      /concurrency:\s*\n(?:\s*#.*\n)*\s*group: merge-queue-batch-writer\s*\n\s*cancel-in-progress: false\s*\n\s*queue: max/g,
    ) ?? [];
  assert.equal(writerMatches.length, 5);

  // Every privileged workflow_dispatch job must restrict to refs/heads/main and owner ContraPhilosophy.
  assert.match(
    workflow,
    /inputs\.action == 'start' && github\.ref == 'refs\/heads\/main' && github\.actor == 'ContraPhilosophy'/,
  );
  assert.match(
    workflow,
    /inputs\.action == 'reconcile' && github\.ref == 'refs\/heads\/main' && github\.actor == 'ContraPhilosophy'/,
  );
  assert.match(
    workflow,
    /inputs\.action == 'abort' && github\.ref == 'refs\/heads\/main' && github\.actor == 'ContraPhilosophy'/,
  );

  // Every actions/checkout step in the workflow must explicitly check out default_branch (main).
  const checkoutMatches = workflow.match(/uses: actions\/checkout@/g) ?? [];
  const defaultBranchRefMatches = workflow.match(/ref: \$\{\{ github\.event\.repository\.default_branch \}\}/g) ?? [];
  assert.equal(checkoutMatches.length, 7);
  assert.equal(defaultBranchRefMatches.length, 7);
});
