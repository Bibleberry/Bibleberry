import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGitHubClient } from '../../scripts/ci/merge-queue-batch.ts';
import {
  abortBatch,
  computeAuthorizationDigest,
  evaluateCheckVerification,
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
  type PullRequestSnapshot,
  type RepositoryPolicy,
  type StoredBatchState,
} from '../../scripts/ci/merge-queue-batch-lib.ts';

const MAIN_0 = '0000000000000000000000000000000000000000';
const MAIN_1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MAIN_2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SHA_1 = '1111111111111111111111111111111111111111';
const SHA_2 = '2222222222222222222222222222222222222222';
const SHA_2_UPDATED = '222222222222222222222222222222222222222a';
const SHA_3 = '3333333333333333333333333333333333333333';
const SHA_UNAUTH = '9999999999999999999999999999999999999999';

function makePr(overrides: Partial<PullRequestSnapshot> = {}): PullRequestSnapshot {
  const headRefOid = overrides.headRefOid ?? SHA_1;
  return {
    id: 'PR_kwDO1',
    number: 180,
    url: 'https://github.com/Bibleberry/Bibleberry/pull/180',
    title: '[Copper Turnstile] Test PR',
    state: 'OPEN',
    isDraft: false,
    author: { login: 'ContraPhilosophy' },
    baseRefName: 'main',
    baseRepository: { nameWithOwner: 'Bibleberry/Bibleberry' },
    headRefName: 'feat/test-pr',
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

  async verifyWorkflowApproval(): Promise<ApprovalVerificationResult> {
    return this.approvalResult;
  }
}

/**
 * Wires clean disjoint-file provenance fixtures for merging `baseSha` into `prevHeadSha` -> `newHeadSha`.
 */
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
    files: prFiles,
  });
  client.comparisons.set(`${mergeBaseSha.toLowerCase()}...${prevHeadSha.toLowerCase()}`, {
    status: 'ahead',
    aheadBy: 1,
    behindBy: 0,
    mergeBaseSha: mergeBaseSha.toLowerCase(),
    files: prFiles,
  });
  client.comparisons.set(`${mergeBaseSha.toLowerCase()}...${baseSha.toLowerCase()}`, {
    status: 'ahead',
    aheadBy: 1,
    behindBy: 0,
    mergeBaseSha: mergeBaseSha.toLowerCase(),
    files: mainFiles,
  });
  client.comparisons.set(`${prevHeadSha.toLowerCase()}...${newHeadSha.toLowerCase()}`, {
    status: 'ahead',
    aheadBy: 2,
    behindBy: 0,
    mergeBaseSha: prevHeadSha.toLowerCase(),
    files: mainFiles,
  });
  client.comparisons.set(`${baseSha.toLowerCase()}...${newHeadSha.toLowerCase()}`, {
    status: 'ahead',
    aheadBy: 2,
    behindBy: 0,
    mergeBaseSha: baseSha.toLowerCase(),
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

test('dry-run operation validates entries and performs zero writes, zero updates, and zero merges', async () => {
  const client = new MockGitHubClient();
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
// 2. Current verified candidate merged without branch update
// ---------------------------------------------------------------------------

test('current verified candidate merges directly via protected API without branch update or extra CI', async () => {
  const client = new MockGitHubClient();
  client.mainSha = MAIN_0;
  client.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, mergeStateStatus: 'CLEAN' }));
  client.onMerge = () => MAIN_1;

  const outcome = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 371, expectedHeadSha: SHA_1 }],
    authorizedBy: 'ContraPhilosophy',
    workflowRunId: '5001',
    now: () => '2026-11-27T18:00:00.000Z',
  });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.action, 'completed');
  assert.equal(client.updates.length, 0, 'Must not call update-branch when PR is already current');
  assert.deepEqual(client.merges, [
    { prNumber: 371, expectedHeadSha: SHA_1, mergeMethod: 'squash' },
  ]);
  assert.equal(client.state?.version, 2);
  const st = client.state as BatchState;
  assert.equal(st.status, 'completed');
  assert.equal(st.completedMerges.length, 1);
  assert.equal(st.completedMerges[0].mergeCommitSha, MAIN_1);
  assert.equal(st.completedMerges[0].viaIntegrationUpdate, false);
  assert.equal(st.approvedBy, 'ContraPhilosophy');
});

// ---------------------------------------------------------------------------
// 3. Behind candidate updated, ordinary CI awaited, and default §2C HOLD enforced
// ---------------------------------------------------------------------------

test('behind candidate updates branch, awaits ordinary PR CI, verifies provenance, and defaults to HOLD per §2C', async () => {
  const client = new MockGitHubClient();
  let clockMs = Date.parse('2026-11-27T18:00:00.000Z');
  const now = () => new Date(clockMs).toISOString();

  client.mainSha = MAIN_0;
  client.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, mergeStateStatus: 'CLEAN' }));
  client.prs.set(373, makePr({ number: 373, headRefOid: SHA_2, mergeStateStatus: 'CLEAN' }));
  client.onMerge = (prNum) => {
    if (prNum === 371) {
      // After PR #371 merges, PR #373 becomes BEHIND MAIN_1.
      client.prs.set(373, makePr({ number: 373, headRefOid: SHA_2, mergeStateStatus: 'BEHIND' }));
      client.comparisons.set(`${MAIN_1}...${SHA_2}`, {
        status: 'diverged',
        aheadBy: 1,
        behindBy: 1,
        mergeBaseSha: MAIN_0,
      });
      return MAIN_1;
    }
    return MAIN_2;
  };

  // Async update-branch: commit lands when synchronize event arrives.
  const started = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [
      { prNumber: 371, expectedHeadSha: SHA_1 },
      { prNumber: 373, expectedHeadSha: SHA_2 },
    ],
    authorizedBy: 'ContraPhilosophy',
    now,
  });

  assert.equal(started.ok, true);
  assert.equal(started.action, 'updating');
  assert.equal(client.merges.length, 1);
  assert.equal(client.merges[0].prNumber, 371);
  assert.deepEqual(client.updates, [{ prNumber: 373, expectedHeadSha: SHA_2 }]);
  assert.equal((client.state as BatchState).status, 'updating');

  // GitHub completes update-branch, creating clean 2-parent merge commit SHA_2_UPDATED with pending CI.
  setupCleanIntegrationProvenance(client, {
    mergeBaseSha: MAIN_0,
    prevHeadSha: SHA_2,
    baseSha: MAIN_1,
    newHeadSha: SHA_2_UPDATED,
  });
  client.prs.set(
    373,
    makePr({
      number: 373,
      headRefOid: SHA_2_UPDATED,
      mergeStateStatus: 'BLOCKED',
      statusCheckRollup: {
        state: 'PENDING',
        contexts: {
          pageInfo: { hasNextPage: false },
          nodes: [
            {
              __typename: 'CheckRun',
              name: 'Build reader application',
              status: 'IN_PROGRESS',
              conclusion: null,
              headSha: SHA_2_UPDATED,
            },
          ],
        },
      },
    }),
  );

  clockMs += 30_000;
  const synced = await handlePullRequestSynchronize(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 373,
    now,
  });
  assert.equal(synced.action, 'awaiting_checks');
  const waitingState = client.state as BatchState;
  assert.equal(waitingState.status, 'awaiting_checks');
  assert.equal(waitingState.activeHeadSha, SHA_2_UPDATED);
  assert.equal(waitingState.integrationUpdates.length, 1);
  assert.equal(waitingState.integrationUpdates[0].provenanceVerified, true);

  // Ordinary PR CI finishes and passes on SHA_2_UPDATED.
  client.prs.set(373, makePr({ number: 373, headRefOid: SHA_2_UPDATED, mergeStateStatus: 'CLEAN' }));
  clockMs += 120_000;
  const checked = await handleChecksCompleted(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    headSha: SHA_2_UPDATED,
    now,
  });

  // Under default §2C exact-HEAD policy, must HOLD instead of merging the new HEAD SHA!
  assert.equal(checked.action, 'held');
  const heldState = client.state as BatchState;
  assert.equal(heldState.status, 'held');
  assert.match(heldState.holdReason ?? '', /default §2C exact-HEAD policy holds/i);
  assert.equal(client.merges.length, 1, 'PR #373 must NOT auto-merge under default §2C policy');
});

