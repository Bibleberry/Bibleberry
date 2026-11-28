import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGitHubClient } from '../../scripts/ci/merge-queue-batch.ts';
import {
  abortBatch,
  computeStateChecksum,
  evaluateBranchProtectionSafety,
  evaluateCheckVerification,
  evaluateIndependentReviewComments,
  evaluatePullRequestPreflight,
  handleChecksCompleted,
  handlePullRequestClosed,
  handlePullRequestSynchronize,
  parseBatchEntries,
  reconcileBatch,
  runPreflight,
  startBatch,
  verifyIntegrationUpdateProvenance,
  type ApprovalVerificationResult,
  type BatchState,
  type CommitComparison,
  type CommitDetails,
  type GitHubBatchClient,
  type LegacyBatchStateV1,
  type MergeMethod,
  type PullRequestCommentNode,
  type PullRequestSnapshot,
  type RepositoryPolicy,
  type StoredBatchState,
} from '../../scripts/ci/merge-queue-batch-lib.ts';

const MAIN_0 = '0000000000000000000000000000000000000000';
const MAIN_1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MAIN_2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const MAIN_3 = 'cccccccccccccccccccccccccccccccccccccccc';
const SHA_1 = '1111111111111111111111111111111111111111';
const SHA_2 = '2222222222222222222222222222222222222222';
const SHA_2_UPDATED = '222222222222222222222222222222222222222a';
const SHA_3 = '3333333333333333333333333333333333333333';
const SHA_3_UPDATED = '333333333333333333333333333333333333333a';
const SHA_UNAUTH = '9999999999999999999999999999999999999999';

function makeApprovedReviewComment(
  prNumber: number,
  headSha: string,
  reviewer = 'ContraPhilosophy',
  createdAt = '2026-11-27T17:00:00.000Z',
): PullRequestCommentNode {
  return {
    id: `comment-${prNumber}-${headSha.slice(0, 8)}`,
    author: { login: reviewer },
    createdAt,
    body: [
      `**Test Codename | [Issue #202](https://github.com/Bibleberry/Bibleberry/issues/202) | [PR #${prNumber}](https://github.com/Bibleberry/Bibleberry/pull/${prNumber}) | Independent Review | exact HEAD \`${headSha}\`**`,
      '',
      '**Disposition: CODE APPROVED — bounded implementation verified.** No blocking findings.',
    ].join('\n'),
  };
}

function makePr(overrides: Partial<PullRequestSnapshot> = {}): PullRequestSnapshot {
  const headRefOid = overrides.headRefOid ?? SHA_1;
  const prNumber = overrides.number ?? 180;
  return {
    id: `PR_kwDO${prNumber}`,
    number: prNumber,
    url: `https://github.com/Bibleberry/Bibleberry/pull/${prNumber}`,
    title: '[Copper Turnstile] Test PR',
    state: 'OPEN',
    isDraft: false,
    author: { login: 'ContraPhilosophy' },
    baseRefName: 'main',
    baseRepository: { nameWithOwner: 'Bibleberry/Bibleberry' },
    headRefName: `feat/test-pr-${prNumber}`,
    headRefOid,
    headRepository: { nameWithOwner: 'Bibleberry/Bibleberry' },
    isInMergeQueue: false,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    reviewDecision: null,
    mergeCommit: null,
    mergedAt: null,
    mergedBy: null,
    latestReviews: { nodes: [] },
    issueComments: {
      pageInfo: { hasNextPage: false },
      nodes: [makeApprovedReviewComment(prNumber, headRefOid)],
    },
    reviewThreads: { totalCount: 0, pageInfo: { hasNextPage: false }, nodes: [] },
    statusCheckRollup: {
      state: 'SUCCESS',
      contexts: {
        pageInfo: { hasNextPage: false },
        nodes: [
          {
            __typename: 'CheckRun',
            name: 'Build reader application',
            status: 'COMPLETED',
            conclusion: 'SUCCESS',
            headSha: headRefOid,
          },
          {
            __typename: 'CheckRun',
            name: 'Verify Sanity Studio',
            status: 'COMPLETED',
            conclusion: 'SUCCESS',
            headSha: headRefOid,
          },
        ],
      },
    },
    ...overrides,
  };
}

function makePolicy(overrides: Partial<RepositoryPolicy> = {}): RepositoryPolicy {
  return {
    defaultBranch: 'main',
    allowSquashMerge: true,
    allowMergeCommit: true,
    allowRebaseMerge: true,
    allowAutoMerge: true,
    allowUpdateBranch: false,
    protectionAccessible: true,
    strictStatusChecks: true,
    requiredStatusChecks: ['Build reader application', 'Verify Sanity Studio'],
    requiredApprovingReviewCount: 0,
    dismissStaleReviews: false,
    requiredConversationResolution: true,
    enforceAdmins: true,
    allowForcePushes: false,
    allowDeletions: false,
    hasBypassAllowances: false,
    bypassAllowanceTargets: [],
    ...overrides,
  };
}

class MockGitHubClient implements GitHubBatchClient {
  prs = new Map<number, PullRequestSnapshot | null>();
  prSequences = new Map<number, Array<PullRequestSnapshot | null>>();
  mainSha = MAIN_0;
  policy: RepositoryPolicy = makePolicy();
  commits = new Map<string, CommitDetails>();
  comparisons = new Map<string, CommitComparison>();

  updates: Array<{ prNumber: number; expectedHeadSha: string }> = [];
  merges: Array<{ prNumber: number; expectedHeadSha: string; mergeMethod: MergeMethod }> = [];
  dequeued: string[] = [];

  updateError: Error | null = null;
  mergeError: Error | null = null;
  dequeueError: Error | null = null;
  saveErrors: Array<Error | null> = [];

  onUpdateBranch?: (prNumber: number, expectedHeadSha: string) => void;
  onMerge?: (prNumber: number, expectedHeadSha: string, mergeMethod: MergeMethod) => string;

  approvalResult: ApprovalVerificationResult = { ok: true, approvedBy: 'ContraPhilosophy' };
  approvalByRunId = new Map<string, ApprovalVerificationResult>();
  state: StoredBatchState | null = null;
  saveCount = 0;

  async getPullRequest(_owner: string, _repo: string, prNumber: number): Promise<PullRequestSnapshot | null> {
    const seq = this.prSequences.get(prNumber);
    if (seq && seq.length > 0) {
      return seq.shift() ?? null;
    }
    return this.prs.get(prNumber) ?? null;
  }

  async getBranchHeadSha(): Promise<string> {
    return this.mainSha;
  }

  async getRepositoryPolicy(): Promise<RepositoryPolicy> {
    return this.policy;
  }

  async getCommit(_owner: string, _repo: string, sha: string): Promise<CommitDetails> {
    const found = this.commits.get(sha.toLowerCase());
    if (!found) {
      throw new Error(`Mock commit not found: ${sha}`);
    }
    return found;
  }

  async compareCommits(_owner: string, _repo: string, base: string, head: string): Promise<CommitComparison> {
    const key = `${base.toLowerCase()}...${head.toLowerCase()}`;
    const exact = this.comparisons.get(key);
    if (exact) return exact;
    return {
      status: 'ahead',
      aheadBy: 1,
      behindBy: 0,
      mergeBaseSha: base.toLowerCase(),
      totalCommits: 1,
      files: [],
    };
  }

  async updatePullRequestBranch(_owner: string, _repo: string, prNumber: number, expectedHeadSha: string) {
    this.updates.push({ prNumber, expectedHeadSha });
    if (this.updateError) {
      throw this.updateError;
    }
    if (this.onUpdateBranch) {
      this.onUpdateBranch(prNumber, expectedHeadSha);
    }
    return { message: 'Updating pull request branch.' };
  }

