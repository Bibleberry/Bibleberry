import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { createGitHubClient, extractSingleFileFromZip } from '../../scripts/ci/merge-queue-batch.ts';
import {
  abortBatch,
  buildAuthorizedManifest,
  computeCommentBodyDigest,
  computeStateChecksum,
  COORDINATOR_WORKFLOW_PATH,
  evaluateBranchProtectionSafety,
  evaluateCheckVerification,
  evaluateIndependentReviewComments,
  evaluatePullRequestPreflight,
  handleChecksCompleted,
  handlePullRequestClosed,
  handlePullRequestSynchronize,
  parseBatchEntries,
  parseStructuredIndependentReviewComment,
  reconcileBatch,
  runPreflight,
  START_APPROVAL_JOB_NAME,
  startBatch,
  verifyIntegrationUpdateProvenance,
  type ApprovalVerificationResult,
  type AuthorizedBatchManifest,
  type BatchEntry,
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

const COMMENT_ID_1 = '7230996401';
const COMMENT_ID_2 = '7230996402';
const COMMENT_ID_3 = '7230996403';

function makeApprovedReviewComment(
  prNumber: number,
  headSha: string,
  commentId = COMMENT_ID_1,
  reviewer = 'ContraPhilosophy',
  createdAt = '2026-11-27T17:00:00.000Z',
): PullRequestCommentNode {
  return {
    id: commentId,
    author: { login: reviewer },
    createdAt,
    body: [
      `**Claude Says | [Issue #367](https://github.com/Bibleberry/Bibleberry/issues/367) | PR #${prNumber} | Independent Review | exact HEAD \`${headSha}\`**`,
      '',
      '**Disposition: CODE APPROVED — bounded implementation verified.** No blocking findings.',
    ].join('\n'),
  };
}

function makePr(overrides: Partial<PullRequestSnapshot> = {}, commentId = COMMENT_ID_1): PullRequestSnapshot {
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
      nodes: [makeApprovedReviewComment(prNumber, headRefOid, commentId)],
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

/**
 * Builds a valid single-file ZIP archive (optionally with Deflate + streaming data-descriptor
 * where local header compressedSize=0 and real size is in the Central Directory).
 */
function buildTestZip(filename: string, content: string, deflate = true): Uint8Array {
  const nameBuf = Buffer.from(filename, 'utf8');
  const rawBuf = Buffer.from(content, 'utf8');
  const dataBuf = deflate ? deflateRawSync(rawBuf) : rawBuf;
  const method = deflate ? 8 : 0;

  // Local file header (simulate streaming ZIP: flag bit 3 set, compressedSize=0 in LFH).
  const lfh = Buffer.alloc(30);
  lfh.writeUInt32LE(0x04034b50, 0);
  lfh.writeUInt16LE(20, 4);
  lfh.writeUInt16LE(deflate ? 0x0008 : 0, 6);
  lfh.writeUInt16LE(method, 8);
  lfh.writeUInt32LE(deflate ? 0 : dataBuf.length, 18);
  lfh.writeUInt32LE(deflate ? 0 : rawBuf.length, 22);
  lfh.writeUInt16LE(nameBuf.length, 26);
  lfh.writeUInt16LE(0, 28);

  const localPart = Buffer.concat([lfh, nameBuf, dataBuf]);
  const cdOffset = localPart.length;

  const cdh = Buffer.alloc(46);
  cdh.writeUInt32LE(0x02014b50, 0);
  cdh.writeUInt16LE(20, 4);
  cdh.writeUInt16LE(20, 6);
  cdh.writeUInt16LE(deflate ? 0x0008 : 0, 8);
  cdh.writeUInt16LE(method, 10);
  cdh.writeUInt32LE(dataBuf.length, 20);
  cdh.writeUInt32LE(rawBuf.length, 24);
  cdh.writeUInt16LE(nameBuf.length, 28);
  cdh.writeUInt16LE(0, 30);
  cdh.writeUInt16LE(0, 32);
  cdh.writeUInt32LE(0, 42);
  const cdPart = Buffer.concat([cdh, nameBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdPart.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return new Uint8Array(Buffer.concat([localPart, cdPart, eocd]));
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

  approvalResult: ApprovalVerificationResult = {
    ok: true,
    approvedBy: 'ContraPhilosophy',
    workflowPath: COORDINATOR_WORKFLOW_PATH,
    event: 'workflow_dispatch',
    headBranch: 'main',
    actor: 'ContraPhilosophy',
    hasStartApprovalJob: true,
  };
  approvalByRunId = new Map<string, ApprovalVerificationResult>();
  manifestsByRunId = new Map<string, AuthorizedBatchManifest | null>();
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

  async getAuthorizedManifest(
    _owner: string,
    _repo: string,
    runId: string,
  ): Promise<AuthorizedBatchManifest | null> {
    if (this.manifestsByRunId.has(runId)) {
      return this.manifestsByRunId.get(runId) ?? null;
    }
    return null;
  }
}

function registerManifest(
  client: MockGitHubClient,
  runId: string,
  entries: BatchEntry[],
  mergeMethod: MergeMethod = 'squash',
  integrationPolicy: 'integration-only' | 'hold-on-update' = 'integration-only',
): AuthorizedBatchManifest {
  const manifest = buildAuthorizedManifest({
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    workflowRunId: runId,
    authorizedBy: 'ContraPhilosophy',
    mergeMethod,
    integrationPolicy,
    entries,
  });
  client.manifestsByRunId.set(runId, manifest);
  return manifest;
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
// 1. Input parsing (`PR@SHA#COMMENT_ID` & `PR@SHA`) and Dry-run (zero writes)
// ---------------------------------------------------------------------------

test('parseBatchEntries parses PR@SHA#COMMENT_ID and PR@SHA entries and rejects malformed input', () => {
  const entries = parseBatchEntries(
    `371@${SHA_1.toUpperCase()}#${COMMENT_ID_1},\n 373@${SHA_2}#${COMMENT_ID_2} 374@${SHA_3}`,
  );
  assert.deepEqual(entries, [
    { prNumber: 371, expectedHeadSha: SHA_1, reviewCommentId: COMMENT_ID_1 },
    { prNumber: 373, expectedHeadSha: SHA_2, reviewCommentId: COMMENT_ID_2 },
    { prNumber: 374, expectedHeadSha: SHA_3 },
  ]);

  assert.throws(() => parseBatchEntries('   '), /empty/i);
  assert.throws(() => parseBatchEntries('371'), /Expected format/);
  assert.throws(() => parseBatchEntries(`0@${SHA_1}`), /positive integer/);
  assert.throws(() => parseBatchEntries('371@abc1234'), /40-character/);
  assert.throws(() => parseBatchEntries(`371@${SHA_1}#notanumber`), /numeric GitHub issue comment ID/);
  assert.throws(() => parseBatchEntries(`371@${SHA_1}#0`), /numeric GitHub issue comment ID/);
  assert.throws(() => parseBatchEntries(`371@${SHA_1}#1#2`), /at most one #REVIEW_COMMENT_ID/);
  assert.throws(() => parseBatchEntries(`371@${SHA_1},371@${SHA_2}`), /Duplicate PR #371/);
});

test('dry-run validates owner-attested entries with zero writes and surfaces inaccessible-protection notice', async () => {
  const client = new MockGitHubClient();
  client.policy = makePolicy({ protectionAccessible: false });
  client.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, mergeStateStatus: 'CLEAN' }, COMMENT_ID_1));
  client.prs.set(373, makePr({ number: 373, headRefOid: SHA_2, mergeStateStatus: 'BEHIND' }, COMMENT_ID_2));

  const outcome = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [
      { prNumber: 371, expectedHeadSha: SHA_1, reviewCommentId: COMMENT_ID_1 },
      { prNumber: 373, expectedHeadSha: SHA_2, reviewCommentId: COMMENT_ID_2 },
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
    { prNumber: 371, expectedHeadSha: SHA_1, reviewCommentId: COMMENT_ID_1 },
  ]);
  assert.equal(preflight.ok, true);
  assert.equal(client.saveCount, 0);
});

// ---------------------------------------------------------------------------
// 2. Unattended 3-PR batch with single owner approval + immutable run manifest
// ---------------------------------------------------------------------------

test('unattended 3-PR batch merges current PR #1 without extra CI, then updates & merges PR #2 and PR #3 on workflow_run wakeups with verified immutable manifest', async () => {
  const client = new MockGitHubClient();
  let clockMs = Date.parse('2026-11-27T19:00:00.000Z');
  const now = () => new Date(clockMs).toISOString();

  const entries: BatchEntry[] = [
    { prNumber: 371, expectedHeadSha: SHA_1, reviewCommentId: COMMENT_ID_1 },
    { prNumber: 373, expectedHeadSha: SHA_2, reviewCommentId: COMMENT_ID_2 },
    { prNumber: 374, expectedHeadSha: SHA_3, reviewCommentId: COMMENT_ID_3 },
  ];
  registerManifest(client, '5001', entries);

  client.mainSha = MAIN_0;
  client.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, mergeStateStatus: 'CLEAN' }, COMMENT_ID_1));
  client.prs.set(373, makePr({ number: 373, headRefOid: SHA_2, mergeStateStatus: 'CLEAN' }, COMMENT_ID_2));
  client.prs.set(374, makePr({ number: 374, headRefOid: SHA_3, mergeStateStatus: 'CLEAN' }, COMMENT_ID_3));

  client.onMerge = (prNum) => {
    if (prNum === 371) {
      client.prs.set(373, makePr({ number: 373, headRefOid: SHA_2, mergeStateStatus: 'BEHIND' }, COMMENT_ID_2));
      client.prs.set(374, makePr({ number: 374, headRefOid: SHA_3, mergeStateStatus: 'BEHIND' }, COMMENT_ID_3));
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

  const started = await startBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries,
    authorizedBy: 'ContraPhilosophy',
    workflowRunId: '5001',
    requireWorkflowApprovalRecord: true,
    now,
  });

  assert.equal(started.ok, true);
  assert.equal(started.action, 'updating');
  assert.deepEqual(client.merges, [{ prNumber: 371, expectedHeadSha: SHA_1, mergeMethod: 'squash' }]);
  assert.deepEqual(client.updates, [{ prNumber: 373, expectedHeadSha: SHA_2 }]);
  assert.ok((client.state as BatchState).entries[1].reviewCommentDigest, 'Comment body digest must be captured at start');

  // PR #373 synchronize -> verify clean disjoint provenance -> awaiting_checks.
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
      issueComments: {
        pageInfo: { hasNextPage: false },
        nodes: [makeApprovedReviewComment(373, SHA_2, COMMENT_ID_2)],
      },
      statusCheckRollup: {
        state: 'PENDING',
        contexts: {
          pageInfo: { hasNextPage: false },
          nodes: [{ __typename: 'CheckRun', name: 'Build reader application', status: 'IN_PROGRESS', conclusion: null, headSha: SHA_2_UPDATED }],
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

  // Ordinary PR CI finishes -> workflow_run wakeup merges PR #373 and updates PR #374.
  client.prs.set(
    373,
    makePr({
      number: 373,
      headRefOid: SHA_2_UPDATED,
      mergeStateStatus: 'CLEAN',
      issueComments: { pageInfo: { hasNextPage: false }, nodes: [makeApprovedReviewComment(373, SHA_2, COMMENT_ID_2)] },
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
  assert.equal(ci373.action, 'updating');
  assert.equal(client.merges.length, 2);
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
      issueComments: { pageInfo: { hasNextPage: false }, nodes: [makeApprovedReviewComment(374, SHA_3, COMMENT_ID_3)] },
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
  assert.deepEqual((client.state as BatchState).completedPrNumbers, [371, 373, 374]);
});

// ---------------------------------------------------------------------------
// 3. Blocker A Tests: Public-repo external APPROVED, quoted/spoofed review text,
//    shared-account attestation, digest immutability, stale/superseded evidence,
//    and actual repository disposition format
// ---------------------------------------------------------------------------

test('rejects arbitrary non-author external APPROVED reviews in public repos, quoted/fenced/prose spoofing, unattested comments, edited digests, and superseded evidence', () => {
  // 1. Strict parser checks on quoted, fenced, prose, and real repository format.
  assert.equal(
    parseStructuredIndependentReviewComment(
      `> **Claude Says | Issue #367 | PR #375 | Independent Review | exact HEAD \`${SHA_1}\`**\n> \n> **Disposition: CODE APPROVED.**`,
    ).kind,
    'none',
    'Quoted Independent Review block MUST be ignored',
  );
  assert.equal(
    parseStructuredIndependentReviewComment(
      `\`\`\`md\n**Claude Says | Issue #367 | PR #375 | Independent Review | exact HEAD \`${SHA_1}\`**\n\n**Disposition: CODE APPROVED.**\n\`\`\``,
    ).kind,
    'none',
    'Fenced code-block review MUST be ignored',
  );
  assert.equal(
    parseStructuredIndependentReviewComment(
      `Implementation summary: Independent Review will check exact HEAD \`${SHA_1}\`. Hopefully Disposition: CODE APPROVED soon!`,
    ).kind,
    'none',
    'Implementation-agent prose mentioning Independent Review + Disposition MUST be ignored',
  );
  // Real repository comment format from PR #375 (#7230996406)!
  const realParsed = parseStructuredIndependentReviewComment(
    `**Claude Says | [Issue #367](https://github.com/Bibleberry/Bibleberry/issues/367) | PR #375 | Independent Review | exact HEAD \`${SHA_1}\`**\n\n**Disposition: CODE APPROVED — bounded CI coverage repair.** No material code corrections requested.`,
  );
  assert.equal(realParsed.kind, 'approved');
  assert.equal(realParsed.prNumber, 375);
  assert.equal(realParsed.reviewedHeadSha, SHA_1);

  const negativeCases: Array<{
    name: string;
    entry: BatchEntry;
    pr: PullRequestSnapshot;
    policy?: RepositoryPolicy;
    authorizedNativeReviewers?: string[];
    expected: RegExp;
  }> = [
    {
      name: 'arbitrary external non-author APPROVED on public repo (requiredCount=0)',
      entry: { prNumber: 180, expectedHeadSha: SHA_1 },
      pr: makePr({
        number: 180,
        author: { login: 'ContraPhilosophy' },
        issueComments: { pageInfo: { hasNextPage: false }, nodes: [] },
        latestReviews: {
          nodes: [{ state: 'APPROVED', author: { login: 'random-stranger' }, commit: { oid: SHA_1 } }],
        },
      }),
      expected: /not in authorizedNativeReviewers; public-repo non-author is not a trusted reviewer identity/,
    },
    {
      name: 'arbitrary external non-author APPROVED on public repo (requiredCount=1)',
      entry: { prNumber: 180, expectedHeadSha: SHA_1 },
      pr: makePr({
        number: 180,
        author: { login: 'ContraPhilosophy' },
        issueComments: { pageInfo: { hasNextPage: false }, nodes: [] },
        latestReviews: {
          nodes: [{ state: 'APPROVED', author: { login: 'random-stranger' }, commit: { oid: SHA_1 } }],
        },
      }),
      policy: makePolicy({ requiredApprovingReviewCount: 1 }),
      expected: /unauthorized identity \[random-stranger\]/,
    },
    {
      name: 'unattested shared-account comment (missing #COMMENT_ID) is rejected',
      entry: { prNumber: 180, expectedHeadSha: SHA_1 },
      pr: makePr({ number: 180, headRefOid: SHA_1 }, COMMENT_ID_1),
      expected: /no owner-attested review comment ID.*specify PR@SHA#REVIEW_COMMENT_ID/,
    },
    {
      name: 'owner-attested comment ID pointing to quoted review text is rejected',
      entry: { prNumber: 180, expectedHeadSha: SHA_1, reviewCommentId: '9001' },
      pr: makePr({
        number: 180,
        issueComments: {
          pageInfo: { hasNextPage: false },
          nodes: [
            {
              id: '9001',
              author: { login: 'ContraPhilosophy' },
              createdAt: '2026-11-27T17:00:00.000Z',
              body: `> **Test | Issue #202 | PR #180 | Independent Review | exact HEAD \`${SHA_1}\`**\n> **Disposition: CODE APPROVED.**`,
            },
          ],
        },
      }),
      expected: /does not match the strict top-level Independent Review format/,
    },
    {
      name: 'owner-attested comment ID citing wrong PR number (#999 on PR #180) is rejected',
      entry: { prNumber: 180, expectedHeadSha: SHA_1, reviewCommentId: '9002' },
      pr: makePr({
        number: 180,
        issueComments: {
          pageInfo: { hasNextPage: false },
          nodes: [makeApprovedReviewComment(999, SHA_1, '9002')],
        },
      }),
      expected: /cites PR #999, not PR #180/,
    },
    {
      name: 'owner-attested comment ID citing older SHA is rejected as stale',
      entry: { prNumber: 180, expectedHeadSha: SHA_1, reviewCommentId: '9003' },
      pr: makePr({
        number: 180,
        issueComments: {
          pageInfo: { hasNextPage: false },
          nodes: [makeApprovedReviewComment(180, SHA_2, '9003')],
        },
      }),
      expected: /comment #9003 is stale/,
    },
    {
      name: 'owner-attested comment edited after authorization (digest mismatch) is rejected',
      entry: {
        prNumber: 180,
        expectedHeadSha: SHA_1,
        reviewCommentId: COMMENT_ID_1,
        reviewCommentDigest: 'deadbeef'.repeat(8),
      },
      pr: makePr({ number: 180, headRefOid: SHA_1 }, COMMENT_ID_1),
      expected: /edited after batch authorization \(comment digest mismatch\)/,
    },
    {
      name: 'chronologically later CHANGES REQUESTED supersedes attested CODE APPROVED comment',
      entry: { prNumber: 180, expectedHeadSha: SHA_1, reviewCommentId: COMMENT_ID_1 },
      pr: makePr({
        number: 180,
        issueComments: {
          pageInfo: { hasNextPage: false },
          nodes: [
            makeApprovedReviewComment(180, SHA_1, COMMENT_ID_1, 'ContraPhilosophy', '2026-11-27T17:00:00.000Z'),
            {
              id: '9004',
              author: { login: 'ContraPhilosophy' },
              createdAt: '2026-11-27T18:00:00.000Z',
              body: `**Copper Turnstile | Issue #202 | PR #180 | Independent re-review | exact HEAD \`${SHA_1}\`**\n\n**Disposition: CHANGES REQUESTED — defect found.**`,
            },
          ],
        },
      }),
      expected: /superseded by a later blocking disposition.*CHANGES REQUESTED/,
    },
    {
      name: 'authorized native reviewer with null commit OID is rejected',
      entry: { prNumber: 180, expectedHeadSha: SHA_1 },
      pr: makePr({
        number: 180,
        author: { login: 'ContraPhilosophy' },
        issueComments: { pageInfo: { hasNextPage: false }, nodes: [] },
        latestReviews: {
          nodes: [{ state: 'APPROVED', author: { login: 'bibleberry-reviewer' }, commit: { oid: null } }],
        },
      }),
      authorizedNativeReviewers: ['bibleberry-reviewer'],
      expected: /missing\/null commit OID/,
    },
    {
      name: 'untrusted external commenter cannot back owner-attested comment ID',
      entry: { prNumber: 180, expectedHeadSha: SHA_1, reviewCommentId: '9005' },
      pr: makePr({
        number: 180,
        issueComments: {
          pageInfo: { hasNextPage: false },
          nodes: [makeApprovedReviewComment(180, SHA_1, '9005', 'random-public-user')],
        },
      }),
      expected: /untrusted author "random-public-user"/,
    },
    {
      name: 'zero reviews fails closed',
      entry: { prNumber: 180, expectedHeadSha: SHA_1 },
      pr: makePr({
        number: 180,
        latestReviews: { nodes: [] },
        issueComments: { pageInfo: { hasNextPage: false }, nodes: [] },
      }),
      expected: /no authorized native review and no owner-attested review comment ID/,
    },
  ];

  for (const c of negativeCases) {
    const res = evaluatePullRequestPreflight(c.pr, c.entry, 'Bibleberry/Bibleberry', undefined, {
      policy: c.policy ?? makePolicy(),
      authorizedNativeReviewers: c.authorizedNativeReviewers,
    });
    assert.equal(res.ok, false, `${c.name} MUST fail closed`);
    assert.match(res.reasons.join(' '), c.expected, `${c.name} reason mismatch`);
  }

  // Positive: dedicated authorized native reviewer with non-null exact commit OID passes without #COMMENT_ID!
  const dedicatedNativePass = evaluatePullRequestPreflight(
    makePr({
      number: 180,
      author: { login: 'ContraPhilosophy' },
      issueComments: { pageInfo: { hasNextPage: false }, nodes: [] },
      latestReviews: {
        nodes: [{ state: 'APPROVED', author: { login: 'bibleberry-reviewer' }, commit: { oid: SHA_1 } }],
      },
    }),
    { prNumber: 180, expectedHeadSha: SHA_1 },
    'Bibleberry/Bibleberry',
    undefined,
    {
      policy: makePolicy(),
      authorizedNativeReviewers: ['bibleberry-reviewer'],
    },
  );
  assert.equal(dedicatedNativePass.ok, true);
  assert.equal(dedicatedNativePass.reviewEvidence?.source, 'native-review');

  // Positive: owner-attested comment with matching digest passes!
  const commentNode = makeApprovedReviewComment(180, SHA_1, COMMENT_ID_1);
  const attestedPass = evaluateIndependentReviewComments({
    pr: makePr({ number: 180, headRefOid: SHA_1, issueComments: { pageInfo: { hasNextPage: false }, nodes: [commentNode] } }),
    reviewedHeadSha: SHA_1,
    attestedCommentId: COMMENT_ID_1,
    expectedCommentDigest: computeCommentBodyDigest(commentNode.body),
  });
  assert.equal(attestedPass.approved, true);
  assert.equal(attestedPass.evidence?.source, 'owner-attested-comment');
});

// ---------------------------------------------------------------------------
// 4. Blocker B Tests: Substitution attack using an existing valid approved run,
//    non-start run replay, wrong workflow/branch, and ZIP manifest extraction
// ---------------------------------------------------------------------------

test('defeats entry-list substitution attack using a recomputed checksum and an existing valid approved start run', async () => {
  const client = new MockGitHubClient();

  // Original owner-approved run 5001 authorized ONLY PR #371@SHA_1#COMMENT_ID_1.
  const originalEntries: BatchEntry[] = [
    { prNumber: 371, expectedHeadSha: SHA_1, reviewCommentId: COMMENT_ID_1 },
  ];
  registerManifest(client, '5001', originalEntries);

  // Attacker modifies MERGE_QUEUE_BATCH_STATE to substitute PR #999@SHA_2, RECOMPUTES a valid
  // stateChecksum, and points workflowRunId to the genuinely approved run 5001!
  const substitutedEntries: BatchEntry[] = [
    { prNumber: 999, expectedHeadSha: SHA_2, reviewCommentId: COMMENT_ID_2 },
  ];
  client.prs.set(999, makePr({ number: 999, headRefOid: SHA_2 }, COMMENT_ID_2));
  client.state = {
    version: 2,
    revision: 1,
    batchId: 'batch-run-5001',
    stateChecksum: computeStateChecksum({
      owner: 'Bibleberry',
      repo: 'Bibleberry',
      entries: substitutedEntries,
      integrationPolicy: 'integration-only',
      mergeMethod: 'squash',
    }),
    status: 'running',
    createdAt: '2026-11-27T19:00:00.000Z',
    updatedAt: '2026-11-27T19:00:00.000Z',
    authorizedBy: 'ContraPhilosophy',
    approvedBy: 'ContraPhilosophy',
    integrationPolicy: 'integration-only',
    mergeMethod: 'squash',
    workflowRunId: '5001',
    entries: substitutedEntries,
    nextIndex: 0,
    activePrNumber: 999,
    activeReviewedHeadSha: SHA_2,
    activeHeadSha: SHA_2,
    integrationUpdates: [],
    completedPrNumbers: [],
    completedMerges: [],
    nextAction: 'Substituted PR #999',
  };

  const res = await reconcileBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    requireWorkflowApprovalRecord: true,
  });

  assert.equal(res.action, 'stopped');
  assert.match(res.message, /does not match immutable manifest entry.*approved start run 5001/);
  assert.equal(client.merges.length, 0, 'Substituted PR #999 MUST NEVER be merged');

  // Missing manifest artifact also fails closed!
  client.manifestsByRunId.set('5001', null);
  client.state = {
    ...(client.state as BatchState),
    status: 'running',
    entries: originalEntries,
    activePrNumber: 371,
    activeReviewedHeadSha: SHA_1,
    activeHeadSha: SHA_1,
    stateChecksum: computeStateChecksum({
      owner: 'Bibleberry',
      repo: 'Bibleberry',
      entries: originalEntries,
      integrationPolicy: 'integration-only',
      mergeMethod: 'squash',
    }),
  };
  const missingManifestRes = await reconcileBatch(client, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    requireWorkflowApprovalRecord: true,
  });
  assert.equal(missingManifestRes.action, 'stopped');
  assert.match(missingManifestRes.message, /Missing immutable authorization manifest artifact/);
  assert.equal(client.merges.length, 0);
});

test('extractSingleFileFromZip and createGitHubClient verify run metadata, approve-start job, approvals, and immutable ZIP manifest', async () => {
  const manifest = buildAuthorizedManifest({
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    workflowRunId: '6001',
    authorizedBy: 'ContraPhilosophy',
    mergeMethod: 'squash',
    integrationPolicy: 'integration-only',
    entries: [{ prNumber: 375, expectedHeadSha: SHA_1, reviewCommentId: '7230996406' }],
  });

  // Verify both Deflate (streaming data-descriptor) and Store ZIP extraction!
  const deflatedZip = buildTestZip('copper-turnstile-auth-manifest.json', JSON.stringify(manifest), true);
  const storedZip = buildTestZip('copper-turnstile-auth-manifest.json', JSON.stringify(manifest), false);
  assert.deepEqual(JSON.parse(extractSingleFileFromZip(deflatedZip, 'copper-turnstile-auth-manifest.json').toString('utf8')), manifest);
  assert.deepEqual(JSON.parse(extractSingleFileFromZip(storedZip, 'copper-turnstile-auth-manifest.json').toString('utf8')), manifest);

  // Test createGitHubClient.verifyWorkflowApproval rejects non-start run (e.g. abort run) and non-main branch,
  // and accepts genuine start run + extracts manifest via getAuthorizedManifest!
  const originalFetch = globalThis.fetch;
  let mockRunEvent = 'workflow_dispatch';
  let mockRunBranch = 'main';
  let mockRunPath = COORDINATOR_WORKFLOW_PATH;
  let mockJobName = START_APPROVAL_JOB_NAME;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith('/actions/runs/6001')) {
      return new Response(
        JSON.stringify({
          path: mockRunPath,
          event: mockRunEvent,
          head_branch: mockRunBranch,
          actor: { login: 'ContraPhilosophy' },
          repository: { full_name: 'Bibleberry/Bibleberry' },
        }),
        { status: 200 },
      );
    }
    if (url.endsWith('/actions/runs/6001/approvals')) {
      return new Response(
        JSON.stringify([
          { state: 'approved', environments: [{ name: 'merge-queue-approval' }], user: { login: 'ContraPhilosophy' } },
        ]),
        { status: 200 },
      );
    }
    if (url.includes('/actions/runs/6001/jobs')) {
      return new Response(JSON.stringify({ jobs: [{ name: mockJobName, conclusion: 'success' }] }), { status: 200 });
    }
    if (url.includes('/actions/runs/6001/artifacts')) {
      return new Response(
        JSON.stringify({
          artifacts: [
            {
              id: 88,
              name: 'copper-turnstile-auth-manifest-6001',
              expired: false,
              archive_download_url: 'https://api.github.com/repos/Bibleberry/Bibleberry/actions/artifacts/88/zip',
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.endsWith('/actions/artifacts/88/zip')) {
      return new Response(Buffer.from(deflatedZip), { status: 200 });
    }
    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
  }) as typeof fetch;

  try {
    const gh = createGitHubClient('test-token', 'read-token');

    // Genuine start run succeeds and downloads immutable manifest.
    const okAuth = await gh.verifyWorkflowApproval!(
      'Bibleberry',
      'Bibleberry',
      '6001',
      'merge-queue-approval',
      ['ContraPhilosophy'],
      {
        expectedWorkflowPath: COORDINATOR_WORKFLOW_PATH,
        expectedEvent: 'workflow_dispatch',
        expectedHeadBranch: 'main',
        expectedStartApprovalJobName: START_APPROVAL_JOB_NAME,
      },
    );
    assert.equal(okAuth.ok, true);
    assert.equal(okAuth.hasStartApprovalJob, true);

    const fetchedManifest = await gh.getAuthorizedManifest!('Bibleberry', 'Bibleberry', '6001');
    assert.deepEqual(fetchedManifest, manifest);

    // Replaying an approved `abort` run (wrong job name) fails closed!
    mockJobName = 'Owner approval gate for batch cancellation';
    const abortReplay = await gh.verifyWorkflowApproval!(
      'Bibleberry',
      'Bibleberry',
      '6001',
      'merge-queue-approval',
      ['ContraPhilosophy'],
      {
        expectedWorkflowPath: COORDINATOR_WORKFLOW_PATH,
        expectedEvent: 'workflow_dispatch',
        expectedHeadBranch: 'main',
        expectedStartApprovalJobName: START_APPROVAL_JOB_NAME,
      },
    );
    assert.equal(abortReplay.ok, false);
    assert.match(abortReplay.reason ?? '', /did not complete "Owner approval gate for batch start"/);

    // Non-main branch run fails closed!
    mockJobName = START_APPROVAL_JOB_NAME;
    mockRunBranch = 'feat/rogue';
    const branchFail = await gh.verifyWorkflowApproval!(
      'Bibleberry',
      'Bibleberry',
      '6001',
      'merge-queue-approval',
      ['ContraPhilosophy'],
      { expectedHeadBranch: 'main' },
    );
    assert.equal(branchFail.ok, false);
    assert.match(branchFail.reason ?? '', /head_branch was "feat\/rogue", expected "main"/);

    // Unrelated workflow path fails closed!
    mockRunBranch = 'main';
    mockRunPath = '.github/workflows/other.yml';
    const pathFail = await gh.verifyWorkflowApproval!(
      'Bibleberry',
      'Bibleberry',
      '6001',
      'merge-queue-approval',
      ['ContraPhilosophy'],
      { expectedWorkflowPath: COORDINATOR_WORKFLOW_PATH },
    );
    assert.equal(pathFail.ok, false);
    assert.match(pathFail.reason ?? '', /executed "\.github\/workflows\/other\.yml"/);
    // Non-workflow_dispatch event fails closed!
    mockRunPath = COORDINATOR_WORKFLOW_PATH;
    mockRunEvent = 'schedule';
    const eventFail = await gh.verifyWorkflowApproval!(
      'Bibleberry',
      'Bibleberry',
      '6001',
      'merge-queue-approval',
      ['ContraPhilosophy'],
      { expectedEvent: 'workflow_dispatch' },
    );
    assert.equal(eventFail.ok, false);
    assert.match(eventFail.reason ?? '', /event was "schedule", expected "workflow_dispatch"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// 5. Protection safety, provenance, checks, concurrent merges, legacy v1, abort
// ---------------------------------------------------------------------------

test('fails closed on inaccessible/unsafe branch protection, overlapping files, truncated compare, and bad checks', async () => {
  const unsafe = [
    makePolicy({ protectionAccessible: false }),
    makePolicy({ strictStatusChecks: false }),
    makePolicy({ enforceAdmins: false }),
    makePolicy({ requiredConversationResolution: false }),
    makePolicy({ allowForcePushes: true }),
    makePolicy({ allowDeletions: true }),
    makePolicy({ hasBypassAllowances: true, bypassAllowanceTargets: ['app:rogue'] }),
    makePolicy({ requiredStatusChecks: ['Build reader application'] }),
  ];
  for (const policy of unsafe) {
    assert.equal(evaluateBranchProtectionSafety(policy).ok, false);
  }

  // Overlapping files hold immediately under integration-only policy.
  const cOverlap = new MockGitHubClient();
  cOverlap.mainSha = MAIN_1;
  cOverlap.prs.set(373, makePr({ number: 373, headRefOid: SHA_2, mergeStateStatus: 'BEHIND' }, COMMENT_ID_2));
  cOverlap.comparisons.set(`${MAIN_1}...${SHA_2}`, { status: 'diverged', aheadBy: 1, behindBy: 1, mergeBaseSha: MAIN_0, totalCommits: 1 });
  setupCleanIntegrationProvenance(cOverlap, {
    mergeBaseSha: MAIN_0,
    prevHeadSha: SHA_2,
    baseSha: MAIN_1,
    newHeadSha: SHA_2_UPDATED,
    prFiles: [{ filename: 'src/shared.ts', status: 'modified', sha: 'blob-pr' }],
    mainFiles: [{ filename: 'src/shared.ts', status: 'modified', sha: 'blob-main' }],
  });
  cOverlap.onUpdateBranch = () => {
    cOverlap.prs.set(373, makePr({ number: 373, headRefOid: SHA_2_UPDATED, issueComments: { pageInfo: { hasNextPage: false }, nodes: [makeApprovedReviewComment(373, SHA_2, COMMENT_ID_2)] } }));
  };
  const rOverlap = await startBatch(cOverlap, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 373, expectedHeadSha: SHA_2, reviewCommentId: COMMENT_ID_2 }],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal(rOverlap.action, 'held');
  assert.equal(cOverlap.merges.length, 0);

  // Truncated compare diff (300 files) rejected.
  const cTrunc = new MockGitHubClient();
  setupCleanIntegrationProvenance(cTrunc, { mergeBaseSha: MAIN_0, prevHeadSha: SHA_2, baseSha: MAIN_1, newHeadSha: SHA_2_UPDATED });
  cTrunc.comparisons.set(`${MAIN_0}...${MAIN_1}`, { status: 'ahead', aheadBy: 1, behindBy: 0, mergeBaseSha: MAIN_0, totalCommits: 1, files: [], filesTruncated: true });
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

  // Stale, canceled, skipped-only, and missing checks classified accurately.
  const staleCheck = evaluateCheckVerification({
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
  assert.equal(staleCheck.verdict, 'failed');
  assert.deepEqual(staleCheck.staleChecks, ['Build reader application']);
});

test('handles concurrent manual merges, interrupted merge recovery, legacy v1 preservation, and cancellation across stages', async () => {
  // Concurrent manual merge advancing main during merge -> transitions to behind update!
  const cAdv = new MockGitHubClient();
  cAdv.mainSha = MAIN_0;
  cAdv.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, mergeStateStatus: 'CLEAN' }, COMMENT_ID_1));
  cAdv.mergePullRequest = async (_o, _r, prNumber, expectedHeadSha, mergeMethod) => {
    cAdv.merges.push({ prNumber, expectedHeadSha, mergeMethod });
    cAdv.mainSha = MAIN_1;
    cAdv.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, mergeStateStatus: 'BEHIND' }, COMMENT_ID_1));
    cAdv.comparisons.set(`${MAIN_1}...${SHA_1}`, { status: 'diverged', aheadBy: 1, behindBy: 1, mergeBaseSha: MAIN_0 });
    throw new Error('GitHub REST HTTP 409: Base branch was modified.');
  };
  const rAdv = await startBatch(cAdv, {
    owner: 'Bibleberry',
    repo: 'Bibleberry',
    entries: [{ prNumber: 371, expectedHeadSha: SHA_1, reviewCommentId: COMMENT_ID_1 }],
    authorizedBy: 'ContraPhilosophy',
  });
  assert.equal(rAdv.action, 'updating');
  assert.deepEqual(cAdv.updates, [{ prNumber: 371, expectedHeadSha: SHA_1 }]);

  // External manual merge outside merging stage stops instead of counting as verified batch completion.
  const cExt = new MockGitHubClient();
  const extEntries: BatchEntry[] = [{ prNumber: 371, expectedHeadSha: SHA_1, reviewCommentId: COMMENT_ID_1 }];
  cExt.state = {
    version: 2,
    revision: 2,
    batchId: 'batch-ext',
    stateChecksum: computeStateChecksum({
      owner: 'Bibleberry',
      repo: 'Bibleberry',
      entries: extEntries,
      integrationPolicy: 'integration-only',
      mergeMethod: 'squash',
    }),
    status: 'awaiting_checks',
    createdAt: '2026-11-27T18:00:00.000Z',
    updatedAt: '2026-11-27T18:01:00.000Z',
    authorizedBy: 'ContraPhilosophy',
    integrationPolicy: 'integration-only',
    mergeMethod: 'squash',
    entries: extEntries,
    nextIndex: 0,
    activePrNumber: 371,
    activeReviewedHeadSha: SHA_1,
    activeHeadSha: SHA_1,
    integrationUpdates: [],
    completedPrNumbers: [],
    completedMerges: [],
    nextAction: 'Waiting',
  };
  cExt.prs.set(371, makePr({ number: 371, headRefOid: SHA_1, state: 'MERGED', mergeCommit: { oid: MAIN_2 } }, COMMENT_ID_1));
  const rExt = await handlePullRequestClosed(cExt, { owner: 'Bibleberry', repo: 'Bibleberry', prNumber: 371, merged: true });
  assert.equal(rExt.action, 'stopped');
  assert.match(rExt.message, /unverified manual merge/);

  // Legacy v1 active batch preserved & safely aborted with dequeuePullRequest.
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

// ---------------------------------------------------------------------------
// 6. Workflow Trust Boundary, Environment Isolation, Manifest Upload & Wakeup
// ---------------------------------------------------------------------------

test('workflow enforces default-branch control plane, main-only runtime environment, immutable manifest upload, workflow_run wakeup, and zero untrusted interpolation', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/merge-queue-batch.yml', import.meta.url),
    'utf8',
  );

  assert.match(workflow, /^permissions: \{\}\s*$/m);
  assert.doesNotMatch(workflow, /^ {2}pull_request:/m);
  assert.doesNotMatch(workflow, /^ {2}check_suite:/m);
  assert.doesNotMatch(workflow, /^ {2}merge_group:/m);
  assert.match(workflow, /^ {2}pull_request_target:\s*\n(?:\s*#.*\n)*\s*types: \[closed, synchronize\]\s*\n\s*branches: \[main\]/m);
  assert.match(workflow, /^ {2}workflow_run:\s*\n/m);

  // Immutable start-run authorization manifest emitted & uploaded via SHA-pinned upload-artifact.
  assert.match(workflow, /scripts\/ci\/merge-queue-batch\.ts emit-manifest/);
  assert.match(workflow, /uses: actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(workflow, /name: copper-turnstile-auth-manifest-\$\{\{ github\.run_id \}\}/);

  // Never lists coordinator itself in workflow_run and never downloads untrusted PR workflow artifacts.
  const workflowRunSection = workflow.slice(workflow.indexOf('  workflow_run:'), workflow.indexOf('  schedule:'));
  assert.doesNotMatch(workflowRunSection, /Copper Turnstile|Merge Queue Batch/);
  assert.doesNotMatch(workflow, /download-artifact/i);

  // All 5 runtime jobs use main-only copper-turnstile-runtime; all 3 approval gates use zero-secret merge-queue-approval.
  assert.equal((workflow.match(/environment: copper-turnstile-runtime/g) ?? []).length, 5);
  assert.equal((workflow.match(/environment: merge-queue-approval/g) ?? []).length, 3);
  assert.equal((workflow.match(/uses: actions\/checkout@[0-9a-f]{40}/g) ?? []).length, 7);
  assert.equal((workflow.match(/ref: \$\{\{ github\.event\.repository\.default_branch \}\}/g) ?? []).length, 7);
  assert.equal((workflow.match(/persist-credentials: false/g) ?? []).length, 7);
  assert.equal((workflow.match(/uses: actions\/create-github-app-token@[0-9a-f]{40}/g) ?? []).length, 5);

  assert.doesNotMatch(workflow, /github\.event\.pull_request\.(?:title|body|head\.ref|head\.label)/);
  assert.doesNotMatch(workflow, /github\.event\.workflow_run\.(?:display_title|head_commit\.message)/);
});