test('integration-only policy is fail-closed unless explicitly activated, and holds on overlapping files even when enabled', async () => {
  const client = new MockGitHubClient();
  client.prs.set(373, makePr({ number: 373, headRefOid: SHA_2, mergeStateStatus: 'BEHIND' }));

  // Attempting integration-only without explicit governance enablement flag MUST fail closed.
  const denied = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 373, expectedHeadSha: SHA_2 }],
    authorizedBy: 'ContraPhilosophy',
    integrationPolicy: 'integration-only',
  });
  assert.equal(denied.ok, false);
  assert.match(denied.error ?? '', /disabled by default under AI Development Protocol §2C/);
  assert.equal(client.saveCount, 0);

  // Even when explicitly enabled in controlled test, overlapping files between main and PR MUST HOLD.
  client.mainSha = MAIN_1;
  client.comparisons.set(`${MAIN_1}...${SHA_2}`, {
    status: 'diverged',
    aheadBy: 1,
    behindBy: 1,
    mergeBaseSha: MAIN_0,
  });
  setupCleanIntegrationProvenance(client, {
    mergeBaseSha: MAIN_0,
    prevHeadSha: SHA_2,
    baseSha: MAIN_1,
    newHeadSha: SHA_2_UPDATED,
    prFiles: [{ filename: 'src/shared.ts', status: 'modified', sha: 'blob-pr-shared' }],
    mainFiles: [{ filename: 'src/shared.ts', status: 'modified', sha: 'blob-main-shared' }],
  });
  client.onUpdateBranch = () => {
    client.prs.set(373, makePr({ number: 373, headRefOid: SHA_2_UPDATED, mergeStateStatus: 'CLEAN' }));
  };

  const overlapOutcome = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 373, expectedHeadSha: SHA_2 }],
    authorizedBy: 'ContraPhilosophy',
    integrationPolicy: 'integration-only',
    allowIntegrationOnlyPolicy: true,
  });
  assert.equal(overlapOutcome.action, 'held');
  assert.match(overlapOutcome.message ?? '', /overlapping file/i);
  assert.equal(client.merges.length, 0);

  // When disjoint files AND explicitly enabled AND CI passes -> protected merge succeeds!
  const disjointClient = new MockGitHubClient();
  disjointClient.mainSha = MAIN_1;
  disjointClient.prs.set(373, makePr({ number: 373, headRefOid: SHA_2, mergeStateStatus: 'BEHIND' }));
  disjointClient.comparisons.set(`${MAIN_1}...${SHA_2}`, {
    status: 'diverged',
    aheadBy: 1,
    behindBy: 1,
    mergeBaseSha: MAIN_0,
  });
  setupCleanIntegrationProvenance(disjointClient, {
    mergeBaseSha: MAIN_0,
    prevHeadSha: SHA_2,
    baseSha: MAIN_1,
    newHeadSha: SHA_2_UPDATED,
  });
  disjointClient.onUpdateBranch = () => {
    disjointClient.prs.set(373, makePr({ number: 373, headRefOid: SHA_2_UPDATED, mergeStateStatus: 'CLEAN' }));
  };
  disjointClient.onMerge = () => MAIN_2;

  const disjointOutcome = await startBatch(disjointClient, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 373, expectedHeadSha: SHA_2 }],
    authorizedBy: 'ContraPhilosophy',
    integrationPolicy: 'integration-only',
    allowIntegrationOnlyPolicy: true,
  });
  assert.equal(disjointOutcome.ok, true);
  assert.equal(disjointOutcome.action, 'completed');
  assert.deepEqual(disjointClient.merges, [
    { prNumber: 373, expectedHeadSha: SHA_2_UPDATED, mergeMethod: 'squash' },
  ]);
  assert.equal((disjointClient.state as BatchState).completedMerges[0].viaIntegrationUpdate, true);
});

// ---------------------------------------------------------------------------
// 4. Authorized vs unauthorized HEAD changes & provenance verification
// ---------------------------------------------------------------------------

test('verifyIntegrationUpdateProvenance rejects rewritten history, non-merge commits, unknown base, and unauthorized source edits', async () => {
  // Case A: Non-merge commit (1 parent, e.g. force-push/rebase or manual commit).
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

  // Case B: Rewritten history (first parent !== previousHeadSha).
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

  // Case C: Second parent is NOT an accepted commit on main.
  const c3 = new MockGitHubClient();
  c3.commits.set(SHA_UNAUTH, { sha: SHA_UNAUTH, parents: [SHA_2, SHA_3], message: 'merge rogue branch' });
  c3.comparisons.set(`${SHA_3}...${MAIN_1}`, {
    status: 'diverged',
    aheadBy: 2,
    behindBy: 1,
    mergeBaseSha: MAIN_0,
  });
  const r3 = await verifyIntegrationUpdateProvenance(c3, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 373,
    previousHeadSha: SHA_2,
    newHeadSha: SHA_UNAUTH,
    expectedBaseSha: MAIN_1,
    currentMainSha: MAIN_1,
    requestedAt: '2026-11-27T18:00:00.000Z',
  });
  assert.equal(r3.ok, false);
  assert.match(r3.reason ?? '', /not an accepted commit on main/);

  // Case D: Merge commit sneaks in an unauthorized edit to a file main did not change.
  const c4 = new MockGitHubClient();
  setupCleanIntegrationProvenance(c4, {
    mergeBaseSha: MAIN_0,
    prevHeadSha: SHA_2,
    baseSha: MAIN_1,
    newHeadSha: SHA_2_UPDATED,
  });
  c4.comparisons.set(`${SHA_2}...${SHA_2_UPDATED}`, {
    status: 'ahead',
    aheadBy: 2,
    behindBy: 0,
    mergeBaseSha: SHA_2,
    files: [
      { filename: 'src/main-change.ts', status: 'modified', sha: 'blob-main-1' },
      { filename: 'src/backdoor.ts', status: 'added', sha: 'blob-evil' },
    ],
  });
  const r4 = await verifyIntegrationUpdateProvenance(c4, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 373,
    previousHeadSha: SHA_2,
    newHeadSha: SHA_2_UPDATED,
    expectedBaseSha: MAIN_1,
    currentMainSha: MAIN_1,
    requestedAt: '2026-11-27T18:00:00.000Z',
  });
  assert.equal(r4.ok, false);
  assert.match(r4.reason ?? '', /modified "src\/backdoor\.ts", which was not changed on main/);

  // Case E: Blob SHA tampering on reviewed PR file inside merge commit.
  const c5 = new MockGitHubClient();
  setupCleanIntegrationProvenance(c5, {
    mergeBaseSha: MAIN_0,
    prevHeadSha: SHA_2,
    baseSha: MAIN_1,
    newHeadSha: SHA_2_UPDATED,
  });
  c5.comparisons.set(`${MAIN_1}...${SHA_2_UPDATED}`, {
    status: 'ahead',
    aheadBy: 2,
    behindBy: 0,
    mergeBaseSha: MAIN_1,
    files: [{ filename: 'src/pr-feature.ts', status: 'modified', sha: 'blob-tampered' }],
  });
  const r5 = await verifyIntegrationUpdateProvenance(c5, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 373,
    previousHeadSha: SHA_2,
    newHeadSha: SHA_2_UPDATED,
    expectedBaseSha: MAIN_1,
    currentMainSha: MAIN_1,
    requestedAt: '2026-11-27T18:00:00.000Z',
  });
  assert.equal(r5.ok, false);
  assert.match(r5.reason ?? '', /altered reviewed PR file/);
});