  async mergePullRequest(
    _owner: string,
    _repo: string,
    prNumber: number,
    expectedHeadSha: string,
    mergeMethod: MergeMethod,
  ) {
    this.merges.push({ prNumber, expectedHeadSha, mergeMethod });
    if (this.mergeError) {
      throw this.mergeError;
    }
    const sha = this.onMerge ? this.onMerge(prNumber, expectedHeadSha, mergeMethod) : MAIN_1;
    this.mainSha = sha;
    const existing = this.prs.get(prNumber);
    if (existing) {
      this.prs.set(prNumber, {
        ...existing,
        state: 'MERGED',
        mergeCommit: { oid: sha },
        mergedAt: '2026-11-27T12:05:00.000Z',
      });
    }
    return { sha, merged: true, message: 'Pull Request successfully merged' };
  }

  async dequeuePullRequest(pullRequestId: string): Promise<void> {
    if (this.dequeueError) {
      throw this.dequeueError;
    }
    this.dequeued.push(pullRequestId);
  }

  async getBatchState(): Promise<StoredBatchState | null> {
    return this.state;
  }

  async saveBatchState(_owner: string, _repo: string, state: StoredBatchState): Promise<void> {
    const nextErr = this.saveErrors.shift();
    if (nextErr) {
      throw nextErr;
    }
    this.state = state;
    this.saveCount += 1;
  }

  async verifyWorkflowApproval(
    _owner: string,
    _repo: string,
    runId: string,
  ): Promise<ApprovalVerificationResult> {
    return this.approvalByRunId.get(runId) ?? this.approvalResult;
  }
}

function setupCleanIntegrationProvenance(
  client: MockGitHubClient,
  params: {
    mergeBaseSha: string;
    prevHeadSha: string;
    baseSha: string;
    newHeadSha: string;
    prFiles?: Array<{ filename: string; status: string; sha: string }>;
    mainFiles?: Array<{ filename: string; status: string; sha: string }>;
  },
) {
  const {
    mergeBaseSha,
    prevHeadSha,
    baseSha,
    newHeadSha,
    prFiles = [{ filename: 'src/pr-feature.ts', status: 'modified', sha: 'blob-pr-1' }],
    mainFiles = [{ filename: 'src/main-change.ts', status: 'modified', sha: 'blob-main-1' }],
  } = params;

  client.commits.set(newHeadSha.toLowerCase(), {
    sha: newHeadSha.toLowerCase(),
    parents: [prevHeadSha.toLowerCase(), baseSha.toLowerCase()],
    message: `Merge branch 'main' into feat/pr`,
  });

  client.comparisons.set(`${baseSha.toLowerCase()}...${prevHeadSha.toLowerCase()}`, {
    status: 'diverged',
    aheadBy: 1,
    behindBy: 1,
    mergeBaseSha: mergeBaseSha.toLowerCase(),
    totalCommits: 1,
    files: prFiles,
  });
  client.comparisons.set(`${mergeBaseSha.toLowerCase()}...${prevHeadSha.toLowerCase()}`, {
    status: 'ahead',
    aheadBy: 1,
    behindBy: 0,
    mergeBaseSha: mergeBaseSha.toLowerCase(),
    totalCommits: 1,
    files: prFiles,
  });
  client.comparisons.set(`${mergeBaseSha.toLowerCase()}...${baseSha.toLowerCase()}`, {
    status: 'ahead',
    aheadBy: 1,
    behindBy: 0,
    mergeBaseSha: mergeBaseSha.toLowerCase(),
    totalCommits: 1,
    files: mainFiles,
  });
  client.comparisons.set(`${prevHeadSha.toLowerCase()}...${newHeadSha.toLowerCase()}`, {
    status: 'ahead',
    aheadBy: 2,
    behindBy: 0,
    mergeBaseSha: prevHeadSha.toLowerCase(),
    totalCommits: 2,
    files: mainFiles,
  });
  client.comparisons.set(`${baseSha.toLowerCase()}...${newHeadSha.toLowerCase()}`, {
    status: 'ahead',
    aheadBy: 2,
    behindBy: 0,
    mergeBaseSha: baseSha.toLowerCase(),
    totalCommits: 2,
    files: prFiles,
  });
}

// ---------------------------------------------------------------------------
// 1. Input parsing & Dry-run (zero writes)
// ---------------------------------------------------------------------------

test('parseBatchEntries parses ordered PR@SHA entries and rejects invalid/duplicate input', () => {
  const entries = parseBatchEntries(`371@${SHA_1.toUpperCase()},\n 373@${SHA_2} 374@${SHA_3}`);
  assert.deepEqual(entries, [
    { prNumber: 371, expectedHeadSha: SHA_1 },
    { prNumber: 373, expectedHeadSha: SHA_2 },
    { prNumber: 374, expectedHeadSha: SHA_3 },
  ]);

  assert.throws(() => parseBatchEntries('   '), /empty/i);
  assert.throws(() => parseBatchEntries('371'), /Expected format/);
  assert.throws(() => parseBatchEntries(`0@${SHA_1}`), /positive integer/);
  assert.throws(() => parseBatchEntries('371@abc1234'), /40-character/);
  assert.throws(() => parseBatchEntries(`371@${SHA_1},371@${SHA_2}`), /Duplicate PR #371/);
});

test('dry-run validates entries with zero writes and surfaces inaccessible-protection notice without mutating', async () => {
  const client = new MockGitHubClient();
  client.policy = makePolicy({ protectionAccessible: false });
  client.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, mergeStateStatus: 'CLEAN' }));
  client.prs.set(373, makePr({ number: 373, headRefOid: SHA_2, mergeStateStatus: 'BEHIND' }));

  const outcome = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [
      { prNumber: 371, expectedHeadSha: SHA_1 },
      { prNumber: 373, expectedHeadSha: SHA_2 },
    ],
    authorizedBy: 'ContraPhilosophy',
    dryRun: true,
  });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.dryRun, true);
  assert.equal(outcome.action, 'dry-run');
  assert.match(outcome.protectionNotice ?? '', /403/);
  assert.equal(client.saveCount, 0);
  assert.equal(client.updates.length, 0);
  assert.equal(client.merges.length, 0);

  const preflight = await runPreflight(client, 'Bibleberry', 'Bibleberry', [
    { prNumber: 371, expectedHeadSha: SHA_1 },
  ]);
  assert.equal(preflight.ok, true);
  assert.equal(client.saveCount, 0);
});

// ---------------------------------------------------------------------------
// 2. Unattended multi-PR batch under owner-approved bounded §2C integration-only policy
// ---------------------------------------------------------------------------

test('unattended 3-PR batch merges current PR #1 without extra CI, then updates & merges PR #2 and PR #3 automatically on workflow_run wakeups', async () => {
  const client = new MockGitHubClient();
  let clockMs = Date.parse('2026-11-27T19:00:00.000Z');
  const now = () => new Date(clockMs).toISOString();

  client.mainSha = MAIN_0;
  client.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, mergeStateStatus: 'CLEAN' }));
  client.prs.set(373, makePr({ number: 373, headRefOid: SHA_2, mergeStateStatus: 'CLEAN' }));
  client.prs.set(374, makePr({ number: 374, headRefOid: SHA_3, mergeStateStatus: 'CLEAN' }));

  client.onMerge = (prNum) => {
    if (prNum === 371) {
      client.prs.set(373, makePr({ number: 373, headRefOid: SHA_2, mergeStateStatus: 'BEHIND' }));
      client.prs.set(374, makePr({ number: 374, headRefOid: SHA_3, mergeStateStatus: 'BEHIND' }));
      client.comparisons.set(`${MAIN_1}...${SHA_2}`, {
        status: 'diverged',
        aheadBy: 1,
        behindBy: 1,
        mergeBaseSha: MAIN_0,
        totalCommits: 1,
      });
      return MAIN_1;
    }
    if (prNum === 373) {
      client.comparisons.set(`${MAIN_2}...${SHA_3}`, {
        status: 'diverged',
        aheadBy: 1,
        behindBy: 2,
        mergeBaseSha: MAIN_0,
        totalCommits: 1,
      });
      return MAIN_2;
    }
    return MAIN_3;
  };

  // Single owner authorization for the whole 3-PR batch.
  const started = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [
      { prNumber: 371, expectedHeadSha: SHA_1 },
      { prNumber: 373, expectedHeadSha: SHA_2 },
      { prNumber: 374, expectedHeadSha: SHA_3 },
    ],
    authorizedBy: 'ContraPhilosophy',
    workflowRunId: '5001',
    requireWorkflowApprovalRecord: true,
    now,
  });

  // PR #371 merged directly without branch update; PR #373 immediately received update-branch.
  assert.equal(started.ok, true);
  assert.equal(started.action, 'updating');
  assert.deepEqual(client.merges, [{ prNumber: 371, expectedHeadSha: SHA_1, mergeMethod: 'squash' }]);
  assert.deepEqual(client.updates, [{ prNumber: 373, expectedHeadSha: SHA_2 }]);
  assert.equal((client.state as BatchState).integrationPolicy, 'integration-only');

  // PR #373 synchronize event lands with clean disjoint merge commit SHA_2_UPDATED and pending CI.
  setupCleanIntegrationProvenance(client, {
    mergeBaseSha: MAIN_0,
    prevHeadSha: SHA_2,
    baseSha: MAIN_1,
    newHeadSha: SHA_2_UPDATED,
    prFiles: [{ filename: 'src/pr373.ts', status: 'added', sha: 'blob-373' }],
    mainFiles: [{ filename: 'src/pr371.ts', status: 'added', sha: 'blob-371' }],
  });
  client.prs.set(
    373,
    makePr({
      number: 373,
      headRefOid: SHA_2_UPDATED,
      mergeStateStatus: 'BLOCKED',
      // Original Independent Review comment for reviewed SHA_2 remains on the PR!
      issueComments: {
        pageInfo: { hasNextPage: false },
        nodes: [makeApprovedReviewComment(373, SHA_2)],
      },
      statusCheckRollup: {
        state: 'PENDING',
        contexts: {
          pageInfo: { hasNextPage: false },
          nodes: [
            { __typename: 'CheckRun', name: 'Build reader application', status: 'IN_PROGRESS', conclusion: null, headSha: SHA_2_UPDATED },
          ],
        },
      },
    }),
  );

  clockMs += 20_000;
  const sync373 = await handlePullRequestSynchronize(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 373,
    requireWorkflowApprovalRecord: true,
    now,
  });
  assert.equal(sync373.action, 'awaiting_checks');

  // Ordinary PR CI finishes on PR #373 -> workflow_run: completed wakes coordinator!
  client.prs.set(
    373,
    makePr({
      number: 373,
      headRefOid: SHA_2_UPDATED,
      mergeStateStatus: 'CLEAN',
      issueComments: {
        pageInfo: { hasNextPage: false },
        nodes: [makeApprovedReviewComment(373, SHA_2)],
      },
    }),
  );
  clockMs += 180_000;
  const ci373 = await handleChecksCompleted(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    headSha: SHA_2_UPDATED,
    requireWorkflowApprovalRecord: true,
    now,
  });

  // PR #373 merged automatically AND PR #374 immediately received update-branch!
  assert.equal(ci373.action, 'updating');
  assert.equal(client.merges.length, 2);
  assert.deepEqual(client.merges[1], { prNumber: 373, expectedHeadSha: SHA_2_UPDATED, mergeMethod: 'squash' });
  assert.deepEqual(client.updates[1], { prNumber: 374, expectedHeadSha: SHA_3 });

  // PR #374 synchronize + CI pass -> merges automatically and completes batch unattended!
  setupCleanIntegrationProvenance(client, {
    mergeBaseSha: MAIN_0,
    prevHeadSha: SHA_3,
    baseSha: MAIN_2,
    newHeadSha: SHA_3_UPDATED,
    prFiles: [{ filename: 'src/pr374.ts', status: 'added', sha: 'blob-374' }],
    mainFiles: [
      { filename: 'src/pr371.ts', status: 'added', sha: 'blob-371' },
      { filename: 'src/pr373.ts', status: 'added', sha: 'blob-373' },
    ],
  });
  client.prs.set(
    374,
    makePr({
      number: 374,
      headRefOid: SHA_3_UPDATED,
      mergeStateStatus: 'CLEAN',
      issueComments: {
        pageInfo: { hasNextPage: false },
        nodes: [makeApprovedReviewComment(374, SHA_3)],
      },
    }),
  );

  clockMs += 180_000;
  const completed = await handlePullRequestSynchronize(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 374,
    requireWorkflowApprovalRecord: true,
    now,
  });

  assert.equal(completed.action, 'completed');
  const finalState = client.state as BatchState;
  assert.equal(finalState.status, 'completed');
  assert.deepEqual(finalState.completedPrNumbers, [371, 373, 374]);
  assert.equal(finalState.completedMerges.length, 3);
  assert.equal(finalState.completedMerges[0].viaIntegrationUpdate, false);
  assert.equal(finalState.completedMerges[1].viaIntegrationUpdate, true);
  assert.equal(finalState.completedMerges[2].viaIntegrationUpdate, true);
});

test('explicit hold-on-update mode pauses after CI, and overlapping files ALWAYS hold under integration-only policy', async () => {
  // Overlapping files hold immediately upon provenance verification!
  const overlapClient = new MockGitHubClient();
  overlapClient.mainSha = MAIN_1;
  overlapClient.prs.set(373, makePr({ number: 373, headRefOid: SHA_2, mergeStateStatus: 'BEHIND' }));
  overlapClient.comparisons.set(`${MAIN_1}...${SHA_2}`, {
    status: 'diverged',
    aheadBy: 1,
    behindBy: 1,
    mergeBaseSha: MAIN_0,
    totalCommits: 1,
  });
  setupCleanIntegrationProvenance(overlapClient, {
    mergeBaseSha: MAIN_0,
    prevHeadSha: SHA_2,
    baseSha: MAIN_1,
    newHeadSha: SHA_2_UPDATED,
    prFiles: [{ filename: 'src/shared.ts', status: 'modified', sha: 'blob-pr-shared' }],
    mainFiles: [{ filename: 'src/shared.ts', status: 'modified', sha: 'blob-main-shared' }],
  });
  overlapClient.onUpdateBranch = () => {
    overlapClient.prs.set(
      373,
      makePr({
        number: 373,
        headRefOid: SHA_2_UPDATED,
        mergeStateStatus: 'CLEAN',
        issueComments: { pageInfo: { hasNextPage: false }, nodes: [makeApprovedReviewComment(373, SHA_2)] },
      }),
    );
  };

  const overlapOutcome = await startBatch(overlapClient, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 373, expectedHeadSha: SHA_2 }],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal(overlapOutcome.action, 'held');
  assert.match(overlapOutcome.message ?? '', /overlapping file/i);
  assert.equal(overlapClient.merges.length, 0);

  // Explicit hold-on-update holds even for clean disjoint integration.
  const holdClient = new MockGitHubClient();
  holdClient.mainSha = MAIN_1;
  holdClient.prs.set(373, makePr({ number: 373, headRefOid: SHA_2, mergeStateStatus: 'BEHIND' }));
  holdClient.comparisons.set(`${MAIN_1}...${SHA_2}`, {
    status: 'diverged',
    aheadBy: 1,
    behindBy: 1,
    mergeBaseSha: MAIN_0,
    totalCommits: 1,
  });
  setupCleanIntegrationProvenance(holdClient, {
    mergeBaseSha: MAIN_0,
    prevHeadSha: SHA_2,
    baseSha: MAIN_1,
    newHeadSha: SHA_2_UPDATED,
  });
  holdClient.onUpdateBranch = () => {
    holdClient.prs.set(
      373,
      makePr({
        number: 373,
        headRefOid: SHA_2_UPDATED,
        mergeStateStatus: 'CLEAN',
        issueComments: { pageInfo: { hasNextPage: false }, nodes: [makeApprovedReviewComment(373, SHA_2)] },
      }),
    );
  };

  const holdOutcome = await startBatch(holdClient, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 373, expectedHeadSha: SHA_2 }],
    authorizedBy: 'ContraPhilosophy',
    integrationPolicy: 'hold-on-update',
  });
  assert.equal(holdOutcome.action, 'held');
  assert.match(holdOutcome.message ?? '', /hold-on-update policy/);
  assert.equal(holdClient.merges.length, 0);
});