test('unauthorized HEAD push during awaiting_checks stops batch immediately', async () => {
  const client = new MockGitHubClient();
  client.mainSha = MAIN_1;
  const entries = [{ prNumber: 373, expectedHeadSha: SHA_2 }];
  client.state = {
    version: 2,
    revision: 2,
    batchId: 'batch-unauth-head',
    authorizationDigest: computeAuthorizationDigest({
      owner: 'Bibleberry',
      repo: 'Bibleberry',
      entries,
      integrationPolicy: 'hold-on-update',
      mergeMethod: 'squash',
    }),
    status: 'awaiting_checks',
    createdAt: '2026-11-27T18:00:00.000Z',
    updatedAt: '2026-11-27T18:01:00.000Z',
    authorizedBy: 'ContraPhilosophy',
    integrationPolicy: 'hold-on-update',
    mergeMethod: 'squash',
    entries,
    nextIndex: 0,
    activePrNumber: 373,
    activeReviewedHeadSha: SHA_2,
    activeHeadSha: SHA_2_UPDATED,
    observedMainSha: MAIN_1,
    awaitingChecksSince: '2026-11-27T18:01:00.000Z',
    integrationUpdates: [],
    completedPrNumbers: [],
    completedMerges: [],
    nextAction: 'Awaiting checks',
  };
  // Another actor pushed SHA_UNAUTH to PR #373.
  client.prs.set(373, makePr({ number: 373, headRefOid: SHA_UNAUTH }));

  const res = await handlePullRequestSynchronize(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 373,
  });
  assert.equal(res.action, 'stopped');
  assert.match(res.message, /Unauthorized HEAD change/);
  assert.equal(client.merges.length, 0);
});

// ---------------------------------------------------------------------------
// 5. Invalid/stale review, wrong repo/base, Draft, closed, conflicts
// ---------------------------------------------------------------------------