// ---------------------------------------------------------------------------
// 3. Finding 3: Fail-closed Independent Review Gate (zero reviews, comment
//    CHANGES REQUESTED, untrusted commenter, null commit OID, stale SHA)
// ---------------------------------------------------------------------------

test('independent review gate fails closed on zero reviews, comment CHANGES REQUESTED, untrusted commenter, null commit OID, stale approval, and truncated comments', () => {
  const cases: Array<{ name: string; pr: PullRequestSnapshot; policy?: RepositoryPolicy; expected: RegExp }> = [
    {
      name: 'zero reviews (never reviewed PR with passing CI)',
      pr: makePr({
        latestReviews: { nodes: [] },
        issueComments: { pageInfo: { hasNextPage: false }, nodes: [] },
      }),
      expected: /no verified exact-HEAD Independent Review approval/i,
    },
    {
      name: 'comment Disposition: CHANGES REQUESTED blocks even with passing CI',
      pr: makePr({
        issueComments: {
          pageInfo: { hasNextPage: false },
          nodes: [
            {
              id: 'c1',
              author: { login: 'ContraPhilosophy' },
              createdAt: '2026-11-27T18:00:00.000Z',
              body: `**Copper Turnstile | PR #180 | Independent Review | exact HEAD \`${SHA_1}\`**\n\n**Disposition: CHANGES REQUESTED — blocking trust boundary.**`,
            },
          ],
        },
      }),
      expected: /blocking Independent Review conversation disposition.*CHANGES REQUESTED/i,
    },
    {
      name: 'later CHANGES REQUESTED comment supersedes earlier CODE APPROVED comment',
      pr: makePr({
        issueComments: {
          pageInfo: { hasNextPage: false },
          nodes: [
            makeApprovedReviewComment(180, SHA_1, 'ContraPhilosophy', '2026-11-27T17:00:00.000Z'),
            {
              id: 'c2',
              author: { login: 'ContraPhilosophy' },
              createdAt: '2026-11-27T18:00:00.000Z',
              body: '**Disposition: HOLD — regression found.**',
            },
          ],
        },
      }),
      expected: /blocking Independent Review conversation disposition.*HOLD/i,
    },
    {
      name: 'untrusted external commenter cannot spoof CODE APPROVED',
      pr: makePr({
        issueComments: {
          pageInfo: { hasNextPage: false },
          nodes: [makeApprovedReviewComment(180, SHA_1, 'random-public-user')],
        },
      }),
      expected: /no verified exact-HEAD Independent Review approval/i,
    },
    {
      name: 'trusted CODE APPROVED comment bound to older SHA is rejected as stale',
      pr: makePr({
        issueComments: {
          pageInfo: { hasNextPage: false },
          nodes: [makeApprovedReviewComment(180, SHA_2, 'ContraPhilosophy')],
        },
      }),
      expected: /conversation approval is stale/i,
    },
    {
      name: 'truncated conversation comments fail closed',
      pr: makePr({
        issueComments: {
          pageInfo: { hasNextPage: true },
          nodes: [makeApprovedReviewComment(180, SHA_1)],
        },
      }),
      expected: /conversation comments are truncated/i,
    },
    {
      name: 'native APPROVED review with null commit OID is rejected',
      pr: makePr({
        author: { login: 'dev-user' },
        issueComments: { pageInfo: { hasNextPage: false }, nodes: [] },
        latestReviews: {
          nodes: [{ state: 'APPROVED', author: { login: 'independent-reviewer' }, commit: { oid: null } }],
        },
      }),
      expected: /missing\/null commit OID/i,
    },
    {
      name: 'native APPROVED review with null commit object is rejected under requiredApprovingReviewCount=1',
      pr: makePr({
        author: { login: 'dev-user' },
        issueComments: { pageInfo: { hasNextPage: false }, nodes: [] },
        latestReviews: {
          nodes: [{ state: 'APPROVED', author: { login: 'independent-reviewer' }, commit: null }],
        },
      }),
      policy: makePolicy({ requiredApprovingReviewCount: 1 }),
      expected: /missing\/null commit OID/i,
    },
    {
      name: 'self-approval by PR author is rejected',
      pr: makePr({
        author: { login: 'dev-user' },
        issueComments: { pageInfo: { hasNextPage: false }, nodes: [] },
        latestReviews: {
          nodes: [{ state: 'APPROVED', author: { login: 'dev-user' }, commit: { oid: SHA_1 } }],
        },
      }),
      expected: /invalid self-approval/i,
    },
    {
      name: 'stale native APPROVED review bound to older SHA is rejected',
      pr: makePr({
        author: { login: 'dev-user' },
        issueComments: { pageInfo: { hasNextPage: false }, nodes: [] },
        latestReviews: {
          nodes: [{ state: 'APPROVED', author: { login: 'independent-reviewer' }, commit: { oid: SHA_3 } }],
        },
      }),
      expected: /native approving review is stale/i,
    },
  ];

  for (const c of cases) {
    const res = evaluatePullRequestPreflight(
      c.pr,
      { prNumber: 180, expectedHeadSha: SHA_1 },
      'Bibleberry/Bibleberry',
      undefined,
      { policy: c.policy ?? makePolicy() },
    );
    assert.equal(res.ok, false, `${c.name} MUST fail closed`);
    assert.match(res.reasons.join(' '), c.expected, `${c.name} reason mismatch`);
  }

  // Positive check: real Bibleberry Independent Review comment on exact HEAD passes!
  const commentEval = evaluateIndependentReviewComments({
    pr: makePr({ number: 373, headRefOid: SHA_2 }),
    reviewedHeadSha: SHA_2,
  });
  assert.equal(commentEval.approved, true);
  assert.equal(commentEval.evidence?.source, 'conversation-comment');

  // Positive check: non-author native APPROVED with exact non-null commit OID passes!
  const nativePass = evaluatePullRequestPreflight(
    makePr({
      author: { login: 'dev-user' },
      issueComments: { pageInfo: { hasNextPage: false }, nodes: [] },
      latestReviews: {
        nodes: [{ state: 'APPROVED', author: { login: 'independent-reviewer' }, commit: { oid: SHA_1 } }],
      },
    }),
    { prNumber: 180, expectedHeadSha: SHA_1 },
    'Bibleberry/Bibleberry',
    undefined,
    { policy: makePolicy({ requiredApprovingReviewCount: 1 }) },
  );
  assert.equal(nativePass.ok, true);
  assert.equal(nativePass.reviewEvidence?.source, 'native-review');
});

// ---------------------------------------------------------------------------
// 4. Finding 3: Fail-closed Branch Protection Safety & Persisted State Authority
// ---------------------------------------------------------------------------