test('preflight rejects invalid/stale review, self-approval, wrong repo/base, Draft, closed, conflicts, and unresolved threads', () => {
  const policyWithReview = makePolicy({ requiredApprovingReviewCount: 1, dismissStaleReviews: true });
  const cases: Array<{
    name: string;
    pr: PullRequestSnapshot | null;
    policy?: RepositoryPolicy;
    expectedReason: RegExp;
  }> = [
    { name: 'missing PR', pr: null, expectedReason: /not found/ },
    { name: 'stale head SHA', pr: makePr({ headRefOid: SHA_2 }), expectedReason: /does not match authorized SHA/ },
    { name: 'Draft PR', pr: makePr({ isDraft: true }), expectedReason: /Draft PR/ },
    { name: 'closed PR', pr: makePr({ state: 'CLOSED' }), expectedReason: /expected OPEN/ },
    { name: 'wrong base branch', pr: makePr({ baseRefName: 'develop' }), expectedReason: /base branch/ },
    {
      name: 'wrong base repository',
      pr: makePr({ baseRepository: { nameWithOwner: 'Other/Bibleberry' } }),
      expectedReason: /targets repository/,
    },
    { name: 'merge conflicts', pr: makePr({ mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }), expectedReason: /merge conflicts/ },
    { name: 'unknown mergeability', pr: makePr({ mergeable: 'UNKNOWN' }), expectedReason: /mergeability is UNKNOWN/ },
    { name: 'REVIEW_REQUIRED', pr: makePr({ reviewDecision: 'REVIEW_REQUIRED' }), expectedReason: /REVIEW_REQUIRED/ },
    { name: 'CHANGES_REQUESTED', pr: makePr({ reviewDecision: 'CHANGES_REQUESTED' }), expectedReason: /CHANGES_REQUESTED/ },
    {
      name: 'active CHANGES_REQUESTED in latestReviews',
      pr: makePr({
        latestReviews: {
          nodes: [{ state: 'CHANGES_REQUESTED', author: { login: 'reviewer1' }, commit: { oid: SHA_1 } }],
        },
      }),
      expectedReason: /active CHANGES_REQUESTED review/,
    },
    {
      name: 'stale approving review bound to older commit',
      pr: makePr({
        latestReviews: {
          nodes: [{ state: 'APPROVED', author: { login: 'reviewer1' }, commit: { oid: SHA_3 } }],
        },
      }),
      expectedReason: /approving review is stale/,
    },
    {
      name: 'invalid self-approval by PR author',
      pr: makePr({
        author: { login: 'dev-user' },
        latestReviews: {
          nodes: [{ state: 'APPROVED', author: { login: 'dev-user' }, commit: { oid: SHA_1 } }],
        },
      }),
      expectedReason: /self-approval/,
    },
    {
      name: 'missing required approving review count when enforced by branch protection',
      pr: makePr({ latestReviews: { nodes: [] } }),
      policy: policyWithReview,
      expectedReason: /0\/1 required independent approving review/,
    },
    {
      name: 'unresolved review thread',
      pr: makePr({ reviewThreads: { totalCount: 1, pageInfo: { hasNextPage: false }, nodes: [{ isResolved: false }] } }),
      expectedReason: /unresolved review conversation/,
    },
    {
      name: 'truncated review threads',
      pr: makePr({ reviewThreads: { totalCount: 120, pageInfo: { hasNextPage: true }, nodes: [] } }),
      expectedReason: /cannot verify all are resolved/,
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
    assert.equal(res.ok, false, `${c.name} should fail preflight`);
    assert.match(res.reasons.join(' '), c.expectedReason, `${c.name} reason mismatch`);
  }
});

// ---------------------------------------------------------------------------
// 6. Failed, missing, skipped, stale, canceled, and pending/timeout checks
// ---------------------------------------------------------------------------

test('evaluateCheckVerification accurately classifies failed, missing, skipped-only, stale, canceled, pending, and valid checks', () => {
  // Prior SKIPPED + newer SUCCESS passes.
  const skippedThenPass = evaluateCheckVerification({
    pr: makePr({
      statusCheckRollup: {
        state: 'SUCCESS',
        contexts: {
          pageInfo: { hasNextPage: false },
          nodes: [
            { __typename: 'CheckRun', name: 'Build reader application', status: 'COMPLETED', conclusion: 'SKIPPED', headSha: SHA_1 },
            { __typename: 'CheckRun', name: 'Build reader application', status: 'COMPLETED', conclusion: 'SUCCESS', headSha: SHA_1 },
            { __typename: 'CheckRun', name: 'Verify Sanity Studio', status: 'COMPLETED', conclusion: 'SUCCESS', headSha: SHA_1 },
          ],
        },
      },
    }),
    candidateHeadSha: SHA_1,
    requiredChecks: ['Build reader application', 'Verify Sanity Studio'],
    protectionAccessible: true,
  });
  assert.equal(skippedThenPass.verdict, 'passed');

  // SKIPPED-only required check fails.
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

  // Missing required check (including dynamically discovered check from branch protection).
  const missing = evaluateCheckVerification({
    pr: makePr(),
    candidateHeadSha: SHA_1,
    requiredChecks: ['Build reader application', 'Verify Sanity Studio', 'Reader browser suites (Chromium)'],
    protectionAccessible: true,
  });
  assert.equal(missing.verdict, 'failed');
  assert.deepEqual(missing.missingChecks, ['Reader browser suites (Chromium)']);

  // Canceled check fails.
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

  // Stale check (conclusion STALE or mismatched headSha) fails.
  const staleConclusion = evaluateCheckVerification({
    pr: makePr({
      statusCheckRollup: {
        state: 'SUCCESS',
        contexts: {
          pageInfo: { hasNextPage: false },
          nodes: [
            { __typename: 'CheckRun', name: 'Build reader application', status: 'COMPLETED', conclusion: 'STALE', headSha: SHA_1 },
            { __typename: 'CheckRun', name: 'Verify Sanity Studio', status: 'COMPLETED', conclusion: 'SUCCESS', headSha: SHA_1 },
          ],
        },
      },
    }),
    candidateHeadSha: SHA_1,
    requiredChecks: ['Build reader application', 'Verify Sanity Studio'],
    protectionAccessible: true,
  });
  assert.equal(staleConclusion.verdict, 'failed');
  assert.deepEqual(staleConclusion.staleChecks, ['Build reader application']);

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

  // Pending check returns pending verdict.
  const pending = evaluateCheckVerification({
    pr: makePr({
      statusCheckRollup: {
        state: 'PENDING',
        contexts: {
          pageInfo: { hasNextPage: false },
          nodes: [
            { __typename: 'CheckRun', name: 'Build reader application', status: 'IN_PROGRESS', conclusion: null, headSha: SHA_1 },
            { __typename: 'CheckRun', name: 'Verify Sanity Studio', status: 'COMPLETED', conclusion: 'SUCCESS', headSha: SHA_1 },
          ],
        },
      },
    }),
    candidateHeadSha: SHA_1,
    requiredChecks: ['Build reader application', 'Verify Sanity Studio'],
    protectionAccessible: true,
  });
  assert.equal(pending.verdict, 'pending');
  assert.deepEqual(pending.pendingChecks, ['Build reader application']);
});

test('awaiting_checks times out cleanly when CI exceeds checkTimeoutMs', async () => {
  const client = new MockGitHubClient();
  client.mainSha = MAIN_1;
  const entries = [{ prNumber: 373, expectedHeadSha: SHA_2 }];
  client.state = {
    version: 2,
    revision: 2,
    batchId: 'batch-timeout',
    authorizationDigest: computeAuthorizationDigest({
      owner: 'Bibleberry',
      repo: 'Bibleberry',
      entries,
      integrationPolicy: 'hold-on-update',
      mergeMethod: 'squash',
    }),
    status: 'awaiting_checks',
    createdAt: '2026-11-27T18:00:00.000Z',
    updatedAt: '2026-11-27T18:01:00.000Z',
    authorizedBy: 'ContraPhilosophy',
    integrationPolicy: 'hold-on-update',
    mergeMethod: 'squash',
    entries,
    nextIndex: 0,
    activePrNumber: 373,
    activeReviewedHeadSha: SHA_2,
    activeHeadSha: SHA_2_UPDATED,
    observedMainSha: MAIN_1,
    awaitingChecksSince: '2026-11-27T18:01:00.000Z',
    integrationUpdates: [],
    completedPrNumbers: [],
    completedMerges: [],
    nextAction: 'Waiting',
  };
  client.prs.set(
    373,
    makePr({
      number: 373,
      headRefOid: SHA_2_UPDATED,
      statusCheckRollup: {
        state: 'PENDING',
        contexts: {
          pageInfo: { hasNextPage: false },
          nodes: [{ __typename: 'CheckRun', name: 'Build reader application', status: 'IN_PROGRESS', conclusion: null, headSha: SHA_2_UPDATED }],
        },
      },
    }),
  );

  const res = await reconcileBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    checkTimeoutMs: 60_000,
    now: () => '2026-11-27T18:10:00.000Z',
  });
  assert.equal(res.action, 'stopped');
  assert.match(res.message, /Timed out waiting for ordinary PR CI/);
  assert.equal((client.state as BatchState).lastVerification?.verdict, 'timed_out');
});

// ---------------------------------------------------------------------------
// 7. Permission failure, protection rejection, and merge-method restriction
// ---------------------------------------------------------------------------

test('stops cleanly on permission failure (403), protection rejection (405), update conflict (422), and disallowed merge method', async () => {
  // Disallowed merge method rejected before any writes.
  const cMethod = new MockGitHubClient();
  cMethod.policy = makePolicy({ allowRebaseMerge: false });
  cMethod.prs.set(371, makePr({ number: 371, headRefOid: SHA_1 }));
  const rMethod = await startBatch(cMethod, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 371, expectedHeadSha: SHA_1 }],
    authorizedBy: 'ContraPhilosophy',
    mergeMethod: 'rebase',
  });
  assert.equal(rMethod.ok, false);
  assert.match(rMethod.error ?? '', /allow_rebase_merge=false/);
  assert.equal(cMethod.saveCount, 0);

  // Branch protection / permission rejection on merge (405 / 403).
  const cPerm = new MockGitHubClient();
  cPerm.prs.set(371, makePr({ number: 371, headRefOid: SHA_1 }));
  cPerm.mergeError = new Error('GitHub REST HTTP 405 (PUT /repos/Bibleberry/Bibleberry/pulls/371/merge): Required status check "Build reader application" is expected.');
  const rPerm = await startBatch(cPerm, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 371, expectedHeadSha: SHA_1 }],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal(rPerm.ok, false);
  assert.equal(rPerm.action, 'stopped');
  assert.match(rPerm.error ?? '', /Protected merge rejected.*HTTP 405/);
  assert.equal((cPerm.state as BatchState).status, 'stopped');

  // Update-branch merge conflict (422).
  const cConflict = new MockGitHubClient();
  cConflict.mainSha = MAIN_1;
  cConflict.prs.set(373, makePr({ number: 373, headRefOid: SHA_2, mergeStateStatus: 'BEHIND' }));
  cConflict.comparisons.set(`${MAIN_1}...${SHA_2}`, {
    status: 'diverged',
    aheadBy: 1,
    behindBy: 1,
    mergeBaseSha: MAIN_0,
  });
  cConflict.updateError = new Error('GitHub REST HTTP 422: merge conflict between base and head');
  const rConflict = await startBatch(cConflict, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 373, expectedHeadSha: SHA_2 }],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal(rConflict.ok, false);
  assert.equal(rConflict.action, 'stopped');
  assert.match(rConflict.error ?? '', /Failed to update branch.*merge conflict/);
});

// ---------------------------------------------------------------------------
// 8. Concurrent manual merge, base advancement, and manual closure
// ---------------------------------------------------------------------------