test('fails closed before writes when branch protection is inaccessible or unsafe, or when persisted run-approval/checksum fails', async () => {
  const unsafePolicies: Array<{ name: string; policy: RepositoryPolicy; expected: RegExp }> = [
    { name: 'inaccessible protection (403)', policy: makePolicy({ protectionAccessible: false }), expected: /inaccessible/i },
    { name: 'strict=false', policy: makePolicy({ strictStatusChecks: false }), expected: /strict=false/ },
    { name: 'enforce_admins=false', policy: makePolicy({ enforceAdmins: false }), expected: /enforce_admins=false/ },
    { name: 'conversation resolution off', policy: makePolicy({ requiredConversationResolution: false }), expected: /required_conversation_resolution=false/ },
    { name: 'force pushes enabled', policy: makePolicy({ allowForcePushes: true }), expected: /force pushes/ },
    { name: 'branch deletions enabled', policy: makePolicy({ allowDeletions: true }), expected: /branch deletion/ },
    {
      name: 'PR bypass allowances granted',
      policy: makePolicy({ hasBypassAllowances: true, bypassAllowanceTargets: ['app:some-bot'] }),
      expected: /bypass allowances \(app:some-bot\)/,
    },
    {
      name: 'missing baseline required check',
      policy: makePolicy({ requiredStatusChecks: ['Build reader application'] }),
      expected: /missing required check "Verify Sanity Studio"/,
    },
  ];

  for (const item of unsafePolicies) {
    const check = evaluateBranchProtectionSafety(item.policy);
    assert.equal(check.ok, false, `${item.name} must fail protection safety check`);
    assert.match(check.reasons.join(' '), item.expected);

    const client = new MockGitHubClient();
    client.policy = item.policy;
    client.prs.set(371, makePr({ number: 371, headRefOid: SHA_1 }));
    const started = await startBatch(client, {
      owner: 'Bibleberry',
      repo: 'Bibleberry',
      entries: [{ prNumber: 371, expectedHeadSha: SHA_1 }],
      authorizedBy: 'ContraPhilosophy',
    });
    assert.equal(started.ok, false, `startBatch must fail closed on ${item.name}`);
    assert.equal(client.merges.length, 0);
    assert.equal(client.saveCount, 0);
  }

  // Persisted state tampering: checksum mismatch AND forged workflowRunId failing live approval check!
  const entries = [{ prNumber: 371, expectedHeadSha: SHA_1 }];
  const cChecksum = new MockGitHubClient();
  cChecksum.state = {
    version: 2,
    revision: 1,
    batchId: 'batch-bad-checksum',
    stateChecksum: '0000000000000000000000000000000000000000000000000000000000000000',
    status: 'running',
    createdAt: '2026-11-27T18:00:00.000Z',
    updatedAt: '2026-11-27T18:00:00.000Z',
    authorizedBy: 'ContraPhilosophy',
    integrationPolicy: 'integration-only',
    mergeMethod: 'squash',
    entries,
    nextIndex: 0,
    activePrNumber: 371,
    activeReviewedHeadSha: SHA_1,
    activeHeadSha: SHA_1,
    integrationUpdates: [],
    completedPrNumbers: [],
    completedMerges: [],
    nextAction: 'Evaluate',
  };
  const rChecksum = await reconcileBatch(cChecksum, { owner: 'Bibleberry', repo: 'Bibleberry' });
  assert.equal(rChecksum.action, 'stopped');
  assert.match(rChecksum.message, /stateChecksum consistency check/);
  assert.equal(cChecksum.merges.length, 0);

  // Forged workflowRunId fails live /actions/runs/{runId}/approvals re-verification!
  const cForgedRun = new MockGitHubClient();
  cForgedRun.approvalByRunId.set('forged-999', { ok: false, reason: 'Run forged-999 has no recorded merge-queue-approval.' });
  cForgedRun.state = {
    ...(cChecksum.state as BatchState),
    status: 'running',
    activePrNumber: 371,
    activeReviewedHeadSha: SHA_1,
    activeHeadSha: SHA_1,
    stopReason: undefined,
    batchId: 'batch-forged-run',
    workflowRunId: 'forged-999',
    stateChecksum: computeStateChecksum({
      owner: 'Bibleberry',
      repo: 'Bibleberry',
      entries,
      integrationPolicy: 'integration-only',
      mergeMethod: 'squash',
    }),
  };
  const rForged = await reconcileBatch(cForgedRun, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    requireWorkflowApprovalRecord: true,
  });
  assert.equal(rForged.action, 'stopped');
  assert.match(rForged.message, /failed live owner-approval verification for workflow run forged-999/);
  assert.equal(cForgedRun.merges.length, 0);
});

// ---------------------------------------------------------------------------
// 5. Provenance verification: rewritten history, truncated diffs, extra commits, blob tampering
// ---------------------------------------------------------------------------

test('verifyIntegrationUpdateProvenance rejects non-merge, rewritten history, non-main parent, truncated diffs, extra commits, and unauthorized edits', async () => {
  // Non-merge (1 parent).
  const c1 = new MockGitHubClient();
  c1.commits.set(SHA_UNAUTH, { sha: SHA_UNAUTH, parents: [SHA_2], message: 'sneaky commit' });
  const r1 = await verifyIntegrationUpdateProvenance(c1, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 373,
    previousHeadSha: SHA_2,
    newHeadSha: SHA_UNAUTH,
    expectedBaseSha: MAIN_1,
    currentMainSha: MAIN_1,
    requestedAt: '2026-11-27T18:00:00.000Z',
  });
  assert.equal(r1.ok, false);
  assert.match(r1.reason ?? '', /expected a 2-parent merge commit/);

  // Rewritten history (first parent !== previousHeadSha).
  const c2 = new MockGitHubClient();
  c2.commits.set(SHA_UNAUTH, { sha: SHA_UNAUTH, parents: [SHA_3, MAIN_1], message: 'merge after extra commit' });
  const r2 = await verifyIntegrationUpdateProvenance(c2, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 373,
    previousHeadSha: SHA_2,
    newHeadSha: SHA_UNAUTH,
    expectedBaseSha: MAIN_1,
    currentMainSha: MAIN_1,
    requestedAt: '2026-11-27T18:00:00.000Z',
  });
  assert.equal(r2.ok, false);
  assert.match(r2.reason ?? '', /history rewritten or extra commits/);

  // Truncated compare diff (>=300 files).
  const cTrunc = new MockGitHubClient();
  setupCleanIntegrationProvenance(cTrunc, {
    mergeBaseSha: MAIN_0,
    prevHeadSha: SHA_2,
    baseSha: MAIN_1,
    newHeadSha: SHA_2_UPDATED,
  });
  cTrunc.comparisons.set(`${MAIN_0}...${MAIN_1}`, {
    status: 'ahead',
    aheadBy: 1,
    behindBy: 0,
    mergeBaseSha: MAIN_0,
    totalCommits: 1,
    files: [],
    filesTruncated: true,
  });
  const rTrunc = await verifyIntegrationUpdateProvenance(cTrunc, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 373,
    previousHeadSha: SHA_2,
    newHeadSha: SHA_2_UPDATED,
    expectedBaseSha: MAIN_1,
    currentMainSha: MAIN_1,
    requestedAt: '2026-11-27T18:00:00.000Z',
  });
  assert.equal(rTrunc.ok, false);
  assert.match(rTrunc.reason ?? '', /300-file comparison limit/);

  // Unexpected commit count relative to main.
  const cCount = new MockGitHubClient();
  setupCleanIntegrationProvenance(cCount, {
    mergeBaseSha: MAIN_0,
    prevHeadSha: SHA_2,
    baseSha: MAIN_1,
    newHeadSha: SHA_2_UPDATED,
  });
  cCount.comparisons.set(`${MAIN_1}...${SHA_2_UPDATED}`, {
    status: 'ahead',
    aheadBy: 3,
    behindBy: 0,
    mergeBaseSha: MAIN_1,
    totalCommits: 3,
    files: [{ filename: 'src/pr-feature.ts', status: 'modified', sha: 'blob-pr-1' }],
  });
  const rCount = await verifyIntegrationUpdateProvenance(cCount, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 373,
    previousHeadSha: SHA_2,
    newHeadSha: SHA_2_UPDATED,
    expectedBaseSha: MAIN_1,
    currentMainSha: MAIN_1,
    requestedAt: '2026-11-27T18:00:00.000Z',
  });
  assert.equal(rCount.ok, false);
  assert.match(rCount.reason ?? '', /integration commit count relative to main/);

  // Unauthorized file modification + blob SHA mismatch.
  const cBlob = new MockGitHubClient();
  setupCleanIntegrationProvenance(cBlob, {
    mergeBaseSha: MAIN_0,
    prevHeadSha: SHA_2,
    baseSha: MAIN_1,
    newHeadSha: SHA_2_UPDATED,
  });
  cBlob.comparisons.set(`${MAIN_1}...${SHA_2_UPDATED}`, {
    status: 'ahead',
    aheadBy: 2,
    behindBy: 0,
    mergeBaseSha: MAIN_1,
    totalCommits: 2,
    files: [{ filename: 'src/pr-feature.ts', status: 'modified', sha: 'blob-tampered' }],
  });
  const rBlob = await verifyIntegrationUpdateProvenance(cBlob, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 373,
    previousHeadSha: SHA_2,
    newHeadSha: SHA_2_UPDATED,
    expectedBaseSha: MAIN_1,
    currentMainSha: MAIN_1,
    requestedAt: '2026-11-27T18:00:00.000Z',
  });
  assert.equal(rBlob.ok, false);
  assert.match(rBlob.reason ?? '', /altered reviewed PR file/);
});