test('handles concurrent manual merge advancing main during merge attempt and stops on external unverified merge or manual closure', async () => {
  // Case A: Concurrent manual merge of unrelated PR advances main right as mergePullRequest is called.
  const cAdv = new MockGitHubClient();
  cAdv.mainSha = MAIN_0;
  cAdv.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, mergeStateStatus: 'CLEAN' }));
  let mergeAttempt = 0;
  cAdv.mergePullRequest = async (_o, _r, prNumber, expectedHeadSha, mergeMethod) => {
    mergeAttempt += 1;
    cAdv.merges.push({ prNumber, expectedHeadSha, mergeMethod });
    // Simulate another PR manually merged to main (MAIN_0 -> MAIN_1) right before our PUT /merge!
    cAdv.mainSha = MAIN_1;
    cAdv.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, mergeStateStatus: 'BEHIND' }));
    cAdv.comparisons.set(`${MAIN_1}...${SHA_1}`, {
      status: 'diverged',
      aheadBy: 1,
      behindBy: 1,
      mergeBaseSha: MAIN_0,
    });
    throw new Error('GitHub REST HTTP 409: Base branch was modified. Review and try the merge again.');
  };

  const resAdv = await startBatch(cAdv, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 371, expectedHeadSha: SHA_1 }],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal(mergeAttempt, 1);
  assert.equal(resAdv.ok, true);
  assert.equal(resAdv.action, 'updating');
  assert.deepEqual(cAdv.updates, [{ prNumber: 371, expectedHeadSha: SHA_1 }]);

  // Case B: External/manual merge of active PR while awaiting_checks MUST NOT be mistaken for verified batch completion!
  const cExt = new MockGitHubClient();
  cExt.mainSha = MAIN_2;
  const entries = [
    { prNumber: 371, expectedHeadSha: SHA_1 },
    { prNumber: 373, expectedHeadSha: SHA_2 },
  ];
  cExt.state = {
    version: 2,
    revision: 3,
    batchId: 'batch-ext-merge',
    authorizationDigest: computeAuthorizationDigest({
      owner: 'Bibleberry',
      repo: 'Bibleberry',
      entries,
      integrationPolicy: 'hold-on-update',
      mergeMethod: 'squash',
    }),
    status: 'awaiting_checks',
    createdAt: '2026-11-27T18:00:00.000Z',
    updatedAt: '2026-11-27T18:01:00.000Z',
    authorizedBy: 'ContraPhilosophy',
    integrationPolicy: 'hold-on-update',
    mergeMethod: 'squash',
    entries,
    nextIndex: 0,
    activePrNumber: 371,
    activeReviewedHeadSha: SHA_1,
    activeHeadSha: SHA_1,
    observedMainSha: MAIN_1,
    awaitingChecksSince: '2026-11-27T18:01:00.000Z',
    integrationUpdates: [],
    completedPrNumbers: [],
    completedMerges: [],
    nextAction: 'Waiting',
  };
  cExt.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, state: 'MERGED', mergeCommit: { oid: MAIN_2 } }));
  const extRes = await handlePullRequestClosed(cExt, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 371,
    merged: true,
  });
  assert.equal(extRes.action, 'stopped');
  assert.match(extRes.message, /unverified manual merge/);
  assert.deepEqual((cExt.state as BatchState).completedPrNumbers, []);
  assert.equal(cExt.merges.length, 0);

  // Case C: Manual closure without merging stops batch cleanly.
  const cClosed = new MockGitHubClient();
  cClosed.state = {
    ...(cExt.state as BatchState),
    status: 'running',
    activePrNumber: 371,
    activeHeadSha: SHA_1,
    activeReviewedHeadSha: SHA_1,
    stopReason: undefined,
  };
  cClosed.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, state: 'CLOSED' }));
  const closedRes = await handlePullRequestClosed(cClosed, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 371,
    merged: false,
  });
  assert.equal(closedRes.action, 'stopped');
  assert.match(closedRes.message, /closed without merging/);
});

// ---------------------------------------------------------------------------
// 9. Interrupted update or merge response & durable recovery without duplicates
// ---------------------------------------------------------------------------

test('recovers cleanly from interrupted update-branch and merge responses without duplicate mutations', async () => {
  // Case A: update-branch succeeded remotely, client threw ETIMEDOUT -> provenance verified without duplicate update.
  const cUpd = new MockGitHubClient();
  cUpd.mainSha = MAIN_1;
  cUpd.prs.set(373, makePr({ number: 373, headRefOid: SHA_2, mergeStateStatus: 'BEHIND' }));
  cUpd.comparisons.set(`${MAIN_1}...${SHA_2}`, {
    status: 'diverged',
    aheadBy: 1,
    behindBy: 1,
    mergeBaseSha: MAIN_0,
  });
  setupCleanIntegrationProvenance(cUpd, {
    mergeBaseSha: MAIN_0,
    prevHeadSha: SHA_2,
    baseSha: MAIN_1,
    newHeadSha: SHA_2_UPDATED,
  });
  cUpd.updatePullRequestBranch = async (_o, _r, prNumber, expectedHeadSha) => {
    cUpd.updates.push({ prNumber, expectedHeadSha });
    cUpd.prs.set(
      373,
      makePr({
        number: 373,
        headRefOid: SHA_2_UPDATED,
        statusCheckRollup: {
          state: 'PENDING',
          contexts: {
            pageInfo: { hasNextPage: false },
            nodes: [{ __typename: 'CheckRun', name: 'Build reader application', status: 'QUEUED', conclusion: null, headSha: SHA_2_UPDATED }],
          },
        },
      }),
    );
    throw new Error('Request timeout (ETIMEDOUT)');
  };

  const rUpd = await startBatch(cUpd, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 373, expectedHeadSha: SHA_2 }],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal(rUpd.ok, true);
  assert.equal(rUpd.action, 'awaiting_checks');
  assert.equal(cUpd.updates.length, 1, 'Must NOT call update-branch a second time');
  assert.equal((cUpd.state as BatchState).activeHeadSha, SHA_2_UPDATED);

  // Case B: merge succeeded remotely, client threw 502 -> confirms mergeCommitSha without duplicate merge!
  const cMrg = new MockGitHubClient();
  cMrg.mainSha = MAIN_0;
  cMrg.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, mergeStateStatus: 'CLEAN' }));
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
  assert.equal(rMrg.ok, true);
  assert.equal(rMrg.action, 'completed');
  assert.equal(cMrg.merges.length, 1, 'Must NOT call mergePullRequest twice');
  assert.equal((cMrg.state as BatchState).completedMerges[0].mergeCommitSha, MAIN_1);

  // Case C: merge timed out while PR remained OPEN -> write-ahead `merging` preserved, reconcile stops without duplicate merge!
  const cInd = new MockGitHubClient();
  cInd.mainSha = MAIN_0;
  cInd.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, mergeStateStatus: 'CLEAN' }));
  cInd.mergeError = new Error('HTTP 504 Gateway Timeout');

  const rInd = await startBatch(cInd, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 371, expectedHeadSha: SHA_1 }],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal(rInd.ok, true);
  assert.equal((cInd.state as BatchState).status, 'merging');
  assert.equal(cInd.merges.length, 1);

  const recInd = await reconcileBatch(cInd, { owner: 'Bibleberry', repo: 'Bibleberry' });
  assert.equal(recInd.action, 'stopped');
  assert.match(recInd.message, /without issuing a duplicate merge mutation/);
  assert.equal(cInd.merges.length, 1, 'Reconcile must not re-issue merge when PR stayed OPEN');

  // Case D: post-merge save failure -> write-ahead `merging` survives and reconcile recovers to `completed` without duplicate merge!
  const cSave = new MockGitHubClient();
  cSave.mainSha = MAIN_0;
  cSave.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, mergeStateStatus: 'CLEAN' }));
  // Save #1 = initial running, Save #2 = write-ahead merging, Save #3 = final completed (FAILS!)
  cSave.saveErrors = [null, null, new Error('Variables API 503')];
  const rSave = await startBatch(cSave, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 371, expectedHeadSha: SHA_1 }],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal((cSave.state as BatchState).status, 'merging');
  assert.equal(rSave.action, 'merged');
  assert.equal(cSave.merges.length, 1);

  const recSave = await reconcileBatch(cSave, { owner: 'Bibleberry', repo: 'Bibleberry' });
  assert.equal(recSave.action, 'completed');
  assert.equal((cSave.state as BatchState).status, 'completed');
  assert.equal(cSave.merges.length, 1);
});