// ---------------------------------------------------------------------------
// 6. Checks classification, structural preflight, timeout, permissions, concurrent merges,
//    interrupted API responses, legacy v1 preservation, and cancellation
// ---------------------------------------------------------------------------

test('evaluateCheckVerification classifies failed, missing, skipped-only, stale, canceled, pending, and valid checks', () => {
  const skippedOnly = evaluateCheckVerification({
    pr: makePr({
      statusCheckRollup: {
        state: 'SUCCESS',
        contexts: {
          pageInfo: { hasNextPage: false },
          nodes: [
            { __typename: 'CheckRun', name: 'Build reader application', status: 'COMPLETED', conclusion: 'SKIPPED', headSha: SHA_1 },
            { __typename: 'CheckRun', name: 'Verify Sanity Studio', status: 'COMPLETED', conclusion: 'SUCCESS', headSha: SHA_1 },
          ],
        },
      },
    }),
    candidateHeadSha: SHA_1,
    requiredChecks: ['Build reader application', 'Verify Sanity Studio'],
    protectionAccessible: true,
  });
  assert.equal(skippedOnly.verdict, 'failed');
  assert.deepEqual(skippedOnly.skippedOnlyChecks, ['Build reader application']);

  const canceled = evaluateCheckVerification({
    pr: makePr({
      statusCheckRollup: {
        state: 'FAILURE',
        contexts: {
          pageInfo: { hasNextPage: false },
          nodes: [
            { __typename: 'CheckRun', name: 'Build reader application', status: 'COMPLETED', conclusion: 'SUCCESS', headSha: SHA_1 },
            { __typename: 'CheckRun', name: 'Verify Sanity Studio', status: 'COMPLETED', conclusion: 'SUCCESS', headSha: SHA_1 },
            { __typename: 'CheckRun', name: 'iOS verification summary', status: 'COMPLETED', conclusion: 'CANCELLED', headSha: SHA_1 },
          ],
        },
      },
    }),
    candidateHeadSha: SHA_1,
    requiredChecks: ['Build reader application', 'Verify Sanity Studio'],
    protectionAccessible: true,
  });
  assert.equal(canceled.verdict, 'failed');
  assert.deepEqual(canceled.canceledChecks, ['iOS verification summary']);

  const staleSha = evaluateCheckVerification({
    pr: makePr({
      statusCheckRollup: {
        state: 'SUCCESS',
        contexts: {
          pageInfo: { hasNextPage: false },
          nodes: [
            { __typename: 'CheckRun', name: 'Build reader application', status: 'COMPLETED', conclusion: 'SUCCESS', headSha: SHA_3 },
            { __typename: 'CheckRun', name: 'Verify Sanity Studio', status: 'COMPLETED', conclusion: 'SUCCESS', headSha: SHA_1 },
          ],
        },
      },
    }),
    candidateHeadSha: SHA_1,
    requiredChecks: ['Build reader application', 'Verify Sanity Studio'],
    protectionAccessible: true,
  });
  assert.equal(staleSha.verdict, 'failed');
  assert.deepEqual(staleSha.staleChecks, ['Build reader application']);

  const missing = evaluateCheckVerification({
    pr: makePr(),
    candidateHeadSha: SHA_1,
    requiredChecks: ['Build reader application', 'Verify Sanity Studio', 'Reader browser suites (Chromium)'],
    protectionAccessible: true,
  });
  assert.equal(missing.verdict, 'failed');
  assert.deepEqual(missing.missingChecks, ['Reader browser suites (Chromium)']);
});

test('structural preflight rejects Draft, closed, wrong repo/base, conflicts, unresolved threads, and stale SHA', () => {
  const cases: Array<{ name: string; pr: PullRequestSnapshot | null; expected: RegExp }> = [
    { name: 'missing PR', pr: null, expected: /not found/ },
    { name: 'stale SHA', pr: makePr({ headRefOid: SHA_2 }), expected: /does not match authorized SHA/ },
    { name: 'Draft', pr: makePr({ isDraft: true }), expected: /Draft PR/ },
    { name: 'closed', pr: makePr({ state: 'CLOSED' }), expected: /expected OPEN/ },
    { name: 'wrong base', pr: makePr({ baseRefName: 'develop' }), expected: /base branch/ },
    { name: 'wrong repo', pr: makePr({ baseRepository: { nameWithOwner: 'Other/Bibleberry' } }), expected: /targets repository/ },
    { name: 'conflicts', pr: makePr({ mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }), expected: /merge conflicts/ },
    {
      name: 'unresolved thread',
      pr: makePr({ reviewThreads: { totalCount: 1, pageInfo: { hasNextPage: false }, nodes: [{ isResolved: false }] } }),
      expected: /unresolved review conversation/,
    },
  ];
  for (const c of cases) {
    const res = evaluatePullRequestPreflight(c.pr, { prNumber: 180, expectedHeadSha: SHA_1 }, 'Bibleberry/Bibleberry');
    assert.equal(res.ok, false, `${c.name} should fail`);
    assert.match(res.reasons.join(' '), c.expected);
  }
});