// ---------------------------------------------------------------------------
// 10. Duplicate events, simultaneous batches, legacy v1 preservation
// ---------------------------------------------------------------------------

test('ignores duplicate events, blocks simultaneous batches, and never discards an unresolved active legacy v1 batch', async () => {
  const client = new MockGitHubClient();
  client.prs.set(371, makePr({ number: 371, headRefOid: SHA_1 }));
  client.onMerge = () => MAIN_1;
  await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 371, expectedHeadSha: SHA_1 }],
    authorizedBy: 'ContraPhilosophy',
  });

  // Duplicate pull_request: closed webhook for already-completed PR #371 is ignored.
  const dup = await handlePullRequestClosed(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 371,
    merged: true,
  });
  assert.equal(dup.action, 'ignored');
  assert.match(dup.message, /duplicate event ignored/);

  // Unresolved active legacy v1 batch must NEVER be discarded when starting a new batch.
  const legacyState: LegacyBatchStateV1 = {
    version: 1,
    revision: 4,
    batchId: 'batch-legacy-v1',
    status: 'enqueuing',
    createdAt: '2026-11-17T12:00:00.000Z',
    updatedAt: '2026-11-17T12:01:00.000Z',
    authorizedBy: 'ContraPhilosophy',
    entries: [{ prNumber: 180, expectedHeadSha: SHA_1 }],
    nextIndex: 0,
    activePrNumber: 180,
    activeHeadSha: SHA_1,
    completedPrNumbers: [],
  };
  client.state = legacyState;
  client.prs.set(180, makePr({ id: 'PR_180', number: 180, headRefOid: SHA_1, isInMergeQueue: true }));

  const blockedByLegacy = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 371, expectedHeadSha: SHA_1 }],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal(blockedByLegacy.ok, false);
  assert.match(blockedByLegacy.error ?? '', /unresolved active legacy v1/);
  assert.equal(client.state?.batchId, 'batch-legacy-v1');

  // Reconcile preserves legacy v1 batch while PR is still queued.
  const legacyRec = await reconcileBatch(client, { owner: 'Bibleberry', repo: 'Bibleberry' });
  assert.equal(legacyRec.action, 'waiting');
  assert.equal(client.state?.batchId, 'batch-legacy-v1');

  // Abort cleanly dequeues legacy PR and marks legacy batch aborted.
  const legacyAbort = await abortBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    actor: 'ContraPhilosophy',
    reason: 'Retiring legacy batch before direct-merge cutover',
    workflowRunId: '888',
  });
  assert.equal(legacyAbort.aborted, true);
  assert.equal(legacyAbort.dequeuedPrNumber, 180);
  assert.deepEqual(client.dequeued, ['PR_180']);
  assert.equal(client.state?.status, 'aborted');
});

// ---------------------------------------------------------------------------
// 11. Cancellation during every stage + abort races + owner authorization
// ---------------------------------------------------------------------------

test('cancellation works across running, updating, awaiting_checks, merging, and held stages and reports completed merges', async () => {
  const stages: Array<BatchState['status']> = ['running', 'updating', 'awaiting_checks', 'merging', 'held'];
  const entries = [
    { prNumber: 371, expectedHeadSha: SHA_1 },
    { prNumber: 373, expectedHeadSha: SHA_2 },
  ];

  for (const stage of stages) {
    const client = new MockGitHubClient();
    client.state = {
      version: 2,
      revision: 5,
      batchId: `batch-${stage}`,
      authorizationDigest: computeAuthorizationDigest({
        owner: 'Bibleberry',
        repo: 'Bibleberry',
        entries,
        integrationPolicy: 'hold-on-update',
        mergeMethod: 'squash',
      }),
      status: stage,
      createdAt: '2026-11-27T18:00:00.000Z',
      updatedAt: '2026-11-27T18:05:00.000Z',
      authorizedBy: 'ContraPhilosophy',
      integrationPolicy: 'hold-on-update',
      mergeMethod: 'squash',
      entries,
      nextIndex: 1,
      activePrNumber: 373,
      activeReviewedHeadSha: SHA_2,
      activeHeadSha: SHA_2,
      observedMainSha: MAIN_1,
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
      // Simulate PR #373 already merged on GitHub right before abort arrived!
      client.prs.set(373, makePr({ number: 373, headRefOid: SHA_2, state: 'MERGED', mergeCommit: { oid: MAIN_2 } }));
    }

    const res = await abortBatch(client, {
      owner: 'Bibleberry',
      repo: 'Bibleberry',
      actor: 'ContraPhilosophy',
      reason: `Cancel during ${stage}`,
      workflowRunId: '999',
    });
    assert.equal(res.aborted, true, `Abort should succeed during ${stage}`);
    assert.equal((client.state as BatchState).status, 'aborted');
    assert.match(res.message, new RegExp(`during stage "${stage}"`));
    assert.match(res.message, /#371/);
    if (stage === 'merging') {
      assert.equal(res.completedMerges.length, 2, 'Abort during merging must report already-landed merge #373');
      assert.match(res.message, /#373/);
    }
  }
});

test('abort racing before merge stops subsequent mutation and preserves aborted state', async () => {
  const client = new MockGitHubClient();
  client.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, mergeStateStatus: 'CLEAN' }));

  let abortInjected = false;
  const originalSave = client.saveBatchState.bind(client);
  client.saveBatchState = async (owner, repo, state) => {
    await originalSave(owner, repo, state);
    if (!abortInjected && state.version === 2 && state.status === 'merging') {
      abortInjected = true;
      await abortBatch(client, {
        owner,
        repo,
        actor: 'ContraPhilosophy',
        reason: 'Emergency stop before merge API call',
      });
    }
  };

  await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 371, expectedHeadSha: SHA_1 }],
    authorizedBy: 'ContraPhilosophy',
  });

  assert.equal(abortInjected, true);
  assert.equal(client.merges.length, 0, 'Merge API MUST NOT be called after concurrent abort');
  assert.equal(client.state?.status, 'aborted');
});