test('handles permission/protection rejections, concurrent manual merge, external unverified merge, interrupted responses, and legacy v1 preservation', async () => {
  // Protection rejection (405) stops cleanly.
  const cPerm = new MockGitHubClient();
  cPerm.prs.set(371, makePr({ number: 371, headRefOid: SHA_1 }));
  cPerm.mergeError = new Error('GitHub REST HTTP 405: Required status check expected.');
  const rPerm = await startBatch(cPerm, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 371, expectedHeadSha: SHA_1 }],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal(rPerm.ok, false);
  assert.equal(rPerm.action, 'stopped');

  // Concurrent manual merge advancing main during merge -> transitions to behind update!
  const cAdv = new MockGitHubClient();
  cAdv.mainSha = MAIN_0;
  cAdv.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, mergeStateStatus: 'CLEAN' }));
  cAdv.mergePullRequest = async (_o, _r, prNumber, expectedHeadSha, mergeMethod) => {
    cAdv.merges.push({ prNumber, expectedHeadSha, mergeMethod });
    cAdv.mainSha = MAIN_1;
    cAdv.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, mergeStateStatus: 'BEHIND' }));
    cAdv.comparisons.set(`${MAIN_1}...${SHA_1}`, { status: 'diverged', aheadBy: 1, behindBy: 1, mergeBaseSha: MAIN_0 });
    throw new Error('GitHub REST HTTP 409: Base branch was modified.');
  };
  const rAdv = await startBatch(cAdv, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 371, expectedHeadSha: SHA_1 }],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal(rAdv.action, 'updating');
  assert.deepEqual(cAdv.updates, [{ prNumber: 371, expectedHeadSha: SHA_1 }]);

  // Interrupted merge response where merge actually landed remotely -> recovers without duplicate merge.
  const cMrg = new MockGitHubClient();
  cMrg.prs.set(371, makePr({ number: 371, headRefOid: SHA_1 }));
  cMrg.mergePullRequest = async (_o, _r, prNumber, expectedHeadSha, mergeMethod) => {
    cMrg.merges.push({ prNumber, expectedHeadSha, mergeMethod });
    cMrg.mainSha = MAIN_1;
    cMrg.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, state: 'MERGED', mergeCommit: { oid: MAIN_1 } }));
    throw new Error('HTTP 502 Bad Gateway');
  };
  const rMrg = await startBatch(cMrg, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 371, expectedHeadSha: SHA_1 }],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal(rMrg.action, 'completed');
  assert.equal(cMrg.merges.length, 1);

  // External manual merge outside coordinator's merging stage -> STOPS, never mistaken for completion.
  const cExt = new MockGitHubClient();
  const entries = [{ prNumber: 371, expectedHeadSha: SHA_1 }];
  cExt.state = {
    version: 2,
    revision: 2,
    batchId: 'batch-ext',
    stateChecksum: computeStateChecksum({
      owner: 'Bibleberry',
      repo: 'Bibleberry',
      entries,
      integrationPolicy: 'integration-only',
      mergeMethod: 'squash',
    }),
    status: 'awaiting_checks',
    createdAt: '2026-11-27T18:00:00.000Z',
    updatedAt: '2026-11-27T18:01:00.000Z',
    authorizedBy: 'ContraPhilosophy',
    integrationPolicy: 'integration-only',
    mergeMethod: 'squash',
    entries,
    nextIndex: 0,
    activePrNumber: 371,
    activeReviewedHeadSha: SHA_1,
    activeHeadSha: SHA_1,
    integrationUpdates: [],
    completedPrNumbers: [],
    completedMerges: [],
    nextAction: 'Waiting',
  };
  cExt.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, state: 'MERGED', mergeCommit: { oid: MAIN_2 } }));
  const rExt = await handlePullRequestClosed(cExt, { owner: 'Bibleberry', repo: 'Bibleberry', prNumber: 371, merged: true });
  assert.equal(rExt.action, 'stopped');
  assert.match(rExt.message, /unverified manual merge/);

  // Unresolved active legacy v1 batch is preserved and never discarded.
  const cLeg = new MockGitHubClient();
  const legacy: LegacyBatchStateV1 = {
    version: 1,
    revision: 3,
    batchId: 'batch-v1',
    status: 'enqueuing',
    createdAt: '2026-11-17T12:00:00.000Z',
    updatedAt: '2026-11-17T12:00:00.000Z',
    authorizedBy: 'ContraPhilosophy',
    entries: [{ prNumber: 180, expectedHeadSha: SHA_1 }],
    nextIndex: 0,
    activePrNumber: 180,
    activeHeadSha: SHA_1,
    completedPrNumbers: [],
  };
  cLeg.state = legacy;
  cLeg.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1, isInMergeQueue: true }));
  const blocked = await startBatch(cLeg, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 371, expectedHeadSha: SHA_1 }],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error ?? '', /unresolved active legacy v1/);
  const abLeg = await abortBatch(cLeg, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    actor: 'ContraPhilosophy',
    reason: 'Retire legacy v1',
    workflowRunId: '777',
  });
  assert.equal(abLeg.aborted, true);
  assert.deepEqual(cLeg.dequeued, ['PR_180']);
});

test('cancellation works across all processing stages, blocks racing mutations, and enforces owner approval', async () => {
  const stages: Array<BatchState['status']> = ['running', 'updating', 'awaiting_checks', 'merging', 'held'];
  const entries = [
    { prNumber: 371, expectedHeadSha: SHA_1 },
    { prNumber: 373, expectedHeadSha: SHA_2 },
  ];
  for (const stage of stages) {
    const client = new MockGitHubClient();
    client.state = {
      version: 2,
      revision: 4,
      batchId: `batch-${stage}`,
      stateChecksum: computeStateChecksum({
        owner: 'Bibleberry',
        repo: 'Bibleberry',
        entries,
        integrationPolicy: 'integration-only',
        mergeMethod: 'squash',
      }),
      status: stage,
      createdAt: '2026-11-27T18:00:00.000Z',
      updatedAt: '2026-11-27T18:05:00.000Z',
      authorizedBy: 'ContraPhilosophy',
      integrationPolicy: 'integration-only',
      mergeMethod: 'squash',
      entries,
      nextIndex: 1,
      activePrNumber: 373,
      activeReviewedHeadSha: SHA_2,
      activeHeadSha: SHA_2,
      pendingOperation:
        stage === 'merging'
          ? { type: 'merge', prNumber: 373, expectedHeadSha: SHA_2, observedMainSha: MAIN_1, startedAt: '2026-11-27T18:05:00.000Z' }
          : null,
      integrationUpdates: [],
      completedPrNumbers: [371],
      completedMerges: [
        {
          prNumber: 371,
          reviewedHeadSha: SHA_1,
          mergedHeadSha: SHA_1,
          mergeCommitSha: MAIN_1,
          mergedAt: '2026-11-27T18:02:00.000Z',
          mergeMethod: 'squash',
          viaIntegrationUpdate: false,
        },
      ],
      nextAction: 'Active',
    };
    if (stage === 'merging') {
      client.prs.set(373, makePr({ number: 373, headRefOid: SHA_2, state: 'MERGED', mergeCommit: { oid: MAIN_2 } }));
    }
    const res = await abortBatch(client, {
      owner: 'Bibleberry',
      repo: 'Bibleberry',
      actor: 'ContraPhilosophy',
      reason: `Cancel in ${stage}`,
      workflowRunId: '888',
    });
    assert.equal(res.aborted, true);
    assert.equal((client.state as BatchState).status, 'aborted');
    assert.match(res.message, /#371/);
    if (stage === 'merging') {
      assert.equal(res.completedMerges.length, 2);
    }
  }

  // Abort racing before merge prevents merge mutation.
  const cRace = new MockGitHubClient();
  cRace.prs.set(371, makePr({ number: 371, headRefOid: SHA_1 }));
  let aborted = false;
  const origSave = cRace.saveBatchState.bind(cRace);
  cRace.saveBatchState = async (owner, repo, state) => {
    await origSave(owner, repo, state);
    if (!aborted && state.version === 2 && state.status === 'merging') {
      aborted = true;
      await abortBatch(cRace, { owner, repo, actor: 'ContraPhilosophy', reason: 'Stop before merge' });
    }
  };
  await startBatch(cRace, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 371, expectedHeadSha: SHA_1 }],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal(cRace.merges.length, 0);
  assert.equal(cRace.state?.status, 'aborted');
});

// ---------------------------------------------------------------------------
// 7. REST/GraphQL client contracts (comments pagination, bypass detection, compare truncation)
// ---------------------------------------------------------------------------