test('owner authorization fails closed for start, manual reconcile, and abort when actor or environment approval is invalid', async () => {
  const client = new MockGitHubClient();
  client.prs.set(371, makePr({ number: 371, headRefOid: SHA_1 }));

  const nonOwnerStart = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 371, expectedHeadSha: SHA_1 }],
    authorizedBy: 'external-contributor',
    workflowRunId: '100',
  });
  assert.equal(nonOwnerStart.ok, false);
  assert.match(nonOwnerStart.error ?? '', /not in authorized owners/);

  client.approvalResult = { ok: false, reason: 'Missing merge-queue-approval approval.' };
  const unapprovedStart = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 371, expectedHeadSha: SHA_1 }],
    authorizedBy: 'ContraPhilosophy',
    workflowRunId: '100',
  });
  assert.equal(unapprovedStart.ok, false);
  assert.match(unapprovedStart.error ?? '', /Authorization failed \(fail-closed\)/);

  const unapprovedReconcile = await reconcileBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    requireApproval: { actor: 'ContraPhilosophy', workflowRunId: '101' },
  });
  assert.equal(unapprovedReconcile.action, 'stopped');
  assert.match(unapprovedReconcile.message, /Manual reconcile authorization failed/);

  const unapprovedAbort = await abortBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    actor: 'ContraPhilosophy',
    workflowRunId: '102',
  });
  assert.equal(unapprovedAbort.aborted, false);
  assert.match(unapprovedAbort.message, /Abort authorization failed/);
});

// ---------------------------------------------------------------------------
// 12. Credential isolation & trusted-source execution workflow assertions
// ---------------------------------------------------------------------------

test('workflow enforces trusted default-branch execution, credential isolation, GitHub App token pinning, idle zero-runner gating, single-writer concurrency, and default §2C policy', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/merge-queue-batch.yml', import.meta.url),
    'utf8',
  );

  // Least privilege top-level permissions.
  assert.match(workflow, /^permissions: \{\}\s*$/m);

  // Native merge_group trigger replaced with direct PR/check_suite + watchdog triggers.
  assert.doesNotMatch(workflow, /^\s*merge_group:/m);
  assert.match(workflow, /pull_request:\s*\n\s*types: \[closed, synchronize\]/);
  assert.match(workflow, /check_suite:\s*\n\s*types: \[completed\]/);
  assert.match(workflow, /schedule:\s*\n(?:\s*#.*\n)*\s*-\s*cron:\s*['"]\*\/15 \* \* \* \*['"]/);

  // Idle zero-runner variable gating on event-driven & watchdog jobs (including legacy enqueuing).
  assert.match(workflow, /vars\.MERGE_QUEUE_BATCH_STATE != ''/);
  assert.match(workflow, /contains\(vars\.MERGE_QUEUE_BATCH_STATE, '"status":"awaiting_checks"'\)/);
  assert.match(workflow, /contains\(vars\.MERGE_QUEUE_BATCH_STATE, '"status":"enqueuing"'\)/);

  // SHA-pinned GitHub App token action scoped strictly to current repository.
  const appTokenUses =
    workflow.match(/uses: actions\/create-github-app-token@[0-9a-f]{40}/g) ?? [];
  assert.equal(appTokenUses.length, 5, 'All 5 writer jobs must use SHA-pinned actions/create-github-app-token');
  const appRepoScopes =
    workflow.match(/repositories: \$\{\{ github\.event\.repository\.name \}\}/g) ?? [];
  assert.equal(appRepoScopes.length, 5, 'Every GitHub App token must be scoped strictly to the current repository');

  // Every actions/checkout step must check out default_branch (main) with persist-credentials: false.
  const checkoutMatches = workflow.match(/uses: actions\/checkout@[0-9a-f]{40}/g) ?? [];
  const defaultBranchRefMatches =
    workflow.match(/ref: \$\{\{ github\.event\.repository\.default_branch \}\}/g) ?? [];
  const persistFalseMatches = workflow.match(/persist-credentials: false/g) ?? [];
  assert.equal(checkoutMatches.length, 7);
  assert.equal(defaultBranchRefMatches.length, 7);
  assert.equal(persistFalseMatches.length, 7);

  // Read-only preflight and status jobs must NEVER reference the App private key or MERGE_QUEUE_TOKEN.
  const preflightBlock = workflow.slice(
    workflow.indexOf('  preflight:'),
    workflow.indexOf('  authorize-and-start:'),
  );
  assert.doesNotMatch(preflightBlock, /COPPER_TURNSTILE_APP_PRIVATE_KEY|MERGE_QUEUE_TOKEN/);
  const statusBlock = workflow.slice(
    workflow.indexOf('  status:'),
    workflow.indexOf('  reconcile:'),
  );
  assert.doesNotMatch(statusBlock, /COPPER_TURNSTILE_APP_PRIVATE_KEY|MERGE_QUEUE_TOKEN/);

  // Single-writer FIFO serialization across all 5 mutating jobs.
  assert.doesNotMatch(workflow, /^concurrency:\s*$/m);
  assert.doesNotMatch(workflow, /cancel-in-progress:\s*true/);
  const writerMatches =
    workflow.match(
      /concurrency:\s*\n(?:\s*#.*\n)*\s*group: merge-queue-batch-writer\s*\n\s*cancel-in-progress: false\s*\n\s*queue: max/g,
    ) ?? [];
  assert.equal(writerMatches.length, 5);

  // Owner-only initiation, manual reconcile, and abort gated by refs/heads/main, ContraPhilosophy, and merge-queue-approval.
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
  assert.match(workflow, /reconcile --require-approval --actor "\$\{\{ github\.actor \}\}"/);

  // Must NOT expose or activate integration-only auto-merge policy without explicit §2C governance approval.
  assert.doesNotMatch(workflow, /integration-only/i);
  assert.doesNotMatch(workflow, /allow-integration-only/i);
});

// ---------------------------------------------------------------------------
// 13. Post-update review re-read, base advancement during CI, abort before
//     update-branch, tampered state digest, and REST/GraphQL client contracts
// ---------------------------------------------------------------------------

test('re-reads effective approval requirements after branch update and blocks when native review became stale or required', async () => {
  const client = new MockGitHubClient();
  client.mainSha = MAIN_1;
  client.policy = makePolicy({ requiredApprovingReviewCount: 1, dismissStaleReviews: true });
  client.prs.set(
    373,
    makePr({
      number: 373,
      headRefOid: SHA_2,
      mergeStateStatus: 'BEHIND',
      reviewDecision: 'APPROVED',
      latestReviews: {
        nodes: [{ state: 'APPROVED', author: { login: 'independent-reviewer' }, commit: { oid: SHA_2 } }],
      },
    }),
  );
  client.comparisons.set(`${MAIN_1}...${SHA_2}`, {
    status: 'diverged',
    aheadBy: 1,
    behindBy: 1,
    mergeBaseSha: MAIN_0,
  });
  setupCleanIntegrationProvenance(client, {
    mergeBaseSha: MAIN_0,
    prevHeadSha: SHA_2,
    baseSha: MAIN_1,
    newHeadSha: SHA_2_UPDATED,
  });
  client.onUpdateBranch = () => {
    // After branch update, GitHub dismissed stale approval -> REVIEW_REQUIRED on SHA_2_UPDATED!
    client.prs.set(
      373,
      makePr({
        number: 373,
        headRefOid: SHA_2_UPDATED,
        mergeStateStatus: 'BLOCKED',
        reviewDecision: 'REVIEW_REQUIRED',
        latestReviews: {
          nodes: [{ state: 'APPROVED', author: { login: 'independent-reviewer' }, commit: { oid: SHA_2 } }],
        },
      }),
    );
  };

  const outcome = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 373, expectedHeadSha: SHA_2 }],
    authorizedBy: 'ContraPhilosophy',
    integrationPolicy: 'integration-only',
    allowIntegrationOnlyPolicy: true,
  });
  assert.equal(outcome.action, 'stopped');
  assert.match(outcome.error ?? '', /REVIEW_REQUIRED|approving review is stale/);
  assert.equal(client.merges.length, 0);
});

test('main advancing again during awaiting_checks triggers max-update HOLD rather than looping', async () => {
  const client = new MockGitHubClient();
  client.mainSha = MAIN_2;
  const entries = [{ prNumber: 373, expectedHeadSha: SHA_2 }];
  client.state = {
    version: 2,
    revision: 3,
    batchId: 'batch-main-moved-again',
    authorizationDigest: computeAuthorizationDigest({
      owner: 'Bibleberry',
      repo: 'Bibleberry',
      entries,
      integrationPolicy: 'hold-on-update',
      mergeMethod: 'squash',
    }),
    status: 'awaiting_checks',
    createdAt: '2026-11-27T18:00:00.000Z',
    updatedAt: '2026-11-27T18:01:00.000Z',
    authorizedBy: 'ContraPhilosophy',
    integrationPolicy: 'hold-on-update',
    mergeMethod: 'squash',
    entries,
    nextIndex: 0,
    activePrNumber: 373,
    activeReviewedHeadSha: SHA_2,
    activeHeadSha: SHA_2_UPDATED,
    observedMainSha: MAIN_1,
    awaitingChecksSince: '2026-11-27T18:01:00.000Z',
    integrationUpdates: [
      {
        prNumber: 373,
        fromHeadSha: SHA_2,
        toHeadSha: SHA_2_UPDATED,
        mergedBaseSha: MAIN_1,
        mergeBaseSha: MAIN_0,
        requestedAt: '2026-11-27T18:00:30.000Z',
        verifiedAt: '2026-11-27T18:01:00.000Z',
        overlappingFiles: [],
        provenanceVerified: true,
      },
    ],
    completedPrNumbers: [],
    completedMerges: [],
    nextAction: 'Waiting',
  };
  client.prs.set(373, makePr({ number: 373, headRefOid: SHA_2_UPDATED, mergeStateStatus: 'BEHIND' }));
  client.comparisons.set(`${MAIN_2}...${SHA_2_UPDATED}`, {
    status: 'diverged',
    aheadBy: 2,
    behindBy: 1,
    mergeBaseSha: MAIN_1,
  });

  // Unrelated manual merge PR #999 into main fires pull_request: closed -> triggers safe reconciliation!
  const res = await handlePullRequestClosed(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    prNumber: 999,
    merged: true,
  });
  assert.equal(res.action, 'held');
  assert.match(res.message, /fell behind main.*again after 1 automatic branch update/);
  assert.equal(client.updates.length, 0);
  assert.equal(client.merges.length, 0);
});

test('abort racing before update-branch prevents branch update and tampered authorizationDigest stops fail-closed', async () => {
  const client = new MockGitHubClient();
  client.mainSha = MAIN_1;
  client.prs.set(373, makePr({ number: 373, headRefOid: SHA_2, mergeStateStatus: 'BEHIND' }));
  client.comparisons.set(`${MAIN_1}...${SHA_2}`, {
    status: 'diverged',
    aheadBy: 1,
    behindBy: 1,
    mergeBaseSha: MAIN_0,
  });

  let abortInjected = false;
  const originalSave = client.saveBatchState.bind(client);
  client.saveBatchState = async (owner, repo, state) => {
    await originalSave(owner, repo, state);
    if (!abortInjected && state.version === 2 && state.status === 'updating') {
      abortInjected = true;
      await abortBatch(client, {
        owner,
        repo,
        actor: 'ContraPhilosophy',
        reason: 'Stop before update-branch',
      });
    }
  };

  await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 373, expectedHeadSha: SHA_2 }],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal(abortInjected, true);
  assert.equal(client.updates.length, 0, 'update-branch MUST NOT be called after concurrent abort');
  assert.equal(client.state?.status, 'aborted');

  // Tampered state digest (substituted PR entry) MUST fail closed immediately.
  const cTamper = new MockGitHubClient();
  cTamper.state = {
    version: 2,
    revision: 1,
    batchId: 'batch-tampered',
    authorizationDigest: '0000000000000000000000000000000000000000000000000000000000000000',
    status: 'running',
    createdAt: '2026-11-27T18:00:00.000Z',
    updatedAt: '2026-11-27T18:00:00.000Z',
    authorizedBy: 'ContraPhilosophy',
    integrationPolicy: 'hold-on-update',
    mergeMethod: 'squash',
    entries: [{ prNumber: 371, expectedHeadSha: SHA_1 }],
    nextIndex: 0,
    activePrNumber: 371,
    activeReviewedHeadSha: SHA_1,
    activeHeadSha: SHA_1,
    integrationUpdates: [],
    completedPrNumbers: [],
    completedMerges: [],
    nextAction: 'Evaluate',
  };
  const tamperRes = await reconcileBatch(cTamper, { owner: 'Bibleberry', repo: 'Bibleberry' });
  assert.equal(tamperRes.action, 'stopped');
  assert.match(tamperRes.message, /failed authorizationDigest verification/);
  assert.equal(cTamper.merges.length, 0);
});

test('createGitHubClient sends exact protected REST payloads and degrades cleanly when branch protection returns 403', async () => {
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
          allow_merge_commit: false,
          allow_rebase_merge: false,
        }),
        { status: 200 },
      );
    }
    if (url.endsWith('/branches/main/protection')) {
      return new Response(JSON.stringify({ message: 'Resource not accessible by integration' }), { status: 403 });
    }
    if (url.endsWith('/pulls/371/update-branch')) {
      return new Response(JSON.stringify({ message: 'Updating pull request branch.' }), { status: 202 });
    }
    if (url.endsWith('/pulls/371/merge')) {
      return new Response(JSON.stringify({ sha: MAIN_1, merged: true, message: 'Merged' }), { status: 200 });
    }
    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
  }) as typeof fetch;

  try {
    const gh = createGitHubClient('test-token', 'read-token');
    const policy = await gh.getRepositoryPolicy('Bibleberry', 'Bibleberry');
    assert.equal(policy.protectionAccessible, false);
    assert.equal(policy.allowSquashMerge, true);
    assert.equal(policy.allowMergeCommit, false);

    await gh.updatePullRequestBranch('Bibleberry', 'Bibleberry', 371, SHA_1);
    const updateCall = calls.find((c) => c.url.endsWith('/pulls/371/update-branch'));
    assert.equal(updateCall?.method, 'PUT');
    assert.deepEqual(JSON.parse(updateCall?.body ?? '{}'), { expected_head_sha: SHA_1 });

    const merged = await gh.mergePullRequest('Bibleberry', 'Bibleberry', 371, SHA_1, 'squash');
    assert.equal(merged.merged, true);
    assert.equal(merged.sha, MAIN_1);
    const mergeCall = calls.find((c) => c.url.endsWith('/pulls/371/merge'));
    assert.equal(mergeCall?.method, 'PUT');
    assert.deepEqual(JSON.parse(mergeCall?.body ?? '{}'), { sha: SHA_1, merge_method: 'squash' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