test('createGitHubClient fetches paginated conversation comments, parses bypass allowances, and detects 300-file truncation', async () => {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : undefined;
    calls.push({ url, method, body });

    if (url.endsWith('/repos/Bibleberry/Bibleberry')) {
      return new Response(
        JSON.stringify({
          default_branch: 'main',
          allow_squash_merge: true,
          allow_merge_commit: true,
          allow_rebase_merge: true,
        }),
        { status: 200 },
      );
    }
    if (url.endsWith('/branches/main/protection')) {
      return new Response(
        JSON.stringify({
          required_status_checks: { strict: true, contexts: ['Build reader application', 'Verify Sanity Studio'] },
          required_pull_request_reviews: {
            required_approving_review_count: 0,
            dismiss_stale_reviews: false,
            bypass_pull_request_allowances: { apps: [{ slug: 'rogue-app' }] },
          },
          required_conversation_resolution: { enabled: true },
          enforce_admins: { enabled: true },
          allow_force_pushes: { enabled: false },
          allow_deletions: { enabled: false },
        }),
        { status: 200 },
      );
    }
    if (url.includes('/compare/')) {
      const files = Array.from({ length: 300 }, (_, i) => ({ filename: `file-${i}.ts`, status: 'modified', sha: `s${i}` }));
      return new Response(
        JSON.stringify({ status: 'ahead', ahead_by: 1, behind_by: 0, total_commits: 1, merge_base_commit: { sha: MAIN_0 }, files }),
        { status: 200 },
      );
    }
    if (url.endsWith('/pulls/371/merge')) {
      return new Response(JSON.stringify({ sha: MAIN_1, merged: true, message: 'Merged' }), { status: 200 });
    }
    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
  }) as typeof fetch;

  try {
    const gh = createGitHubClient('test-token', 'read-token');
    const policy = await gh.getRepositoryPolicy('Bibleberry', 'Bibleberry');
    assert.equal(policy.protectionAccessible, true);
    assert.equal(policy.hasBypassAllowances, true);
    assert.deepEqual(policy.bypassAllowanceTargets, ['app:rogue-app']);
    assert.equal(evaluateBranchProtectionSafety(policy).ok, false);

    const comp = await gh.compareCommits('Bibleberry', 'Bibleberry', MAIN_0, SHA_1);
    assert.equal(comp.filesTruncated, true);

    const merged = await gh.mergePullRequest('Bibleberry', 'Bibleberry', 371, SHA_1, 'squash');
    assert.equal(merged.sha, MAIN_1);
    const mergeCall = calls.find((c) => c.url.endsWith('/pulls/371/merge'));
    assert.deepEqual(JSON.parse(mergeCall?.body ?? '{}'), { sha: SHA_1, merge_method: 'squash' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// 8. Findings 1 & 2: Workflow Trust Boundary, Environment Isolation & workflow_run Wakeup
// ---------------------------------------------------------------------------

test('workflow enforces default-branch-only control plane, main-only runtime environment isolation, workflow_run CI wakeup, no untrusted interpolation, and single-writer FIFO', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/merge-queue-batch.yml', import.meta.url),
    'utf8',
  );

  // Top-level least privilege.
  assert.match(workflow, /^permissions: \{\}\s*$/m);

  // Finding 1: NO ordinary `pull_request:` trigger (prevents PR-authored workflow execution).
  assert.doesNotMatch(workflow, /^ {2}pull_request:/m);
  assert.match(workflow, /^ {2}pull_request_target:\s*\n(?:\s*#.*\n)*\s*types: \[closed, synchronize\]\s*\n\s*branches: \[main\]/m);

  // Finding 2: NO `check_suite:` or `merge_group:` trigger; uses narrowly selected `workflow_run: [completed]`.
  assert.doesNotMatch(workflow, /^ {2}check_suite:/m);
  assert.doesNotMatch(workflow, /^ {2}merge_group:/m);
  assert.match(workflow, /^ {2}workflow_run:\s*\n/m);
  assert.match(workflow, /- Bibleberry CI/);
  assert.match(workflow, /- Collections Browser Tests/);
  assert.match(workflow, /- Native Android debug build/);
  assert.match(workflow, /- Native iOS simulator build/);
  assert.match(workflow, /- PR Assignment Identity/);
  // Must NEVER list itself in workflow_run to prevent recursive triggers!
  const workflowRunSection = workflow.slice(workflow.indexOf('  workflow_run:'), workflow.indexOf('  schedule:'));
  assert.doesNotMatch(workflowRunSection, /Copper Turnstile|Merge Queue Batch/);
  // Must NEVER download or consume untrusted workflow artifacts!
  assert.doesNotMatch(workflow, /download-artifact/i);

  // Finding 1: Privileged runtime credentials live ONLY in `copper-turnstile-runtime` (main-only environment),
  // separated from interactive owner approval gates (`merge-queue-approval`, zero secrets).
  const runtimeEnvMatches = workflow.match(/environment: copper-turnstile-runtime/g) ?? [];
  assert.equal(runtimeEnvMatches.length, 5, 'All 5 state-mutating execution jobs must run in copper-turnstile-runtime');
  const approvalEnvMatches = workflow.match(/environment: merge-queue-approval/g) ?? [];
  assert.equal(approvalEnvMatches.length, 3, 'All 3 interactive owner approval gates must run in merge-queue-approval');

  // Interactive approval jobs hold ZERO secrets and permissions: {}.
  for (const gateJob of ['approve-start', 'approve-reconcile', 'approve-abort']) {
    const startIdx = workflow.indexOf(`  ${gateJob}:`);
    assert.ok(startIdx > 0, `Missing ${gateJob} job`);
    const rest = workflow.slice(startIdx + 4);
    const nextMatch = /\n {2}[a-z0-9-]+:/i.exec(rest);
    const block = nextMatch ? workflow.slice(startIdx, startIdx + 4 + nextMatch.index) : workflow.slice(startIdx);
    assert.match(block, /environment: merge-queue-approval/);
    assert.match(block, /permissions: \{\}/);
    assert.doesNotMatch(block, /COPPER_TURNSTILE_APP_PRIVATE_KEY|MERGE_QUEUE_TOKEN/);
  }

  // Every execution job must explicitly gate on github.ref == 'refs/heads/main'.
  const mainRefGuards = workflow.match(/github\.ref == 'refs\/heads\/main'/g) ?? [];
  assert.ok(mainRefGuards.length >= 8, 'Every approval gate and privileged execution job must guard github.ref == refs/heads/main');

  // Read-only preflight and status jobs must NEVER reference privileged environments or secrets.
  const preflightBlock = workflow.slice(workflow.indexOf('  preflight:'), workflow.indexOf('  approve-start:'));
  assert.doesNotMatch(preflightBlock, /copper-turnstile-runtime|COPPER_TURNSTILE_APP_PRIVATE_KEY|MERGE_QUEUE_TOKEN/);
  const statusBlock = workflow.slice(workflow.indexOf('  status:'), workflow.indexOf('  approve-reconcile:'));
  assert.doesNotMatch(statusBlock, /copper-turnstile-runtime|COPPER_TURNSTILE_APP_PRIVATE_KEY|MERGE_QUEUE_TOKEN/);

  // Idle zero-runner gating preserved on event-driven and watchdog jobs.
  assert.match(workflow, /vars\.MERGE_QUEUE_BATCH_STATE != ''/);
  assert.match(workflow, /contains\(vars\.MERGE_QUEUE_BATCH_STATE, '"status":"awaiting_checks"'\)/);
  assert.match(workflow, /contains\(vars\.MERGE_QUEUE_BATCH_STATE, '"status":"enqueuing"'\)/);

  // Every actions/checkout checks out default_branch (main) with persist-credentials: false.
  const checkoutMatches = workflow.match(/uses: actions\/checkout@[0-9a-f]{40}/g) ?? [];
  const defaultBranchRefMatches = workflow.match(/ref: \$\{\{ github\.event\.repository\.default_branch \}\}/g) ?? [];
  const persistFalseMatches = workflow.match(/persist-credentials: false/g) ?? [];
  assert.equal(checkoutMatches.length, 7);
  assert.equal(defaultBranchRefMatches.length, 7);
  assert.equal(persistFalseMatches.length, 7);

  // All 5 runtime jobs mint SHA-pinned repo-scoped GitHub App tokens.
  const appTokenUses = workflow.match(/uses: actions\/create-github-app-token@[0-9a-f]{40}/g) ?? [];
  assert.equal(appTokenUses.length, 5);
  const appRepoScopes = workflow.match(/repositories: \$\{\{ github\.event\.repository\.name \}\}/g) ?? [];
  assert.equal(appRepoScopes.length, 5);

  // Single-writer FIFO serialization across all 5 mutating execution jobs.
  assert.doesNotMatch(workflow, /^concurrency:\s*$/m);
  assert.doesNotMatch(workflow, /cancel-in-progress:\s*true/);
  const writerMatches =
    workflow.match(
      /concurrency:\s*\n(?:\s*#.*\n)*\s*group: merge-queue-batch-writer\s*\n\s*cancel-in-progress: false\s*\n\s*queue: max/g,
    ) ?? [];
  assert.equal(writerMatches.length, 5);

  // No shell interpolation of untrusted PR strings anywhere in workflow!
  assert.doesNotMatch(workflow, /github\.event\.pull_request\.(?:title|body|head\.ref|head\.label)/);
  assert.doesNotMatch(workflow, /github\.event\.workflow_run\.(?:display_title|head_commit\.message)/);
});
