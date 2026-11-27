import { createHash } from 'node:crypto';

export const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;
export const DEFAULT_REQUIRED_CHECKS = [
  'Build reader application',
  'Verify Sanity Studio',
];
export const DEFAULT_AUTHORIZED_OWNERS = ['ContraPhilosophy'];
export const APPROVAL_ENVIRONMENT_NAME = 'merge-queue-approval';
export const DEFAULT_MERGE_METHOD: MergeMethod = 'squash';
export const DEFAULT_INTEGRATION_POLICY: IntegrationPolicy = 'hold-on-update';
export const DEFAULT_CHECK_TIMEOUT_MS = 90 * 60 * 1000;
export const DEFAULT_CHECK_STARTUP_GRACE_MS = 5 * 60 * 1000;
export const DEFAULT_UPDATE_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_MAX_INTEGRATION_UPDATES_PER_PR = 1;

export type MergeMethod = 'squash' | 'merge' | 'rebase';
export type IntegrationPolicy = 'hold-on-update' | 'integration-only';

export interface BatchEntry {
  prNumber: number;
  expectedHeadSha: string;
}

export interface StatusContextNode {
  __typename?: string;
  name?: string;
  status?: string;
  conclusion?: string | null;
  context?: string;
  state?: string;
  headSha?: string | null;
  completedAt?: string | null;
  startedAt?: string | null;
}

export interface PullRequestReviewNode {
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING' | string;
  author: { login: string } | null;
  commit: { oid: string } | null;
  submittedAt?: string | null;
}

export interface PullRequestSnapshot {
  id: string;
  number: number;
  url: string;
  title: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED' | string;
  isDraft: boolean;
  author?: { login: string } | null;
  baseRefName: string;
  baseRepository: { nameWithOwner: string } | null;
  headRefName?: string;
  headRefOid: string;
  headRepository?: { nameWithOwner: string } | null;
  isInMergeQueue: boolean;
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' | string;
  mergeStateStatus:
    | 'BEHIND'
    | 'BLOCKED'
    | 'CLEAN'
    | 'DIRTY'
    | 'DRAFT'
    | 'HAS_HOOKS'
    | 'UNKNOWN'
    | 'UNSTABLE'
    | string;
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null | string;
  mergeCommit?: { oid: string } | null;
  mergedAt?: string | null;
  mergedBy?: { login: string } | null;
  latestReviews?: {
    nodes: PullRequestReviewNode[];
  };
  reviewThreads: {
    totalCount?: number;
    pageInfo?: { hasNextPage: boolean };
    nodes: Array<{ isResolved: boolean }>;
  };
  statusCheckRollup: {
    state: 'ERROR' | 'EXPECTED' | 'FAILURE' | 'PENDING' | 'SUCCESS' | string;
    contexts: {
      pageInfo?: { hasNextPage: boolean };
      nodes: StatusContextNode[];
    };
  } | null;
}

export interface RepositoryPolicy {
  defaultBranch: string;
  allowSquashMerge: boolean;
  allowMergeCommit: boolean;
  allowRebaseMerge: boolean;
  allowAutoMerge?: boolean;
  allowUpdateBranch?: boolean;
  protectionAccessible: boolean;
  strictStatusChecks?: boolean;
  requiredStatusChecks?: string[];
  requiredApprovingReviewCount?: number;
  dismissStaleReviews?: boolean;
  requiredConversationResolution?: boolean;
  enforceAdmins?: boolean;
}

export interface CommitDetails {
  sha: string;
  parents: string[];
  message: string;
  authorLogin?: string | null;
  committerLogin?: string | null;
}

export interface CommitComparisonFile {
  filename: string;
  status: string;
  sha?: string;
  previousFilename?: string;
}

export interface CommitComparison {
  status: 'ahead' | 'behind' | 'diverged' | 'identical' | string;
  aheadBy: number;
  behindBy: number;
  mergeBaseSha: string;
  totalCommits?: number;
  files?: CommitComparisonFile[];
}

export interface VerificationEvidence {
  prNumber: number;
  candidateHeadSha: string;
  observedBaseSha?: string;
  evaluatedAt: string;
  verdict: 'passed' | 'pending' | 'failed' | 'timed_out';
  protectionReadAccess: 'verified' | 'inaccessible';
  requiredChecks: string[];
  passingChecks: string[];
  pendingChecks: string[];
  failingChecks: string[];
  canceledChecks: string[];
  staleChecks: string[];
  skippedOnlyChecks: string[];
  missingChecks: string[];
  reasons: string[];
}

export interface IntegrationUpdateRecord {
  prNumber: number;
  fromHeadSha: string;
  toHeadSha: string;
  mergedBaseSha: string;
  mergeBaseSha: string;
  requestedAt: string;
  verifiedAt: string;
  overlappingFiles: string[];
  provenanceVerified: boolean;
}

export interface CompletedMergeRecord {
  prNumber: number;
  reviewedHeadSha: string;
  mergedHeadSha: string;
  mergeCommitSha: string;
  mergedAt: string;
  mergeMethod: MergeMethod;
  viaIntegrationUpdate: boolean;
}

export interface PendingOperation {
  type: 'update-branch' | 'merge';
  prNumber: number;
  expectedHeadSha: string;
  observedMainSha: string;
  startedAt: string;
}

export interface PreflightResult {
  ok: boolean;
  entry: BatchEntry;
  reasons: string[];
  pr?: PullRequestSnapshot;
  verification?: VerificationEvidence;
  behindMain?: boolean;
}

export type BatchStatusV2 =
  | 'running'
  | 'updating'
  | 'awaiting_checks'
  | 'merging'
  | 'held'
  | 'completed'
  | 'stopped'
  | 'aborted';

/**
 * Legacy v1 schema from PR #203 (native merge-queue coordinator).
 * Preserved so an unresolved active legacy batch is never silently discarded.
 */
export interface LegacyBatchStateV1 {
  version: 1;
  revision?: number;
  batchId: string;
  status: 'enqueuing' | 'running' | 'completed' | 'stopped' | 'aborted';
  createdAt: string;
  updatedAt: string;
  authorizedBy: string;
  abortRequestedBy?: string;
  workflowRunId?: string;
  workflowRunUrl?: string;
  entries: BatchEntry[];
  nextIndex: number;
  activePrNumber: number | null;
  activeHeadSha: string | null;
  completedPrNumbers: number[];
  stopReason?: string;
}

export interface BatchState {
  version: 2;
  revision: number;
  batchId: string;
  authorizationDigest: string;
  status: BatchStatusV2;
  createdAt: string;
  updatedAt: string;
  authorizedBy: string;
  approvedBy?: string;
  integrationPolicy: IntegrationPolicy;
  mergeMethod: MergeMethod;
  abortRequestedBy?: string;
  abortReason?: string;
  workflowRunId?: string;
  workflowRunUrl?: string;
  entries: BatchEntry[];
  nextIndex: number;
  activePrNumber: number | null;
  activeReviewedHeadSha: string | null;
  activeHeadSha: string | null;
  observedMainSha?: string;
  pendingOperation?: PendingOperation | null;
  awaitingChecksSince?: string | null;
  integrationUpdates: IntegrationUpdateRecord[];
  lastVerification?: VerificationEvidence | null;
  completedPrNumbers: number[];
  completedMerges: CompletedMergeRecord[];
  nextAction: string;
  holdReason?: string;
  stopReason?: string;
}

export type StoredBatchState = BatchState | LegacyBatchStateV1;

export interface ApprovalVerificationResult {
  ok: boolean;
  reason?: string;
  approvedBy?: string;
}

export interface GitHubBatchClient {
  getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequestSnapshot | null>;
  getBranchHeadSha(owner: string, repo: string, branch: string): Promise<string>;
  getRepositoryPolicy(owner: string, repo: string): Promise<RepositoryPolicy>;
  getCommit(owner: string, repo: string, sha: string): Promise<CommitDetails>;
  compareCommits(owner: string, repo: string, base: string, head: string): Promise<CommitComparison>;
  updatePullRequestBranch(
    owner: string,
    repo: string,
    prNumber: number,
    expectedHeadSha: string,
  ): Promise<{ message?: string; url?: string }>;
  mergePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    expectedHeadSha: string,
    mergeMethod: MergeMethod,
  ): Promise<{ sha: string; merged: boolean; message: string }>;
  dequeuePullRequest?(pullRequestId: string): Promise<void>;
  getBatchState(owner: string, repo: string): Promise<StoredBatchState | null>;
  saveBatchState(owner: string, repo: string, state: StoredBatchState): Promise<void>;
  verifyWorkflowApproval?(
    owner: string,
    repo: string,
    runId: string,
    environmentName: string,
    authorizedOwners: string[],
  ): Promise<ApprovalVerificationResult>;
}

export function isLegacyBatchState(state: StoredBatchState | null): state is LegacyBatchStateV1 {
  return Boolean(state && state.version === 1);
}

export function isActiveBatchStatus(state: StoredBatchState | null): boolean {
  if (!state) return false;
  if (isLegacyBatchState(state)) {
    return state.status === 'running' || state.status === 'enqueuing';
  }
  return (
    state.status === 'running' ||
    state.status === 'updating' ||
    state.status === 'awaiting_checks' ||
    state.status === 'merging' ||
    state.status === 'held'
  );
}

/**
 * Computes a deterministic authorization digest binding the exact ordered batch entries,
 * repository, integration policy, and merge method so state cannot be tampered with to
 * substitute PRs, SHAs, or policies across workflow runs.
 */
export function computeAuthorizationDigest(params: {
  owner: string;
  repo: string;
  entries: BatchEntry[];
  integrationPolicy: IntegrationPolicy;
  mergeMethod: MergeMethod;
}): string {
  const canonical = JSON.stringify({
    owner: params.owner.toLowerCase(),
    repo: params.repo.toLowerCase(),
    integrationPolicy: params.integrationPolicy,
    mergeMethod: params.mergeMethod,
    entries: params.entries.map((e) => ({
      prNumber: e.prNumber,
      expectedHeadSha: e.expectedHeadSha.toLowerCase(),
    })),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Parses an ordered list of `PR_NUMBER@REVIEWED_HEAD_SHA` entries.
 * Accepts comma, whitespace, or newline separators.
 */
export function parseBatchEntries(raw: string): BatchEntry[] {
  const tokens = raw
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error('Batch entries list is empty. Provide one or more PR_NUMBER@REVIEWED_HEAD_SHA entries.');
  }

  const seenPrs = new Set<number>();
  const entries: BatchEntry[] = [];

  for (const token of tokens) {
    const parts = token.split('@');
    if (parts.length !== 2) {
      throw new Error(`Invalid batch entry "${token}". Expected format PR_NUMBER@REVIEWED_HEAD_SHA.`);
    }

    const [rawPr, rawSha] = parts;
    if (!/^[1-9]\d*$/.test(rawPr)) {
      throw new Error(`Invalid PR number in entry "${token}". PR number must be a positive integer.`);
    }
    const prNumber = Number(rawPr);

    if (!FULL_SHA_PATTERN.test(rawSha)) {
      throw new Error(
        `Invalid head SHA in entry "${token}". Provide the full 40-character hexadecimal commit SHA.`,
      );
    }

    if (seenPrs.has(prNumber)) {
      throw new Error(`Duplicate PR #${prNumber} in batch entries. Each PR may appear at most once.`);
    }
    seenPrs.add(prNumber);

    entries.push({
      prNumber,
      expectedHeadSha: rawSha.toLowerCase(),
    });
  }

  return entries;
}

export function validateMergeMethod(
  method: string,
  policy: RepositoryPolicy,
): { ok: boolean; mergeMethod?: MergeMethod; reason?: string } {
  const normalized = method.trim().toLowerCase();
  if (normalized !== 'squash' && normalized !== 'merge' && normalized !== 'rebase') {
    return {
      ok: false,
      reason: `Unsupported merge method "${method}". Allowed values: squash, merge, rebase.`,
    };
  }
  if (normalized === 'squash' && !policy.allowSquashMerge) {
    return { ok: false, reason: 'Repository settings disallow squash merging (allow_squash_merge=false).' };
  }
  if (normalized === 'merge' && !policy.allowMergeCommit) {
    return { ok: false, reason: 'Repository settings disallow merge commits (allow_merge_commit=false).' };
  }
  if (normalized === 'rebase' && !policy.allowRebaseMerge) {
    return { ok: false, reason: 'Repository settings disallow rebase merging (allow_rebase_merge=false).' };
  }
  return { ok: true, mergeMethod: normalized };
}

export function resolveEffectiveRequiredChecks(
  policy: RepositoryPolicy | null | undefined,
  configuredChecks: string[] = DEFAULT_REQUIRED_CHECKS,
): string[] {
  const combined = new Set<string>(configuredChecks);
  if (policy?.protectionAccessible && policy.requiredStatusChecks) {
    for (const check of policy.requiredStatusChecks) {
      if (check.trim()) {
        combined.add(check.trim());
      }
    }
  }
  return [...combined];
}

const PENDING_CHECK_STATUSES = new Set(['QUEUED', 'IN_PROGRESS', 'WAITING', 'PENDING', 'REQUESTED']);
const FAILED_CHECK_CONCLUSIONS = new Set([
  'FAILURE',
  'TIMED_OUT',
  'ACTION_REQUIRED',
  'STARTUP_FAILURE',
]);

type ClassifiedCheckState =
  | 'passed'
  | 'pending'
  | 'failed'
  | 'canceled'
  | 'stale'
  | 'skipped'
  | 'neutral';

function classifyNode(node: StatusContextNode): ClassifiedCheckState {
  if (node.__typename === 'StatusContext' || (!node.name && node.context)) {
    const st = (node.state ?? '').toUpperCase();
    if (st === 'SUCCESS') return 'passed';
    if (st === 'PENDING' || st === 'EXPECTED') return 'pending';
    return 'failed';
  }

  const status = (node.status ?? '').toUpperCase();
  if (PENDING_CHECK_STATUSES.has(status) || status !== 'COMPLETED') {
    return 'pending';
  }

  const conclusion = (node.conclusion ?? '').toUpperCase();
  if (conclusion === 'SUCCESS') return 'passed';
  if (conclusion === 'NEUTRAL') return 'neutral';
  if (conclusion === 'SKIPPED') return 'skipped';
  if (conclusion === 'CANCELLED') return 'canceled';
  if (conclusion === 'STALE') return 'stale';
  if (FAILED_CHECK_CONCLUSIONS.has(conclusion)) return 'failed';
  return 'failed';
}

function getContextName(node: StatusContextNode): string {
  return (node.__typename === 'StatusContext' || (!node.name && node.context)
    ? node.context
    : node.name) ?? '(unnamed check)';
}

function getContextTimestamp(node: StatusContextNode): number {
  const raw = node.completedAt || node.startedAt;
  if (!raw) return Number.NaN;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

/**
 * Evaluates all check runs and commit statuses for a candidate commit.
 * Explicitly distinguishes successful execution from pending, failed, canceled,
 * stale, skipped-only, and missing checks, and binds checks to candidateHeadSha.
 */
export function evaluateCheckVerification(options: {
  pr: PullRequestSnapshot;
  candidateHeadSha: string;
  observedBaseSha?: string;
  requiredChecks: string[];
  protectionAccessible: boolean;
  allowStartupGrace?: boolean;
  now?: () => string;
}): VerificationEvidence {
  const {
    pr,
    candidateHeadSha,
    observedBaseSha,
    requiredChecks,
    protectionAccessible,
    allowStartupGrace = false,
    now = () => new Date().toISOString(),
  } = options;

  const evaluatedAt = now();
  const passingChecks: string[] = [];
  const pendingChecks: string[] = [];
  const failingChecks: string[] = [];
  const canceledChecks: string[] = [];
  const staleChecks: string[] = [];
  const skippedOnlyChecks: string[] = [];
  const missingChecks: string[] = [];
  const reasons: string[] = [];

  if (!pr.statusCheckRollup) {
    missingChecks.push(...requiredChecks);
    if (allowStartupGrace) {
      reasons.push(`PR #${pr.number}@${candidateHeadSha.slice(0, 12)} has no status checks reported yet; awaiting CI startup.`);
      return {
        prNumber: pr.number,
        candidateHeadSha,
        observedBaseSha,
        evaluatedAt,
        verdict: 'pending',
        protectionReadAccess: protectionAccessible ? 'verified' : 'inaccessible',
        requiredChecks,
        passingChecks,
        pendingChecks,
        failingChecks,
        canceledChecks,
        staleChecks,
        skippedOnlyChecks,
        missingChecks,
        reasons,
      };
    }
    reasons.push(`PR #${pr.number} has no status checks reported for ${candidateHeadSha.slice(0, 12)}.`);
    return {
      prNumber: pr.number,
      candidateHeadSha,
      observedBaseSha,
      evaluatedAt,
      verdict: 'failed',
      protectionReadAccess: protectionAccessible ? 'verified' : 'inaccessible',
      requiredChecks,
      passingChecks,
      pendingChecks,
      failingChecks,
      canceledChecks,
      staleChecks,
      skippedOnlyChecks,
      missingChecks,
      reasons,
    };
  }

  if (pr.statusCheckRollup.contexts.pageInfo?.hasNextPage) {
    reasons.push(
      `PR #${pr.number} statusCheckRollup contexts are truncated (>100); cannot verify all checks safely.`,
    );
    return {
      prNumber: pr.number,
      candidateHeadSha,
      observedBaseSha,
      evaluatedAt,
      verdict: 'failed',
      protectionReadAccess: protectionAccessible ? 'verified' : 'inaccessible',
      requiredChecks,
      passingChecks,
      pendingChecks,
      failingChecks,
      canceledChecks,
      staleChecks,
      skippedOnlyChecks,
      missingChecks,
      reasons,
    };
  }

  const requiredSet = new Set(requiredChecks);
  const grouped = new Map<string, StatusContextNode[]>();

  for (const node of pr.statusCheckRollup.contexts.nodes) {
    const name = getContextName(node);
    const list = grouped.get(name) ?? [];
    list.push(node);
    grouped.set(name, list);
  }

  for (const [name, nodes] of grouped.entries()) {
    const mismatchedShaNodes = nodes.filter(
      (n) => n.headSha && n.headSha.toLowerCase() !== candidateHeadSha.toLowerCase(),
    );
    const matchingNodes = nodes.filter(
      (n) => !n.headSha || n.headSha.toLowerCase() === candidateHeadSha.toLowerCase(),
    );

    if (matchingNodes.length === 0 && mismatchedShaNodes.length > 0) {
      staleChecks.push(name);
      reasons.push(
        `Check "${name}" only has stale evidence from a different commit (${mismatchedShaNodes[0].headSha?.slice(0, 12)}), not ${candidateHeadSha.slice(0, 12)}.`,
      );
      continue;
    }

    const withOrder = matchingNodes.map((node, index) => ({
      node,
      index,
      ts: getContextTimestamp(node),
    }));
    const hasAllTimestamps = withOrder.every((item) => !Number.isNaN(item.ts));
    if (hasAllTimestamps) {
      withOrder.sort((a, b) => (a.ts === b.ts ? a.index - b.index : a.ts - b.ts));
    }

    const latest = withOrder[withOrder.length - 1].node;
    const latestState = classifyNode(latest);
    const allStates = withOrder.map((w) => classifyNode(w.node));

    if (latestState === 'pending') {
      pendingChecks.push(name);
      reasons.push(`Check "${name}" is still pending on ${candidateHeadSha.slice(0, 12)}.`);
    } else if (latestState === 'failed') {
      failingChecks.push(name);
      reasons.push(`Check "${name}" failed on ${candidateHeadSha.slice(0, 12)}.`);
    } else if (latestState === 'canceled') {
      canceledChecks.push(name);
      reasons.push(`Check "${name}" was canceled on ${candidateHeadSha.slice(0, 12)}.`);
    } else if (latestState === 'stale') {
      staleChecks.push(name);
      reasons.push(`Check "${name}" is marked STALE on ${candidateHeadSha.slice(0, 12)}.`);
    } else if (latestState === 'skipped') {
      if (requiredSet.has(name)) {
        const hasPassingExecution = allStates.some((st) => st === 'passed');
        if (hasPassingExecution) {
          passingChecks.push(name);
        } else {
          skippedOnlyChecks.push(name);
          reasons.push(
            `Required check "${name}" only has SKIPPED runs and no passing execution on ${candidateHeadSha.slice(0, 12)}.`,
          );
        }
      }
    } else if (latestState === 'neutral') {
      if (requiredSet.has(name)) {
        // Required checks must record an actual SUCCESS execution.
        failingChecks.push(name);
        reasons.push(`Required check "${name}" concluded NEUTRAL instead of SUCCESS.`);
      } else {
        passingChecks.push(name);
      }
    } else if (latestState === 'passed') {
      passingChecks.push(name);
    }
  }

  for (const req of requiredChecks) {
    if (!grouped.has(req)) {
      missingChecks.push(req);
      reasons.push(`Required check "${req}" is missing on ${candidateHeadSha.slice(0, 12)}.`);
    }
  }

  const rollupState = (pr.statusCheckRollup.state ?? '').toUpperCase();

  let verdict: VerificationEvidence['verdict'];
  if (failingChecks.length > 0 || canceledChecks.length > 0 || staleChecks.length > 0) {
    verdict = 'failed';
  } else if (skippedOnlyChecks.length > 0) {
    verdict = 'failed';
  } else if (pendingChecks.length > 0) {
    verdict = 'pending';
  } else if (missingChecks.length > 0) {
    verdict = allowStartupGrace ? 'pending' : 'failed';
  } else if (rollupState === 'PENDING' || rollupState === 'EXPECTED') {
    reasons.push(`PR #${pr.number} statusCheckRollup state is ${rollupState}; waiting for checks to finish.`);
    verdict = 'pending';
  } else if (rollupState !== 'SUCCESS') {
    reasons.push(`PR #${pr.number} statusCheckRollup state is ${rollupState}, expected SUCCESS.`);
    verdict = 'failed';
  } else {
    verdict = 'passed';
  }

  return {
    prNumber: pr.number,
    candidateHeadSha,
    observedBaseSha,
    evaluatedAt,
    verdict,
    protectionReadAccess: protectionAccessible ? 'verified' : 'inaccessible',
    requiredChecks,
    passingChecks,
    pendingChecks,
    failingChecks,
    canceledChecks,
    staleChecks,
    skippedOnlyChecks,
    missingChecks,
    reasons,
  };
}

/**
 * Evaluates review, unresolved-conversation, and stale/self-review eligibility
 * for a specific candidate HEAD SHA.
 */
export function evaluateReviewEligibility(options: {
  pr: PullRequestSnapshot;
  candidateHeadSha: string;
  policy?: RepositoryPolicy | null;
}): string[] {
  const { pr, candidateHeadSha, policy } = options;
  const reasons: string[] = [];

  if (pr.reviewDecision === 'CHANGES_REQUESTED') {
    reasons.push(`PR #${pr.number} has requested changes (reviewDecision=CHANGES_REQUESTED).`);
  } else if (pr.reviewDecision === 'REVIEW_REQUIRED') {
    reasons.push(`PR #${pr.number} requires an approving review (reviewDecision=REVIEW_REQUIRED).`);
  }

  const latestReviews = pr.latestReviews?.nodes ?? [];
  const activeChangesRequested = latestReviews.filter((r) => r.state === 'CHANGES_REQUESTED');
  if (activeChangesRequested.length > 0 && pr.reviewDecision !== 'CHANGES_REQUESTED') {
    const reviewers = activeChangesRequested.map((r) => r.author?.login ?? 'unknown').join(', ');
    reasons.push(`PR #${pr.number} has active CHANGES_REQUESTED review(s) from [${reviewers}].`);
  }

  const prAuthor = pr.author?.login?.toLowerCase() ?? '';
  const approvedReviews = latestReviews.filter((r) => r.state === 'APPROVED');
  const independentApproved = approvedReviews.filter(
    (r) => !prAuthor || (r.author?.login?.toLowerCase() ?? '') !== prAuthor,
  );
  const currentHeadApproved = independentApproved.filter(
    (r) => !r.commit?.oid || r.commit.oid.toLowerCase() === candidateHeadSha.toLowerCase(),
  );
  const staleApproved = independentApproved.filter(
    (r) => r.commit?.oid && r.commit.oid.toLowerCase() !== candidateHeadSha.toLowerCase(),
  );

  const requiredApprovalCount = policy?.requiredApprovingReviewCount ?? 0;
  if (requiredApprovalCount > 0) {
    if (currentHeadApproved.length < requiredApprovalCount) {
      if (staleApproved.length > 0) {
        reasons.push(
          `PR #${pr.number} approving review is stale (bound to ${staleApproved[0].commit?.oid?.slice(0, 12)}, not current HEAD ${candidateHeadSha.slice(0, 12)}).`,
        );
      } else if (approvedReviews.length > 0 && independentApproved.length === 0) {
        reasons.push(`PR #${pr.number} only has self-approval by PR author; independent approving review is required.`);
      } else {
        reasons.push(
          `PR #${pr.number} has ${currentHeadApproved.length}/${requiredApprovalCount} required independent approving review(s) on HEAD ${candidateHeadSha.slice(0, 12)}.`,
        );
      }
    }
  } else if (approvedReviews.length > 0) {
    if (independentApproved.length === 0) {
      reasons.push(`PR #${pr.number} has an invalid self-approval by PR author.`);
    } else if (currentHeadApproved.length === 0 && staleApproved.length > 0) {
      reasons.push(
        `PR #${pr.number} approving review is stale (bound to older commit ${staleApproved[0].commit?.oid?.slice(0, 12)}, not current HEAD ${candidateHeadSha.slice(0, 12)}).`,
      );
    }
  }

  const unresolvedCount = pr.reviewThreads.nodes.filter((thread) => !thread.isResolved).length;
  if (unresolvedCount > 0) {
    reasons.push(`PR #${pr.number} has ${unresolvedCount} unresolved review conversation(s).`);
  } else if (pr.reviewThreads.pageInfo?.hasNextPage) {
    reasons.push(
      `PR #${pr.number} has more than ${pr.reviewThreads.nodes.length} review threads; cannot verify all are resolved.`,
    );
  }

  return reasons;
}

/**
 * Evaluates whether a pull request satisfies all preflight policy, revision, review,
 * and verification requirements. Branch-out-of-date alone (`mergeStateStatus === 'BEHIND'`
 * with `mergeable === 'MERGEABLE'`) is allowed during preflight so the active PR can be
 * updated via GitHub's supported update-branch API when its turn arrives.
 */
export function evaluatePullRequestPreflight(
  pr: PullRequestSnapshot | null,
  entry: BatchEntry,
  expectedRepo: string,
  requiredChecks: string[] = DEFAULT_REQUIRED_CHECKS,
  options?: {
    policy?: RepositoryPolicy | null;
    observedBaseSha?: string;
    expectedHeadOverride?: string;
    allowPendingChecks?: boolean;
    now?: () => string;
  },
): PreflightResult {
  const reasons: string[] = [];
  const expectedSha = (options?.expectedHeadOverride ?? entry.expectedHeadSha).toLowerCase();

  if (!pr) {
    return {
      ok: false,
      entry,
      reasons: [`PR #${entry.prNumber} was not found in ${expectedRepo}.`],
    };
  }

  if (pr.baseRepository?.nameWithOwner.toLowerCase() !== expectedRepo.toLowerCase()) {
    reasons.push(
      `PR #${entry.prNumber} targets repository "${pr.baseRepository?.nameWithOwner ?? 'unknown'}" instead of "${expectedRepo}".`,
    );
  }

  if (pr.baseRefName !== 'main') {
    reasons.push(`PR #${entry.prNumber} targets base branch "${pr.baseRefName}" instead of "main".`);
  }

  if (pr.state !== 'OPEN') {
    reasons.push(`PR #${entry.prNumber} is ${pr.state}, expected OPEN.`);
  }

  if (pr.isDraft) {
    reasons.push(`PR #${entry.prNumber} is still a Draft PR; promote it Ready for Review before authorizing.`);
  }

  if (pr.headRefOid.toLowerCase() !== expectedSha) {
    reasons.push(
      `PR #${entry.prNumber} head SHA is ${pr.headRefOid}, which does not match authorized SHA ${expectedSha}.`,
    );
  }

  if (pr.isInMergeQueue) {
    reasons.push(`PR #${entry.prNumber} is already in a native merge queue.`);
  }

  if (pr.mergeable === 'CONFLICTING' || pr.mergeStateStatus === 'DIRTY') {
    reasons.push(
      `PR #${entry.prNumber} has merge conflicts (${pr.mergeable}/${pr.mergeStateStatus}) and must be resolved.`,
    );
  } else if (pr.mergeable === 'UNKNOWN') {
    reasons.push(`PR #${entry.prNumber} mergeability is UNKNOWN; wait for GitHub to finish computing mergeability.`);
  }

  const reviewReasons = evaluateReviewEligibility({
    pr,
    candidateHeadSha: expectedSha,
    policy: options?.policy,
  });
  reasons.push(...reviewReasons);

  const effectiveRequired = resolveEffectiveRequiredChecks(options?.policy, requiredChecks);
  const verification = evaluateCheckVerification({
    pr,
    candidateHeadSha: expectedSha,
    observedBaseSha: options?.observedBaseSha,
    requiredChecks: effectiveRequired,
    protectionAccessible: options?.policy?.protectionAccessible ?? false,
    allowStartupGrace: false,
    now: options?.now,
  });

  if (verification.verdict === 'failed') {
    reasons.push(...verification.reasons);
  } else if (verification.verdict === 'pending' && !options?.allowPendingChecks) {
    reasons.push(...verification.reasons);
  }

  return {
    ok: reasons.length === 0,
    entry,
    reasons,
    pr,
    verification,
    behindMain: pr.mergeStateStatus === 'BEHIND',
  };
}

export async function runPreflight(
  client: GitHubBatchClient,
  owner: string,
  repo: string,
  entries: BatchEntry[],
  requiredChecks: string[] = DEFAULT_REQUIRED_CHECKS,
  options?: {
    mergeMethod?: string;
    now?: () => string;
  },
): Promise<{
  ok: boolean;
  results: PreflightResult[];
  observedMainSha: string;
  policy: RepositoryPolicy;
  policyError?: string;
}> {
  const expectedRepo = `${owner}/${repo}`;
  const [observedMainSha, policy] = await Promise.all([
    client.getBranchHeadSha(owner, repo, 'main'),
    client.getRepositoryPolicy(owner, repo),
  ]);

  const methodCheck = validateMergeMethod(options?.mergeMethod ?? DEFAULT_MERGE_METHOD, policy);
  const results: PreflightResult[] = [];

  for (const entry of entries) {
    const pr = await client.getPullRequest(owner, repo, entry.prNumber);
    results.push(
      evaluatePullRequestPreflight(pr, entry, expectedRepo, requiredChecks, {
        policy,
        observedBaseSha: observedMainSha,
        now: options?.now,
      }),
    );
  }

  return {
    ok: methodCheck.ok && results.every((r) => r.ok),
    results,
    observedMainSha,
    policy,
    policyError: methodCheck.ok ? undefined : methodCheck.reason,
  };
}

export interface ProvenanceVerificationResult {
  ok: boolean;
  reason?: string;
  record?: IntegrationUpdateRecord;
}

function toFileMap(files: CommitComparisonFile[] | undefined): Map<string, CommitComparisonFile> {
  const map = new Map<string, CommitComparisonFile>();
  if (!files) return map;
  for (const f of files) {
    map.set(f.filename, f);
  }
  return map;
}

/**
 * Verifies that a post-update PR HEAD commit is strictly a clean, two-parent
 * main-into-PR integration merge commit with no rewritten history, extra commits,
 * unauthorized source edits, or unexpected tree mutations.
 */
export async function verifyIntegrationUpdateProvenance(
  client: GitHubBatchClient,
  options: {
    owner: string;
    repo: string;
    prNumber: number;
    previousHeadSha: string;
    newHeadSha: string;
    expectedBaseSha: string;
    currentMainSha: string;
    requestedAt: string;
    now?: () => string;
  },
): Promise<ProvenanceVerificationResult> {
  const {
    owner,
    repo,
    prNumber,
    previousHeadSha,
    newHeadSha,
    expectedBaseSha,
    currentMainSha,
    requestedAt,
    now = () => new Date().toISOString(),
  } = options;

  const commit = await client.getCommit(owner, repo, newHeadSha);
  if (commit.parents.length !== 2) {
    return {
      ok: false,
      reason: `PR #${prNumber} updated commit ${newHeadSha.slice(0, 12)} has ${commit.parents.length} parent(s); expected a 2-parent merge commit from update-branch.`,
    };
  }

  const [parentPrSha, parentBaseSha] = commit.parents.map((p) => p.toLowerCase());
  if (parentPrSha !== previousHeadSha.toLowerCase()) {
    return {
      ok: false,
      reason: `PR #${prNumber} updated commit ${newHeadSha.slice(0, 12)} first parent is ${parentPrSha.slice(0, 12)}, expected previous authorized HEAD ${previousHeadSha.slice(0, 12)} (history rewritten or extra commits detected).`,
    };
  }

  const normalizedExpectedBase = expectedBaseSha.toLowerCase();
  const normalizedCurrentMain = currentMainSha.toLowerCase();
  if (parentBaseSha !== normalizedExpectedBase && parentBaseSha !== normalizedCurrentMain) {
    // Verify parentBaseSha is an accepted ancestor of current main.
    const ancestry = await client.compareCommits(owner, repo, parentBaseSha, normalizedCurrentMain);
    if (ancestry.behindBy !== 0 || (ancestry.status !== 'ahead' && ancestry.status !== 'identical')) {
      return {
        ok: false,
        reason: `PR #${prNumber} updated commit ${newHeadSha.slice(0, 12)} second parent ${parentBaseSha.slice(0, 12)} is not an accepted commit on main (${normalizedCurrentMain.slice(0, 12)}).`,
      };
    }
  }

  // Verify the single-commit history delta from previousHeadSha to newHeadSha has no extra PR commits.
  const baseToPr = await client.compareCommits(owner, repo, parentBaseSha, parentPrSha);
  const mergeBaseSha = baseToPr.mergeBaseSha.toLowerCase();
  if (!FULL_SHA_PATTERN.test(mergeBaseSha)) {
    return {
      ok: false,
      reason: `Unable to establish merge-base between main@${parentBaseSha.slice(0, 12)} and PR@${parentPrSha.slice(0, 12)}.`,
    };
  }

  const [mergeBaseToPr, mergeBaseToMain, prToNewHead, mainToNewHead] = await Promise.all([
    client.compareCommits(owner, repo, mergeBaseSha, parentPrSha),
    client.compareCommits(owner, repo, mergeBaseSha, parentBaseSha),
    client.compareCommits(owner, repo, parentPrSha, newHeadSha),
    client.compareCommits(owner, repo, parentBaseSha, newHeadSha),
  ]);

  const prFiles = toFileMap(mergeBaseToPr.files);
  const mainFiles = toFileMap(mergeBaseToMain.files);
  const deltaFromPr = toFileMap(prToNewHead.files);
  const deltaFromMain = toFileMap(mainToNewHead.files);

  const overlappingFiles: string[] = [];
  for (const filename of prFiles.keys()) {
    if (mainFiles.has(filename)) {
      overlappingFiles.push(filename);
    }
  }
  const overlappingSet = new Set(overlappingFiles);

  // Every file changed between previous PR HEAD and new HEAD must have been changed by main.
  for (const [filename, changed] of deltaFromPr.entries()) {
    const mainFile = mainFiles.get(filename);
    if (!mainFile) {
      return {
        ok: false,
        reason: `PR #${prNumber} integration commit ${newHeadSha.slice(0, 12)} modified "${filename}", which was not changed on main between ${mergeBaseSha.slice(0, 12)} and ${parentBaseSha.slice(0, 12)}.`,
      };
    }
    if (!overlappingSet.has(filename) && changed.sha && mainFile.sha && changed.sha !== mainFile.sha) {
      return {
        ok: false,
        reason: `PR #${prNumber} integration commit ${newHeadSha.slice(0, 12)} has unexpected blob SHA for non-overlapping file "${filename}" (does not match accepted main).`,
      };
    }
  }

  // Every file changed between main and new HEAD must belong to the reviewed PR's file set.
  for (const [filename, changed] of deltaFromMain.entries()) {
    const prFile = prFiles.get(filename);
    if (!prFile) {
      return {
        ok: false,
        reason: `PR #${prNumber} integration commit ${newHeadSha.slice(0, 12)} introduced unexpected file "${filename}" relative to main that was not part of reviewed HEAD ${parentPrSha.slice(0, 12)}.`,
      };
    }
    if (!overlappingSet.has(filename) && changed.sha && prFile.sha && changed.sha !== prFile.sha) {
      return {
        ok: false,
        reason: `PR #${prNumber} integration commit ${newHeadSha.slice(0, 12)} altered reviewed PR file "${filename}" (blob SHA mismatch against reviewed HEAD ${parentPrSha.slice(0, 12)}).`,
      };
    }
  }

  return {
    ok: true,
    record: {
      prNumber,
      fromHeadSha: parentPrSha,
      toHeadSha: newHeadSha.toLowerCase(),
      mergedBaseSha: parentBaseSha,
      mergeBaseSha,
      requestedAt,
      verifiedAt: now(),
      overlappingFiles: overlappingFiles.sort(),
      provenanceVerified: true,
    },
  };
}

async function verifyOwnerAuthorization(
  client: GitHubBatchClient,
  options: {
    owner: string;
    repo: string;
    actor: string;
    workflowRunId?: string;
    authorizedOwners?: string[];
  },
): Promise<{ ok: boolean; reason?: string; approvedBy?: string }> {
  const authorizedOwners = options.authorizedOwners ?? DEFAULT_AUTHORIZED_OWNERS;
  const normalizedAllowed = new Set(authorizedOwners.map((u) => u.toLowerCase()));

  if (!normalizedAllowed.has(options.actor.toLowerCase())) {
    return {
      ok: false,
      reason: `Actor "${options.actor}" is not in authorized owners [${authorizedOwners.join(', ')}].`,
    };
  }

  if (options.workflowRunId) {
    if (!client.verifyWorkflowApproval) {
      return {
        ok: false,
        reason: 'Fail-closed approval check is unavailable for workflow run verification.',
      };
    }
    const approval = await client.verifyWorkflowApproval(
      options.owner,
      options.repo,
      options.workflowRunId,
      APPROVAL_ENVIRONMENT_NAME,
      authorizedOwners,
    );
    if (!approval.ok) {
      return {
        ok: false,
        reason: approval.reason ?? `Missing verified ${APPROVAL_ENVIRONMENT_NAME} owner approval.`,
      };
    }
    return { ok: true, approvedBy: approval.approvedBy };
  }

  return { ok: true, approvedBy: options.actor };
}

export interface RuntimePolicyOptions {
  requiredChecks?: string[];
  authorizedOwners?: string[];
  allowIntegrationOnlyPolicy?: boolean;
  maxIntegrationUpdatesPerPr?: number;
  checkTimeoutMs?: number;
  checkStartupGraceMs?: number;
  updateTimeoutMs?: number;
  now?: () => string;
}

export interface StartBatchOptions extends RuntimePolicyOptions {
  owner: string;
  repo: string;
  entries: BatchEntry[];
  authorizedBy: string;
  dryRun?: boolean;
  mergeMethod?: string;
  integrationPolicy?: IntegrationPolicy;
  workflowRunId?: string;
  workflowRunUrl?: string;
}

export interface StartBatchOutcome {
  ok: boolean;
  dryRun: boolean;
  action: 'dry-run' | 'merged' | 'updating' | 'awaiting_checks' | 'held' | 'completed' | 'stopped';
  preflightResults: PreflightResult[];
  state?: StoredBatchState;
  error?: string;
  message?: string;
}

export interface AdvanceOutcome {
  action: 'ignored' | 'merged' | 'updating' | 'awaiting_checks' | 'waiting' | 'held' | 'completed' | 'stopped' | 'reconciled';
  state: StoredBatchState | null;
  message: string;
  preflightResult?: PreflightResult;
}

function isDefinitiveApiRejection(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /GitHub (?:REST|GraphQL) HTTP 4(?:00|01|03|04|05|09|22)\b/i.test(msg) ||
    /GitHub GraphQL error:/i.test(msg) ||
    /\bHTTP 4(?:00|01|03|04|05|09|22)\b/i.test(msg) ||
    /Resource not accessible|Protected branch|Required status check|merge conflict|expected_head_sha|Head branch was modified|Base branch was modified|Pull Request is not mergeable/i.test(
      msg,
    )
  );
}

function isBaseModifiedOrBehindError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Base branch was modified|not up to date|out of date|BEHIND|Pull Request is not mergeable/i.test(msg);
}

function formatCompletedSummary(completedMerges: CompletedMergeRecord[], completedPrNumbers: number[]): string {
  if (completedMerges.length > 0) {
    return completedMerges
      .map((m) => `#${m.prNumber} (merge ${m.mergeCommitSha.slice(0, 12)})`)
      .join(', ');
  }
  if (completedPrNumbers.length > 0) {
    return completedPrNumbers.map((n) => `#${n}`).join(', ');
  }
  return 'none';
}

function verifyStateIntegrity(
  state: BatchState,
  owner: string,
  repo: string,
  authorizedOwners: string[],
): { ok: boolean; reason?: string } {
  const allowed = new Set(authorizedOwners.map((u) => u.toLowerCase()));
  if (!allowed.has(state.authorizedBy.toLowerCase())) {
    return {
      ok: false,
      reason: `Persisted batch ${state.batchId} authorizedBy "${state.authorizedBy}" is not an authorized owner.`,
    };
  }
  const expectedDigest = computeAuthorizationDigest({
    owner,
    repo,
    entries: state.entries,
    integrationPolicy: state.integrationPolicy,
    mergeMethod: state.mergeMethod,
  });
  if (state.authorizationDigest !== expectedDigest) {
    return {
      ok: false,
      reason: `Persisted batch ${state.batchId} failed authorizationDigest verification (batch entries or policy do not match signed authorization).`,
    };
  }
  return { ok: true };
}

async function stopBatchState(
  client: GitHubBatchClient,
  owner: string,
  repo: string,
  state: BatchState,
  stopReason: string,
  now: () => string,
  extra?: Partial<BatchState>,
): Promise<BatchState> {
  const stoppedState: BatchState = {
    ...state,
    ...extra,
    revision: state.revision + 1,
    status: 'stopped',
    updatedAt: now(),
    activePrNumber: null,
    activeReviewedHeadSha: null,
    activeHeadSha: null,
    pendingOperation: null,
    awaitingChecksSince: null,
    nextAction: `Stopped: ${stopReason} Already completed merges: ${formatCompletedSummary(state.completedMerges, state.completedPrNumbers)}.`,
    stopReason,
  };
  await client.saveBatchState(owner, repo, stoppedState);
  return stoppedState;
}

async function holdBatchState(
  client: GitHubBatchClient,
  owner: string,
  repo: string,
  state: BatchState,
  holdReason: string,
  nextAction: string,
  now: () => string,
  extra?: Partial<BatchState>,
): Promise<BatchState> {
  const heldState: BatchState = {
    ...state,
    ...extra,
    revision: state.revision + 1,
    status: 'held',
    updatedAt: now(),
    pendingOperation: null,
    awaitingChecksSince: null,
    holdReason,
    nextAction,
  };
  await client.saveBatchState(owner, repo, heldState);
  return heldState;
}

async function checkConcurrentStateGuard(
  client: GitHubBatchClient,
  owner: string,
  repo: string,
  expectedBatchId: string,
  expectedRevision: number,
): Promise<{ ok: boolean; latest: StoredBatchState | null; reason?: string }> {
  const latest = await client.getBatchState(owner, repo);
  if (!latest || isLegacyBatchState(latest)) {
    return {
      ok: false,
      latest,
      reason: 'Batch state missing or changed to legacy format concurrently.',
    };
  }
  if (
    latest.batchId !== expectedBatchId ||
    latest.status === 'aborted' ||
    latest.status === 'stopped' ||
    latest.status === 'held' ||
    latest.status === 'completed' ||
    Boolean(latest.abortRequestedBy) ||
    latest.revision !== expectedRevision
  ) {
    return {
      ok: false,
      latest,
      reason: `Batch state changed concurrently (status=${latest.status}, revision=${latest.revision}, expectedRevision=${expectedRevision}, abortRequestedBy=${latest.abortRequestedBy ?? 'none'}).`,
    };
  }
  return { ok: true, latest };
}

/**
 * Core re-entrant state driver for an active v2 batch.
 * Evaluates the active candidate against live main, performs protected direct merge
 * when current and verified, updates branch when behind, verifies integration provenance,
 * awaits ordinary PR CI, and enforces §2C HOLD unless integration-only policy is explicitly enabled.
 */
async function driveBatchProgress(
  client: GitHubBatchClient,
  initialState: BatchState,
  options: {
    owner: string;
    repo: string;
    fromReconcile?: boolean;
  } & RuntimePolicyOptions,
): Promise<AdvanceOutcome> {
  const {
    owner,
    repo,
    requiredChecks = DEFAULT_REQUIRED_CHECKS,
    authorizedOwners = DEFAULT_AUTHORIZED_OWNERS,
    allowIntegrationOnlyPolicy = false,
    maxIntegrationUpdatesPerPr = DEFAULT_MAX_INTEGRATION_UPDATES_PER_PR,
    checkTimeoutMs = DEFAULT_CHECK_TIMEOUT_MS,
    checkStartupGraceMs = DEFAULT_CHECK_STARTUP_GRACE_MS,
    updateTimeoutMs = DEFAULT_UPDATE_TIMEOUT_MS,
    now = () => new Date().toISOString(),
  } = options;

  let state = initialState;

  const integrity = verifyStateIntegrity(state, owner, repo, authorizedOwners);
  if (!integrity.ok) {
    const stopped = await stopBatchState(client, owner, repo, state, integrity.reason!, now);
    return { action: 'stopped', state: stopped, message: stopped.stopReason! };
  }

  // Loop safely through consecutive merges (e.g., if multiple PRs are current, bounded by entries.length).
  const maxIterations = state.entries.length + 2;
  for (let iter = 0; iter < maxIterations; iter += 1) {
    if (state.abortRequestedBy) {
      return {
        action: 'ignored',
        state,
        message: `Batch ${state.batchId} has a pending abort from ${state.abortRequestedBy}; refusing further mutations.`,
      };
    }

    if (state.nextIndex >= state.entries.length) {
      const completedState: BatchState = {
        ...state,
        revision: state.revision + 1,
        status: 'completed',
        updatedAt: now(),
        activePrNumber: null,
        activeReviewedHeadSha: null,
        activeHeadSha: null,
        pendingOperation: null,
        awaitingChecksSince: null,
        nextAction: 'None — all authorized PRs merged.',
      };
      await client.saveBatchState(owner, repo, completedState);
      return {
        action: 'completed',
        state: completedState,
        message: `Batch ${state.batchId} completed: merged ${formatCompletedSummary(completedState.completedMerges, completedState.completedPrNumbers)}.`,
      };
    }

    const entry = state.entries[state.nextIndex];
    const [currentMainSha, policy, pr] = await Promise.all([
      client.getBranchHeadSha(owner, repo, 'main'),
      client.getRepositoryPolicy(owner, repo),
      client.getPullRequest(owner, repo, entry.prNumber),
    ]);

    if (!pr) {
      const stopped = await stopBatchState(
        client,
        owner,
        repo,
        state,
        `Active PR #${entry.prNumber} could not be fetched from ${owner}/${repo}.`,
        now,
        { observedMainSha: currentMainSha },
      );
      return { action: 'stopped', state: stopped, message: stopped.stopReason! };
    }

    // 1. Handle CLOSED (not merged) PR.
    if (pr.state === 'CLOSED') {
      const stopped = await stopBatchState(
        client,
        owner,
        repo,
        state,
        `Active PR #${entry.prNumber} was closed without merging. Remaining entries were not processed.`,
        now,
        { observedMainSha: currentMainSha },
      );
      return { action: 'stopped', state: stopped, message: stopped.stopReason! };
    }

    // 2. Handle MERGED PR (distinguishing confirmed coordinator merge vs unverified manual merge).
    if (pr.state === 'MERGED') {
      const pendingMerge = state.pendingOperation?.type === 'merge' && state.pendingOperation.prNumber === entry.prNumber
        ? state.pendingOperation
        : null;
      const mergeCommitSha = pr.mergeCommit?.oid?.toLowerCase();

      if (
        state.status === 'merging' &&
        pendingMerge &&
        pr.headRefOid.toLowerCase() === pendingMerge.expectedHeadSha.toLowerCase() &&
        mergeCommitSha &&
        FULL_SHA_PATTERN.test(mergeCommitSha)
      ) {
        const mergeRecord: CompletedMergeRecord = {
          prNumber: entry.prNumber,
          reviewedHeadSha: entry.expectedHeadSha,
          mergedHeadSha: pendingMerge.expectedHeadSha,
          mergeCommitSha,
          mergedAt: pr.mergedAt ?? now(),
          mergeMethod: state.mergeMethod,
          viaIntegrationUpdate: pendingMerge.expectedHeadSha.toLowerCase() !== entry.expectedHeadSha.toLowerCase(),
        };
        const completedPrNumbers = state.completedPrNumbers.includes(entry.prNumber)
          ? [...state.completedPrNumbers]
          : [...state.completedPrNumbers, entry.prNumber];
        const completedMerges = state.completedMerges.some((m) => m.prNumber === entry.prNumber)
          ? [...state.completedMerges]
          : [...state.completedMerges, mergeRecord];
        const nextIndex = state.nextIndex + 1;
        const nextEntry = state.entries[nextIndex];

        if (!nextEntry) {
          const completedState: BatchState = {
            ...state,
            revision: state.revision + 1,
            status: 'completed',
            updatedAt: now(),
            nextIndex,
            activePrNumber: null,
            activeReviewedHeadSha: null,
            activeHeadSha: null,
            observedMainSha: mergeCommitSha,
            pendingOperation: null,
            awaitingChecksSince: null,
            completedPrNumbers,
            completedMerges,
            nextAction: 'None — all authorized PRs merged.',
          };
          await client.saveBatchState(owner, repo, completedState);
          return {
            action: 'completed',
            state: completedState,
            message: `Recovered confirmed merge of PR #${entry.prNumber} (${mergeCommitSha.slice(0, 12)}); batch ${state.batchId} completed.`,
          };
        }

        const advancedState: BatchState = {
          ...state,
          revision: state.revision + 1,
          status: 'running',
          updatedAt: now(),
          nextIndex,
          activePrNumber: nextEntry.prNumber,
          activeReviewedHeadSha: nextEntry.expectedHeadSha,
          activeHeadSha: nextEntry.expectedHeadSha,
          observedMainSha: mergeCommitSha,
          pendingOperation: null,
          awaitingChecksSince: null,
          completedPrNumbers,
          completedMerges,
          nextAction: `Evaluate next authorized PR #${nextEntry.prNumber}@${nextEntry.expectedHeadSha.slice(0, 12)}.`,
        };
        await client.saveBatchState(owner, repo, advancedState);
        state = advancedState;
        continue;
      }

      // External / unverified manual merge must NEVER be mistaken for verified batch completion.
      const stopped = await stopBatchState(
        client,
        owner,
        repo,
        state,
        `Active PR #${entry.prNumber} was merged externally outside verified coordinator merge execution (batch status was "${state.status}", PR head ${pr.headRefOid.slice(0, 12)}, merge commit ${mergeCommitSha?.slice(0, 12) ?? 'unknown'}). Stopped without treating an unverified manual merge as batch completion.`,
        now,
        { observedMainSha: currentMainSha },
      );
      return { action: 'stopped', state: stopped, message: stopped.stopReason! };
    }

    // 3. Handle in-flight branch update (`status === 'updating'`).
    if (state.status === 'updating') {
      const pendingUpdate = state.pendingOperation?.type === 'update-branch'
        && state.pendingOperation.prNumber === entry.prNumber
        ? state.pendingOperation
        : null;

      if (!pendingUpdate) {
        const stopped = await stopBatchState(
          client,
          owner,
          repo,
          state,
          `Batch was in "updating" status for PR #${entry.prNumber} without pending update metadata; stopped safely.`,
          now,
          { observedMainSha: currentMainSha },
        );
        return { action: 'stopped', state: stopped, message: stopped.stopReason! };
      }

      if (pr.headRefOid.toLowerCase() === pendingUpdate.expectedHeadSha.toLowerCase()) {
        const elapsedMs = Date.parse(now()) - Date.parse(pendingUpdate.startedAt);
        if (!Number.isNaN(elapsedMs) && elapsedMs > updateTimeoutMs) {
          const stopped = await stopBatchState(
            client,
            owner,
            repo,
            state,
            `Timed out waiting for GitHub update-branch commit on PR #${entry.prNumber} (still at ${pr.headRefOid.slice(0, 12)}).`,
            now,
            { observedMainSha: currentMainSha },
          );
          return { action: 'stopped', state: stopped, message: stopped.stopReason! };
        }
        return {
          action: 'waiting',
          state,
          message: `Branch update for PR #${entry.prNumber} from ${pendingUpdate.expectedHeadSha.slice(0, 12)} is still pending at GitHub; awaiting synchronize event.`,
        };
      }

      // New commit landed on PR branch — verify integration provenance before trusting it!
      const provenance = await verifyIntegrationUpdateProvenance(client, {
        owner,
        repo,
        prNumber: entry.prNumber,
        previousHeadSha: pendingUpdate.expectedHeadSha,
        newHeadSha: pr.headRefOid,
        expectedBaseSha: pendingUpdate.observedMainSha,
        currentMainSha,
        requestedAt: pendingUpdate.startedAt,
        now,
      });

      if (!provenance.ok || !provenance.record) {
        const stopped = await stopBatchState(
          client,
          owner,
          repo,
          state,
          `Rejected post-update commit ${pr.headRefOid.slice(0, 12)} on PR #${entry.prNumber}: ${provenance.reason}`,
          now,
          { observedMainSha: currentMainSha },
        );
        return { action: 'stopped', state: stopped, message: stopped.stopReason! };
      }

      const guard = await checkConcurrentStateGuard(client, owner, repo, state.batchId, state.revision);
      if (!guard.ok) {
        return { action: 'ignored', state: guard.latest, message: guard.reason! };
      }

      const awaitingState: BatchState = {
        ...state,
        revision: state.revision + 1,
        status: 'awaiting_checks',
        updatedAt: now(),
        activeHeadSha: pr.headRefOid.toLowerCase(),
        observedMainSha: currentMainSha,
        pendingOperation: null,
        awaitingChecksSince: now(),
        integrationUpdates: [...state.integrationUpdates, provenance.record],
        nextAction: `Awaiting ordinary PR CI on PR #${entry.prNumber}@${pr.headRefOid.slice(0, 12)} (merged main@${provenance.record.mergedBaseSha.slice(0, 12)}).`,
      };
      await client.saveBatchState(owner, repo, awaitingState);
      state = awaitingState;
      // Continue loop to evaluate checks immediately (in case checks already reported/completed).
      continue;
    }

    // 4. Handle interrupted `merging` state when PR is still OPEN.
    if (state.status === 'merging') {
      const pendingMerge = state.pendingOperation?.type === 'merge' && state.pendingOperation.prNumber === entry.prNumber
        ? state.pendingOperation
        : null;

      if (pendingMerge && pr.headRefOid.toLowerCase() === pendingMerge.expectedHeadSha.toLowerCase()) {
        // Check if main moved concurrently while our merge response was lost (meaning GitHub rejected merge as BEHIND).
        const comparison = await client.compareCommits(owner, repo, currentMainSha, pr.headRefOid);
        const nowBehind = pr.mergeStateStatus === 'BEHIND' || comparison.behindBy > 0;
        if (!nowBehind) {
          const stopped = await stopBatchState(
            client,
            owner,
            repo,
            state,
            `Interrupted merge for PR #${entry.prNumber}@${pr.headRefOid.slice(0, 12)} did not complete (PR is still OPEN and current). Stopped without issuing a duplicate merge mutation; inspect workflow logs and restart if appropriate.`,
            now,
            { observedMainSha: currentMainSha },
          );
          return { action: 'stopped', state: stopped, message: stopped.stopReason! };
        }
        // Main advanced concurrently while merge was rejected -> clear pendingOperation and transition to running so behind-branch policy applies.
        const guard = await checkConcurrentStateGuard(client, owner, repo, state.batchId, state.revision);
        if (!guard.ok) {
          return { action: 'ignored', state: guard.latest, message: guard.reason! };
        }
        const recoveredRunning: BatchState = {
          ...state,
          revision: state.revision + 1,
          status: 'running',
          updatedAt: now(),
          observedMainSha: currentMainSha,
          pendingOperation: null,
          nextAction: `PR #${entry.prNumber} fell behind main@${currentMainSha.slice(0, 12)} during merge attempt; evaluating branch update.`,
        };
        await client.saveBatchState(owner, repo, recoveredRunning);
        state = recoveredRunning;
        continue;
      }

      const stopped = await stopBatchState(
        client,
        owner,
        repo,
        state,
        `Interrupted merge for PR #${entry.prNumber} found unexpected HEAD ${pr.headRefOid.slice(0, 12)} (expected ${pendingMerge?.expectedHeadSha.slice(0, 12) ?? state.activeHeadSha?.slice(0, 12) ?? 'unknown'}). Stopped safely without duplicate mutation.`,
        now,
        { observedMainSha: currentMainSha },
      );
      return { action: 'stopped', state: stopped, message: stopped.stopReason! };
    }

    // 5. Verify exact tracked HEAD (reject any unauthorized HEAD drift / push / rebase).
    const trackedHeadSha = (state.activeHeadSha ?? entry.expectedHeadSha).toLowerCase();
    if (pr.headRefOid.toLowerCase() !== trackedHeadSha) {
      const stopped = await stopBatchState(
        client,
        owner,
        repo,
        state,
        `Unauthorized HEAD change detected on PR #${entry.prNumber}: observed ${pr.headRefOid.slice(0, 12)}, expected ${trackedHeadSha.slice(0, 12)} (reviewed ${entry.expectedHeadSha.slice(0, 12)}).`,
        now,
        { observedMainSha: currentMainSha },
      );
      return { action: 'stopped', state: stopped, message: stopped.stopReason! };
    }

    // 6. Validate merge method and non-check structural/review eligibility before any mutation.
    const methodCheck = validateMergeMethod(state.mergeMethod, policy);
    if (!methodCheck.ok) {
      const stopped = await stopBatchState(client, owner, repo, state, methodCheck.reason!, now, {
        observedMainSha: currentMainSha,
      });
      return { action: 'stopped', state: stopped, message: stopped.stopReason! };
    }

    const structuralCheck = evaluatePullRequestPreflight(
      pr,
      entry,
      `${owner}/${repo}`,
      requiredChecks,
      {
        policy,
        observedBaseSha: currentMainSha,
        expectedHeadOverride: trackedHeadSha,
        allowPendingChecks: state.status === 'awaiting_checks',
        now,
      },
    );

    // Separate structural/review failures from check failures during awaiting_checks.
    const nonCheckReasons = structuralCheck.reasons.filter(
      (r) => !(structuralCheck.verification?.reasons.includes(r)),
    );
    if (nonCheckReasons.length > 0) {
      const stopped = await stopBatchState(
        client,
        owner,
        repo,
        state,
        `PR #${entry.prNumber} failed eligibility recheck: ${nonCheckReasons.join(' ')}`,
        now,
        { observedMainSha: currentMainSha, lastVerification: structuralCheck.verification },
      );
      return {
        action: 'stopped',
        state: stopped,
        message: stopped.stopReason!,
        preflightResult: structuralCheck,
      };
    }

    // 7. Determine whether active PR is behind current accepted main.
    const comparison = await client.compareCommits(owner, repo, currentMainSha, pr.headRefOid);
    const isBehind = pr.mergeStateStatus === 'BEHIND' || comparison.behindBy > 0;

    if (isBehind) {
      const updatesForPr = state.integrationUpdates.filter((u) => u.prNumber === entry.prNumber);
      if (updatesForPr.length >= maxIntegrationUpdatesPerPr) {
        const holdReason = `PR #${entry.prNumber} fell behind main@${currentMainSha.slice(0, 12)} again after ${updatesForPr.length} automatic branch update(s) (max=${maxIntegrationUpdatesPerPr}). Holding to prevent update loops.`;
        const held = await holdBatchState(
          client,
          owner,
          repo,
          state,
          holdReason,
          `Review PR #${entry.prNumber} against main@${currentMainSha.slice(0, 12)}, then abort and restart batch when ready.`,
          now,
          { observedMainSha: currentMainSha, lastVerification: structuralCheck.verification },
        );
        return { action: 'held', state: held, message: holdReason, preflightResult: structuralCheck };
      }

      // If PR is behind and we haven't updated yet, ensure its reviewed checks weren't already failing!
      if (state.status !== 'awaiting_checks' && structuralCheck.verification?.verdict === 'failed') {
        const stopped = await stopBatchState(
          client,
          owner,
          repo,
          state,
          `PR #${entry.prNumber} failed verification before branch update: ${structuralCheck.verification.reasons.join(' ')}`,
          now,
          { observedMainSha: currentMainSha, lastVerification: structuralCheck.verification },
        );
        return { action: 'stopped', state: stopped, message: stopped.stopReason!, preflightResult: structuralCheck };
      }

      // Write-ahead state before calling update-branch.
      const guardBeforeWrite = await checkConcurrentStateGuard(client, owner, repo, state.batchId, state.revision);
      if (!guardBeforeWrite.ok) {
        return { action: 'ignored', state: guardBeforeWrite.latest, message: guardBeforeWrite.reason! };
      }

      const updateStartedAt = now();
      const pendingRevision = state.revision + 1;
      const updatingState: BatchState = {
        ...state,
        revision: pendingRevision,
        status: 'updating',
        updatedAt: updateStartedAt,
        observedMainSha: currentMainSha,
        pendingOperation: {
          type: 'update-branch',
          prNumber: entry.prNumber,
          expectedHeadSha: trackedHeadSha,
          observedMainSha: currentMainSha,
          startedAt: updateStartedAt,
        },
        lastVerification: structuralCheck.verification,
        nextAction: `Updating behind PR #${entry.prNumber}@${trackedHeadSha.slice(0, 12)} against main@${currentMainSha.slice(0, 12)}.`,
      };
      await client.saveBatchState(owner, repo, updatingState);

      // Re-read state immediately before invoking update-branch to block concurrent abort races.
      const guardBeforeApi = await checkConcurrentStateGuard(client, owner, repo, state.batchId, pendingRevision);
      if (!guardBeforeApi.ok) {
        return { action: 'ignored', state: guardBeforeApi.latest, message: guardBeforeApi.reason! };
      }

      try {
        await client.updatePullRequestBranch(owner, repo, entry.prNumber, trackedHeadSha);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        // Reconcile against live PR in case update succeeded remotely before timeout/network drop.
        let recheckPr: PullRequestSnapshot | null = null;
        try {
          recheckPr = await client.getPullRequest(owner, repo, entry.prNumber);
        } catch {
          // Preserve write-ahead updating state for watchdog reconcile.
        }

        if (recheckPr && recheckPr.state === 'OPEN' && recheckPr.headRefOid.toLowerCase() !== trackedHeadSha) {
          // Update landed remotely despite client error — loop back into `updating` provenance verification!
          state = updatingState;
          continue;
        }

        if (isDefinitiveApiRejection(err)) {
          const stopped = await stopBatchState(
            client,
            owner,
            repo,
            updatingState,
            `Failed to update branch for PR #${entry.prNumber}@${trackedHeadSha.slice(0, 12)}: ${reason}`,
            now,
          );
          return { action: 'stopped', state: stopped, message: stopped.stopReason! };
        }

        return {
          action: 'updating',
          state: updatingState,
          message: `Branch update response for PR #${entry.prNumber} was indeterminate (${reason}). Write-ahead status=updating preserved; reconcile/synchronize will recover without duplicate update.`,
        };
      }

      // Update accepted (202): check if new commit is already visible on PR branch.
      const afterPr = await client.getPullRequest(owner, repo, entry.prNumber);
      if (afterPr && afterPr.state === 'OPEN' && afterPr.headRefOid.toLowerCase() !== trackedHeadSha) {
        state = updatingState;
        continue;
      }

      return {
        action: 'updating',
        state: updatingState,
        message: `Requested GitHub update-branch for PR #${entry.prNumber}@${trackedHeadSha.slice(0, 12)} against main@${currentMainSha.slice(0, 12)}; awaiting synchronize commit and ordinary PR CI.`,
      };
    }

    // 8. PR is CURRENT with accepted main (`!isBehind`). Evaluate check verification!
    const effectiveRequired = resolveEffectiveRequiredChecks(policy, requiredChecks);
    const elapsedWaitMs = state.awaitingChecksSince
      ? Date.parse(now()) - Date.parse(state.awaitingChecksSince)
      : 0;
    const withinStartupGrace =
      state.status === 'awaiting_checks' &&
      !Number.isNaN(elapsedWaitMs) &&
      elapsedWaitMs < checkStartupGraceMs;

    const verification = evaluateCheckVerification({
      pr,
      candidateHeadSha: trackedHeadSha,
      observedBaseSha: currentMainSha,
      requiredChecks: effectiveRequired,
      protectionAccessible: policy.protectionAccessible,
      allowStartupGrace: withinStartupGrace,
      now,
    });

    if (verification.verdict === 'failed') {
      const stopped = await stopBatchState(
        client,
        owner,
        repo,
        state,
        `Verification failed for PR #${entry.prNumber}@${trackedHeadSha.slice(0, 12)}: ${verification.reasons.join(' ')}`,
        now,
        { observedMainSha: currentMainSha, lastVerification: verification },
      );
      return { action: 'stopped', state: stopped, message: stopped.stopReason! };
    }

    if (verification.verdict === 'pending') {
      if (state.status === 'awaiting_checks') {
        if (!Number.isNaN(elapsedWaitMs) && elapsedWaitMs > checkTimeoutMs) {
          const timedOutVerification: VerificationEvidence = {
            ...verification,
            verdict: 'timed_out',
            reasons: [
              ...verification.reasons,
              `Timed out after ${Math.round(checkTimeoutMs / 60000)} minutes waiting for ordinary PR CI.`,
            ],
          };
          const stopped = await stopBatchState(
            client,
            owner,
            repo,
            state,
            `Timed out waiting for ordinary PR CI on PR #${entry.prNumber}@${trackedHeadSha.slice(0, 12)}.`,
            now,
            { observedMainSha: currentMainSha, lastVerification: timedOutVerification },
          );
          return { action: 'stopped', state: stopped, message: stopped.stopReason! };
        }

        const updatedWaiting: BatchState = {
          ...state,
          revision: state.revision + 1,
          updatedAt: now(),
          observedMainSha: currentMainSha,
          lastVerification: verification,
          nextAction: `Waiting for ordinary PR CI on PR #${entry.prNumber}@${trackedHeadSha.slice(0, 12)} (pending: ${verification.pendingChecks.join(', ') || 'initializing'}).`,
        };
        await client.saveBatchState(owner, repo, updatedWaiting);
        return {
          action: 'awaiting_checks',
          state: updatedWaiting,
          message: updatedWaiting.nextAction,
        };
      }

      const stopped = await stopBatchState(
        client,
        owner,
        repo,
        state,
        `PR #${entry.prNumber}@${trackedHeadSha.slice(0, 12)} has pending checks (${verification.reasons.join(' ')}); cannot merge until checks pass.`,
        now,
        { observedMainSha: currentMainSha, lastVerification: verification },
      );
      return { action: 'stopped', state: stopped, message: stopped.stopReason! };
    }

    // 9. All checks PASSED on current main! Enforce §2C exact-HEAD & integration-only policy.
    const viaIntegrationUpdate = trackedHeadSha !== entry.expectedHeadSha.toLowerCase();
    if (viaIntegrationUpdate) {
      const updateRecords = state.integrationUpdates.filter((u) => u.prNumber === entry.prNumber);
      const latestUpdate = updateRecords[updateRecords.length - 1];

      if (!latestUpdate || !latestUpdate.provenanceVerified || latestUpdate.toHeadSha !== trackedHeadSha) {
        const stopped = await stopBatchState(
          client,
          owner,
          repo,
          state,
          `PR #${entry.prNumber}@${trackedHeadSha.slice(0, 12)} lacks verified integration provenance record; refusing to merge.`,
          now,
          { observedMainSha: currentMainSha, lastVerification: verification },
        );
        return { action: 'stopped', state: stopped, message: stopped.stopReason! };
      }

      if (state.integrationPolicy !== 'integration-only' || !allowIntegrationOnlyPolicy) {
        const holdReason = `PR #${entry.prNumber} was cleanly updated from reviewed SHA ${entry.expectedHeadSha.slice(0, 12)} to integration SHA ${trackedHeadSha.slice(0, 12)} (merging main@${latestUpdate.mergedBaseSha.slice(0, 12)}) and passed ordinary PR CI, but default §2C exact-HEAD policy holds before merging any new HEAD SHA.`;
        const nextAction = `Independent Review and Aaron: inspect PR #${entry.prNumber}@${trackedHeadSha.slice(0, 12)}, merge or re-authorize remaining entries with updated SHA, or abort this held batch.`;
        const held = await holdBatchState(
          client,
          owner,
          repo,
          state,
          holdReason,
          nextAction,
          now,
          { observedMainSha: currentMainSha, lastVerification: verification },
        );
        return { action: 'held', state: held, message: holdReason };
      }

      const overlapping = updateRecords.flatMap((u) => u.overlappingFiles);
      if (overlapping.length > 0) {
        const uniqueOverlapping = [...new Set(overlapping)].sort();
        const holdReason = `PR #${entry.prNumber}@${trackedHeadSha.slice(0, 12)} modified file(s) also changed on main (${uniqueOverlapping.join(', ')}); even under integration-only policy, overlapping file merges require fresh independent review.`;
        const nextAction = `Independent Review must review overlapping file integration on PR #${entry.prNumber}@${trackedHeadSha.slice(0, 12)} before merge.`;
        const held = await holdBatchState(
          client,
          owner,
          repo,
          state,
          holdReason,
          nextAction,
          now,
          { observedMainSha: currentMainSha, lastVerification: verification },
        );
        return { action: 'held', state: held, message: holdReason };
      }
    }

    // 10. Protected direct merge with write-ahead state and exact expected HEAD validation!
    const guardBeforeWrite = await checkConcurrentStateGuard(client, owner, repo, state.batchId, state.revision);
    if (!guardBeforeWrite.ok) {
      return { action: 'ignored', state: guardBeforeWrite.latest, message: guardBeforeWrite.reason! };
    }

    const mergeStartedAt = now();
    const pendingRevision = state.revision + 1;
    const mergingState: BatchState = {
      ...state,
      revision: pendingRevision,
      status: 'merging',
      updatedAt: mergeStartedAt,
      observedMainSha: currentMainSha,
      pendingOperation: {
        type: 'merge',
        prNumber: entry.prNumber,
        expectedHeadSha: trackedHeadSha,
        observedMainSha: currentMainSha,
        startedAt: mergeStartedAt,
      },
      awaitingChecksSince: null,
      lastVerification: verification,
      nextAction: `Executing protected direct ${state.mergeMethod} merge of PR #${entry.prNumber}@${trackedHeadSha.slice(0, 12)} into main@${currentMainSha.slice(0, 12)}.`,
    };
    await client.saveBatchState(owner, repo, mergingState);

    // Re-read immediately before calling PUT /pulls/{n}/merge to block concurrent abort races.
    const guardBeforeMerge = await checkConcurrentStateGuard(client, owner, repo, state.batchId, pendingRevision);
    if (!guardBeforeMerge.ok) {
      return { action: 'ignored', state: guardBeforeMerge.latest, message: guardBeforeMerge.reason! };
    }

    let mergeResult: { sha: string; merged: boolean; message: string };
    try {
      mergeResult = await client.mergePullRequest(
        owner,
        repo,
        entry.prNumber,
        trackedHeadSha,
        state.mergeMethod,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      let recheckPr: PullRequestSnapshot | null = null;
      let recheckMainSha: string | null = null;
      try {
        [recheckPr, recheckMainSha] = await Promise.all([
          client.getPullRequest(owner, repo, entry.prNumber),
          client.getBranchHeadSha(owner, repo, 'main'),
        ]);
      } catch {
        // Preserve write-ahead merging state for reconcile.
      }

      if (
        recheckPr?.state === 'MERGED' &&
        recheckPr.headRefOid.toLowerCase() === trackedHeadSha &&
        recheckPr.mergeCommit?.oid
      ) {
        // Merge actually succeeded remotely before connection dropped!
        state = mergingState;
        continue;
      }

      if (
        recheckPr?.state === 'OPEN' &&
        recheckPr.headRefOid.toLowerCase() === trackedHeadSha &&
        recheckMainSha &&
        (recheckMainSha.toLowerCase() !== currentMainSha.toLowerCase() ||
          recheckPr.mergeStateStatus === 'BEHIND') &&
        isBaseModifiedOrBehindError(err)
      ) {
        // Concurrent manual merge advanced main right before our merge call -> transition cleanly to behind-branch path.
        const recoveredRunning: BatchState = {
          ...mergingState,
          revision: mergingState.revision + 1,
          status: 'running',
          updatedAt: now(),
          observedMainSha: recheckMainSha,
          pendingOperation: null,
          nextAction: `Main advanced to ${recheckMainSha.slice(0, 12)} during merge of PR #${entry.prNumber}; evaluating branch update.`,
        };
        await client.saveBatchState(owner, repo, recoveredRunning);
        state = recoveredRunning;
        continue;
      }

      if (isDefinitiveApiRejection(err)) {
        const stopped = await stopBatchState(
          client,
          owner,
          repo,
          mergingState,
          `Protected merge rejected for PR #${entry.prNumber}@${trackedHeadSha.slice(0, 12)}: ${reason}`,
          now,
          { observedMainSha: recheckMainSha ?? currentMainSha },
        );
        return { action: 'stopped', state: stopped, message: stopped.stopReason! };
      }

      return {
        action: 'waiting',
        state: mergingState,
        message: `Merge outcome for PR #${entry.prNumber}@${trackedHeadSha.slice(0, 12)} is indeterminate (${reason}). Preserved write-ahead status=merging; reconcile will verify without duplicate merge.`,
      };
    }

    if (!mergeResult.merged || !FULL_SHA_PATTERN.test(mergeResult.sha)) {
      const stopped = await stopBatchState(
        client,
        owner,
        repo,
        mergingState,
        `GitHub merge endpoint did not confirm merge for PR #${entry.prNumber}: ${mergeResult.message || 'merged=false'}.`,
        now,
      );
      return { action: 'stopped', state: stopped, message: stopped.stopReason! };
    }

    const acceptedMergeSha = mergeResult.sha.toLowerCase();
    const completedRecord: CompletedMergeRecord = {
      prNumber: entry.prNumber,
      reviewedHeadSha: entry.expectedHeadSha,
      mergedHeadSha: trackedHeadSha,
      mergeCommitSha: acceptedMergeSha,
      mergedAt: now(),
      mergeMethod: state.mergeMethod,
      viaIntegrationUpdate,
    };
    const completedPrNumbers = [...state.completedPrNumbers, entry.prNumber];
    const completedMerges = [...state.completedMerges, completedRecord];
    const nextIndex = state.nextIndex + 1;
    const nextEntry = state.entries[nextIndex];

    if (!nextEntry) {
      const completedState: BatchState = {
        ...mergingState,
        revision: mergingState.revision + 1,
        status: 'completed',
        updatedAt: now(),
        nextIndex,
        activePrNumber: null,
        activeReviewedHeadSha: null,
        activeHeadSha: null,
        observedMainSha: acceptedMergeSha,
        pendingOperation: null,
        awaitingChecksSince: null,
        completedPrNumbers,
        completedMerges,
        nextAction: 'None — all authorized PRs merged.',
      };
      try {
        await client.saveBatchState(owner, repo, completedState);
      } catch (saveErr) {
        const saveReason = saveErr instanceof Error ? saveErr.message : String(saveErr);
        return {
          action: 'merged',
          state: mergingState,
          message: `PR #${entry.prNumber} merged into main (${acceptedMergeSha.slice(0, 12)}), but saving final completed state failed (${saveReason}). Write-ahead status=merging preserved for reconcile.`,
        };
      }
      return {
        action: 'completed',
        state: completedState,
        message: `Batch ${state.batchId} completed: merged ${formatCompletedSummary(completedMerges, completedPrNumbers)}.`,
      };
    }

    const nextRunningState: BatchState = {
      ...mergingState,
      revision: mergingState.revision + 1,
      status: 'running',
      updatedAt: now(),
      nextIndex,
      activePrNumber: nextEntry.prNumber,
      activeReviewedHeadSha: nextEntry.expectedHeadSha,
      activeHeadSha: nextEntry.expectedHeadSha,
      observedMainSha: acceptedMergeSha,
      pendingOperation: null,
      awaitingChecksSince: null,
      completedPrNumbers,
      completedMerges,
      nextAction: `Evaluate next authorized PR #${nextEntry.prNumber}@${nextEntry.expectedHeadSha.slice(0, 12)} against main@${acceptedMergeSha.slice(0, 12)}.`,
    };
    try {
      await client.saveBatchState(owner, repo, nextRunningState);
    } catch (saveErr) {
      const saveReason = saveErr instanceof Error ? saveErr.message : String(saveErr);
      return {
        action: 'merged',
        state: mergingState,
        message: `PR #${entry.prNumber} merged (${acceptedMergeSha.slice(0, 12)}), but saving transition to PR #${nextEntry.prNumber} failed (${saveReason}). Write-ahead status=merging preserved for reconcile.`,
      };
    }

    state = nextRunningState;
  }

  return {
    action: 'waiting',
    state,
    message: `Batch ${state.batchId} paused after maximum single-run step iterations; reconcile will continue.`,
  };
}

export async function startBatch(
  client: GitHubBatchClient,
  options: StartBatchOptions,
): Promise<StartBatchOutcome> {
  const {
    owner,
    repo,
    entries,
    authorizedBy,
    dryRun = false,
    mergeMethod: rawMergeMethod = DEFAULT_MERGE_METHOD,
    integrationPolicy = DEFAULT_INTEGRATION_POLICY,
    allowIntegrationOnlyPolicy = false,
    workflowRunId,
    workflowRunUrl,
    requiredChecks = DEFAULT_REQUIRED_CHECKS,
    authorizedOwners = DEFAULT_AUTHORIZED_OWNERS,
    maxIntegrationUpdatesPerPr = DEFAULT_MAX_INTEGRATION_UPDATES_PER_PR,
    checkTimeoutMs = DEFAULT_CHECK_TIMEOUT_MS,
    checkStartupGraceMs = DEFAULT_CHECK_STARTUP_GRACE_MS,
    updateTimeoutMs = DEFAULT_UPDATE_TIMEOUT_MS,
    now = () => new Date().toISOString(),
  } = options;

  if (integrationPolicy === 'integration-only' && !allowIntegrationOnlyPolicy) {
    return {
      ok: false,
      dryRun,
      action: 'stopped',
      preflightResults: [],
      error:
        'Integration-only auto-merge policy is disabled by default under AI Development Protocol §2C and cannot be activated without explicit owner governance approval.',
    };
  }

  let approvedBy: string | undefined;
  if (!dryRun) {
    const auth = await verifyOwnerAuthorization(client, {
      owner,
      repo,
      actor: authorizedBy,
      workflowRunId,
      authorizedOwners,
    });
    if (!auth.ok) {
      return {
        ok: false,
        dryRun: false,
        action: 'stopped',
        preflightResults: [],
        error: `Authorization failed (fail-closed): ${auth.reason}`,
      };
    }
    approvedBy = auth.approvedBy;
  }

  const existingState = await client.getBatchState(owner, repo);
  if (isActiveBatchStatus(existingState)) {
    const legacyNote = isLegacyBatchState(existingState)
      ? ' (unresolved active legacy v1 merge-queue batch — never discarded automatically)'
      : '';
    return {
      ok: false,
      dryRun,
      action: 'stopped',
      preflightResults: [],
      state: existingState ?? undefined,
      error: `Another batch (${existingState!.batchId}) is already ${existingState!.status}${legacyNote} (active PR #${existingState!.activePrNumber}). Run reconcile, abort, or resolve it before starting a new batch.`,
    };
  }

  const preflight = await runPreflight(client, owner, repo, entries, requiredChecks, {
    mergeMethod: rawMergeMethod,
    now,
  });

  if (preflight.policyError) {
    return {
      ok: false,
      dryRun,
      action: 'stopped',
      preflightResults: preflight.results,
      error: preflight.policyError,
    };
  }

  if (!preflight.ok) {
    return {
      ok: false,
      dryRun,
      action: 'stopped',
      preflightResults: preflight.results,
      error: 'Preflight failed for one or more entries. No PRs were updated or merged.',
    };
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      action: 'dry-run',
      preflightResults: preflight.results,
      message: `Dry-run passed for ${entries.length} PR(s) against main@${preflight.observedMainSha.slice(0, 12)}. Zero writes were performed.`,
    };
  }

  const mergeMethod = rawMergeMethod.trim().toLowerCase() as MergeMethod;
  const firstEntry = entries[0];
  const createdAt = now();
  const initialRevision = (existingState?.revision ?? 0) + 1;
  const authorizationDigest = computeAuthorizationDigest({
    owner,
    repo,
    entries,
    integrationPolicy,
    mergeMethod,
  });

  const initialState: BatchState = {
    version: 2,
    revision: initialRevision,
    batchId: `batch-${createdAt.replace(/[:.]/g, '-')}`,
    authorizationDigest,
    status: 'running',
    createdAt,
    updatedAt: createdAt,
    authorizedBy,
    approvedBy,
    integrationPolicy,
    mergeMethod,
    workflowRunId,
    workflowRunUrl,
    entries,
    nextIndex: 0,
    activePrNumber: firstEntry.prNumber,
    activeReviewedHeadSha: firstEntry.expectedHeadSha,
    activeHeadSha: firstEntry.expectedHeadSha,
    observedMainSha: preflight.observedMainSha,
    pendingOperation: null,
    awaitingChecksSince: null,
    integrationUpdates: [],
    lastVerification: preflight.results[0]?.verification ?? null,
    completedPrNumbers: [],
    completedMerges: [],
    nextAction: `Evaluate PR #${firstEntry.prNumber}@${firstEntry.expectedHeadSha.slice(0, 12)} against main@${preflight.observedMainSha.slice(0, 12)}.`,
  };

  await client.saveBatchState(owner, repo, initialState);

  const outcome = await driveBatchProgress(client, initialState, {
    owner,
    repo,
    requiredChecks,
    authorizedOwners,
    allowIntegrationOnlyPolicy,
    maxIntegrationUpdatesPerPr,
    checkTimeoutMs,
    checkStartupGraceMs,
    updateTimeoutMs,
    now,
  });

  const mappedAction: StartBatchOutcome['action'] =
    outcome.action === 'waiting'
      ? outcome.state && !isLegacyBatchState(outcome.state) && outcome.state.status === 'updating'
        ? 'updating'
        : 'awaiting_checks'
      : outcome.action === 'ignored' || outcome.action === 'reconciled'
        ? 'stopped'
        : outcome.action;

  return {
    ok: outcome.action !== 'stopped',
    dryRun: false,
    action: mappedAction,
    preflightResults: preflight.results,
    state: outcome.state ?? initialState,
    message: outcome.message,
    error: outcome.action === 'stopped' ? outcome.message : undefined,
  };
}

/**
 * Handles `pull_request: closed` events for the active batch.
 * Duplicate events for already-completed PRs are ignored cleanly.
 * Unrelated manual merges into main trigger reconciliation for the active PR.
 */
export async function handlePullRequestClosed(
  client: GitHubBatchClient,
  options: {
    owner: string;
    repo: string;
    prNumber: number;
    merged: boolean;
  } & RuntimePolicyOptions,
): Promise<AdvanceOutcome> {
  const { owner, repo, prNumber, merged } = options;
  const state = await client.getBatchState(owner, repo);

  if (!state) {
    return { action: 'ignored', state: null, message: 'No batch state recorded.' };
  }

  if (isLegacyBatchState(state)) {
    return reconcileLegacyV1Batch(client, state, options);
  }

  if (state.completedPrNumbers.includes(prNumber)) {
    return {
      action: 'ignored',
      state,
      message: `PR #${prNumber} is already recorded as completed in batch ${state.batchId} (duplicate event ignored).`,
    };
  }

  if (!isActiveBatchStatus(state) || state.status === 'held') {
    return {
      action: 'ignored',
      state,
      message: `No active batch is advancing (status=${state.status}).`,
    };
  }

  if (state.activePrNumber !== prNumber) {
    if (merged) {
      // Concurrent manual merge of an unrelated PR advanced main -> reconcile active PR cleanly.
      return driveBatchProgress(client, state, { ...options, fromReconcile: true });
    }
    return {
      action: 'ignored',
      state,
      message: `Closed PR #${prNumber} is not the active batch PR (#${state.activePrNumber}).`,
    };
  }

  return driveBatchProgress(client, state, { ...options, fromReconcile: true });
}

/**
 * Handles `pull_request: synchronize` events (e.g., after update-branch or unexpected push).
 */
export async function handlePullRequestSynchronize(
  client: GitHubBatchClient,
  options: {
    owner: string;
    repo: string;
    prNumber: number;
  } & RuntimePolicyOptions,
): Promise<AdvanceOutcome> {
  const { owner, repo, prNumber } = options;
  const state = await client.getBatchState(owner, repo);

  if (!state || isLegacyBatchState(state) || !isActiveBatchStatus(state) || state.status === 'held') {
    return {
      action: 'ignored',
      state,
      message: `No active direct-merge batch watching PR #${prNumber} synchronize (status=${state?.status ?? 'none'}).`,
    };
  }

  if (state.activePrNumber !== prNumber) {
    return {
      action: 'ignored',
      state,
      message: `Synchronized PR #${prNumber} is not the active batch PR (#${state.activePrNumber}).`,
    };
  }

  return driveBatchProgress(client, state, options);
}

/**
 * Handles `check_suite: completed` (or workflow completion) events while awaiting ordinary PR CI.
 */
export async function handleChecksCompleted(
  client: GitHubBatchClient,
  options: {
    owner: string;
    repo: string;
    headSha?: string;
  } & RuntimePolicyOptions,
): Promise<AdvanceOutcome> {
  const { owner, repo, headSha } = options;
  const state = await client.getBatchState(owner, repo);

  if (!state || isLegacyBatchState(state) || !isActiveBatchStatus(state) || state.status === 'held') {
    return {
      action: 'ignored',
      state,
      message: `No active batch awaiting checks (status=${state?.status ?? 'none'}).`,
    };
  }

  if (
    headSha &&
    state.activeHeadSha &&
    state.status === 'awaiting_checks' &&
    headSha.toLowerCase() !== state.activeHeadSha.toLowerCase()
  ) {
    return {
      action: 'ignored',
      state,
      message: `Check completion for ${headSha.slice(0, 12)} does not match active PR #${state.activePrNumber} HEAD ${state.activeHeadSha.slice(0, 12)}.`,
    };
  }

  return driveBatchProgress(client, state, options);
}

/**
 * Safely reconciles an unresolved legacy v1 (native merge-queue) batch without discarding it
 * and without issuing new native-queue mutations.
 */
async function reconcileLegacyV1Batch(
  client: GitHubBatchClient,
  state: LegacyBatchStateV1,
  options: { owner: string; repo: string; now?: () => string },
): Promise<AdvanceOutcome> {
  const { owner, repo, now = () => new Date().toISOString() } = options;
  if (state.status !== 'running' && state.status !== 'enqueuing') {
    return {
      action: 'ignored',
      state,
      message: `Legacy v1 batch ${state.batchId} is already terminal (status=${state.status}).`,
    };
  }

  if (state.abortRequestedBy) {
    return {
      action: 'ignored',
      state,
      message: `Legacy v1 batch ${state.batchId} has a pending abort from ${state.abortRequestedBy}.`,
    };
  }

  if (state.activePrNumber === null) {
    const stopped: LegacyBatchStateV1 = {
      ...state,
      revision: (state.revision ?? 0) + 1,
      status: 'stopped',
      updatedAt: now(),
      stopReason: 'Legacy v1 batch had no active PR number; stopped safely during migration check.',
    };
    await client.saveBatchState(owner, repo, stopped);
    return { action: 'stopped', state: stopped, message: stopped.stopReason! };
  }

  const pr = await client.getPullRequest(owner, repo, state.activePrNumber);
  if (!pr) {
    return {
      action: 'stopped',
      state,
      message: `Unresolved legacy v1 batch ${state.batchId}: active PR #${state.activePrNumber} could not be fetched. State preserved for operator inspection.`,
    };
  }

  if (pr.isInMergeQueue) {
    return {
      action: 'waiting',
      state,
      message: `Unresolved legacy v1 batch ${state.batchId}: PR #${state.activePrNumber} is still in a native merge queue. Preserved without discarding; wait or run abort.`,
    };
  }

  if (pr.state === 'MERGED') {
    const completedPrNumbers = state.completedPrNumbers.includes(state.activePrNumber)
      ? [...state.completedPrNumbers]
      : [...state.completedPrNumbers, state.activePrNumber];
    const nextIndex = state.nextIndex + 1;
    if (nextIndex >= state.entries.length) {
      const completed: LegacyBatchStateV1 = {
        ...state,
        revision: (state.revision ?? 0) + 1,
        status: 'completed',
        updatedAt: now(),
        nextIndex,
        activePrNumber: null,
        activeHeadSha: null,
        completedPrNumbers,
      };
      await client.saveBatchState(owner, repo, completed);
      return {
        action: 'completed',
        state: completed,
        message: `Legacy v1 batch ${state.batchId} completed cleanly (PR #${state.activePrNumber} merged).`,
      };
    }

    const stopped: LegacyBatchStateV1 = {
      ...state,
      revision: (state.revision ?? 0) + 1,
      status: 'stopped',
      updatedAt: now(),
      nextIndex,
      activePrNumber: null,
      activeHeadSha: null,
      completedPrNumbers,
      stopReason: `Legacy v1 batch ${state.batchId} PR #${state.activePrNumber} merged, but native merge-queue enqueuing has been retired; stopped cleanly before remaining entries (${state.entries.slice(nextIndex).map((e) => `#${e.prNumber}`).join(', ')}). Submit a new direct-merge batch if desired.`,
    };
    await client.saveBatchState(owner, repo, stopped);
    return { action: 'stopped', state: stopped, message: stopped.stopReason! };
  }

  const stopped: LegacyBatchStateV1 = {
    ...state,
    revision: (state.revision ?? 0) + 1,
    status: 'stopped',
    updatedAt: now(),
    activePrNumber: null,
    activeHeadSha: null,
    stopReason: `Legacy v1 batch ${state.batchId} active PR #${state.activePrNumber} is ${pr.state} and not in the native merge queue; stopped cleanly without discarding audit record.`,
  };
  await client.saveBatchState(owner, repo, stopped);
  return { action: 'stopped', state: stopped, message: stopped.stopReason! };
}

/**
 * Reconciles active or interrupted batch state against live GitHub PRs and main.
 */
export async function reconcileBatch(
  client: GitHubBatchClient,
  options: {
    owner: string;
    repo: string;
    requireApproval?: {
      actor: string;
      workflowRunId?: string;
    };
  } & RuntimePolicyOptions,
): Promise<AdvanceOutcome> {
  const { owner, repo, requireApproval, authorizedOwners = DEFAULT_AUTHORIZED_OWNERS } = options;

  if (requireApproval) {
    const auth = await verifyOwnerAuthorization(client, {
      owner,
      repo,
      actor: requireApproval.actor,
      workflowRunId: requireApproval.workflowRunId,
      authorizedOwners,
    });
    if (!auth.ok) {
      return {
        action: 'stopped',
        state: await client.getBatchState(owner, repo),
        message: `Manual reconcile authorization failed (fail-closed): ${auth.reason}`,
      };
    }
  }

  const state = await client.getBatchState(owner, repo);

  if (!state) {
    return { action: 'ignored', state: null, message: 'No active or interrupted batch to reconcile (status=none).' };
  }

  if (isLegacyBatchState(state)) {
    return reconcileLegacyV1Batch(client, state, options);
  }

  if (state.status === 'held') {
    return {
      action: 'ignored',
      state,
      message: `Batch ${state.batchId} is HELD on PR #${state.activePrNumber}@${state.activeHeadSha?.slice(0, 12) ?? 'unknown'}: ${state.holdReason ?? 'awaiting review/owner decision'}.`,
    };
  }

  if (!isActiveBatchStatus(state)) {
    return {
      action: 'ignored',
      state,
      message: `No active or interrupted batch to reconcile (status=${state.status}).`,
    };
  }

  return driveBatchProgress(client, state, { ...options, fromReconcile: true });
}

/**
 * Owner-authorized cancellation/abort across every processing stage (running, updating,
 * awaiting_checks, merging, held, and unresolved legacy v1). Stops subsequent mutations
 * and clearly reports any already-completed merges.
 */
export async function abortBatch(
  client: GitHubBatchClient,
  options: {
    owner: string;
    repo: string;
    actor: string;
    reason?: string;
    workflowRunId?: string;
    authorizedOwners?: string[];
    now?: () => string;
  },
): Promise<{
  aborted: boolean;
  dequeuedPrNumber?: number;
  completedMerges: CompletedMergeRecord[];
  state: StoredBatchState | null;
  message: string;
}> {
  const {
    owner,
    repo,
    actor,
    reason = 'Aborted by operator',
    workflowRunId,
    authorizedOwners = DEFAULT_AUTHORIZED_OWNERS,
    now = () => new Date().toISOString(),
  } = options;

  const auth = await verifyOwnerAuthorization(client, {
    owner,
    repo,
    actor,
    workflowRunId,
    authorizedOwners,
  });
  if (!auth.ok) {
    const current = await client.getBatchState(owner, repo);
    return {
      aborted: false,
      completedMerges: current && !isLegacyBatchState(current) ? current.completedMerges : [],
      state: current,
      message: `Abort authorization failed (fail-closed): ${auth.reason}`,
    };
  }

  const state = await client.getBatchState(owner, repo);
  if (!state || !isActiveBatchStatus(state)) {
    return {
      aborted: false,
      completedMerges: state && !isLegacyBatchState(state) ? state.completedMerges : [],
      state,
      message: `No active or held batch to abort (status=${state?.status ?? 'none'}).`,
    };
  }

  // Handle unresolved legacy v1 batch safely.
  if (isLegacyBatchState(state)) {
    const abortIntent: LegacyBatchStateV1 = {
      ...state,
      revision: (state.revision ?? 0) + 1,
      abortRequestedBy: actor,
      updatedAt: now(),
    };
    await client.saveBatchState(owner, repo, abortIntent);

    let dequeuedPrNumber: number | undefined;
    if (abortIntent.activePrNumber !== null && client.dequeuePullRequest) {
      const activePr = await client.getPullRequest(owner, repo, abortIntent.activePrNumber);
      if (activePr?.isInMergeQueue) {
        try {
          await client.dequeuePullRequest(activePr.id);
          dequeuedPrNumber = abortIntent.activePrNumber;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          return {
            aborted: false,
            completedMerges: [],
            state: abortIntent,
            message: `Failed to dequeue legacy active PR #${abortIntent.activePrNumber} during abort: ${errMsg}. Abort intent recorded.`,
          };
        }
      }
    }

    const abortedLegacy: LegacyBatchStateV1 = {
      ...abortIntent,
      revision: (abortIntent.revision ?? 0) + 1,
      status: 'aborted',
      updatedAt: now(),
      activePrNumber: null,
      activeHeadSha: null,
      stopReason: `Aborted legacy v1 batch by ${actor}: ${reason}${dequeuedPrNumber ? ` (dequeued PR #${dequeuedPrNumber})` : ''}. Completed PRs: ${formatCompletedSummary([], abortIntent.completedPrNumbers)}.`,
    };
    await client.saveBatchState(owner, repo, abortedLegacy);
    return {
      aborted: true,
      dequeuedPrNumber,
      completedMerges: [],
      state: abortedLegacy,
      message: abortedLegacy.stopReason!,
    };
  }

  // Persist abort intent immediately so any concurrent writer halts before calling GitHub mutation APIs.
  const previousStage = state.status;
  const abortIntentState: BatchState = {
    ...state,
    revision: state.revision + 1,
    abortRequestedBy: actor,
    abortReason: reason,
    updatedAt: now(),
    nextAction: `Canceling batch (was ${previousStage}) per ${actor}.`,
  };
  await client.saveBatchState(owner, repo, abortIntentState);

  // Check if an in-flight merge actually landed right as abort arrived so we report completed merges accurately!
  const completedPrNumbers = [...abortIntentState.completedPrNumbers];
  const completedMerges = [...abortIntentState.completedMerges];
  if (
    previousStage === 'merging' &&
    abortIntentState.activePrNumber !== null &&
    abortIntentState.pendingOperation?.type === 'merge'
  ) {
    try {
      const activePr = await client.getPullRequest(owner, repo, abortIntentState.activePrNumber);
      if (
        activePr?.state === 'MERGED' &&
        activePr.mergeCommit?.oid &&
        !completedPrNumbers.includes(activePr.number)
      ) {
        const entry = abortIntentState.entries.find((e) => e.prNumber === activePr.number);
        completedPrNumbers.push(activePr.number);
        completedMerges.push({
          prNumber: activePr.number,
          reviewedHeadSha: entry?.expectedHeadSha ?? activePr.headRefOid.toLowerCase(),
          mergedHeadSha: activePr.headRefOid.toLowerCase(),
          mergeCommitSha: activePr.mergeCommit.oid.toLowerCase(),
          mergedAt: activePr.mergedAt ?? now(),
          mergeMethod: abortIntentState.mergeMethod,
          viaIntegrationUpdate:
            Boolean(entry) && activePr.headRefOid.toLowerCase() !== entry!.expectedHeadSha.toLowerCase(),
        });
      }
    } catch {
      // Do not block cancellation if live PR check fails; report known completed merges.
    }
  }

  const completedReport = formatCompletedSummary(completedMerges, completedPrNumbers);
  const stopReason = `Aborted by ${actor} during stage "${previousStage}": ${reason}. Subsequent mutations stopped. Already completed merges: ${completedReport}.`;

  const abortedState: BatchState = {
    ...abortIntentState,
    revision: abortIntentState.revision + 1,
    status: 'aborted',
    updatedAt: now(),
    activePrNumber: null,
    activeReviewedHeadSha: null,
    activeHeadSha: null,
    pendingOperation: null,
    awaitingChecksSince: null,
    completedPrNumbers,
    completedMerges,
    nextAction: `Aborted. Already completed merges: ${completedReport}.`,
    stopReason,
  };
  await client.saveBatchState(owner, repo, abortedState);

  return {
    aborted: true,
    completedMerges,
    state: abortedState,
    message: stopReason,
  };
}

export function formatSummaryMarkdown(options: {
  title: string;
  preflightResults?: PreflightResult[];
  state?: StoredBatchState | null;
  message?: string;
}): string {
  const lines: string[] = [`## ${options.title}`, ''];

  if (options.message) {
    lines.push(options.message, '');
  }

  if (options.preflightResults && options.preflightResults.length > 0) {
    lines.push('### Preflight Results', '');
    lines.push('| PR | Reviewed SHA | Status | Behind `main` | Details |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const res of options.preflightResults) {
      const status = res.ok ? 'PASS' : 'FAIL';
      const behind = res.behindMain ? 'Yes (update required)' : 'No (current)';
      const details = res.ok
        ? res.behindMain
          ? 'Eligible; will update branch when active'
          : 'Eligible for direct protected merge without branch update'
        : res.reasons.join('; ');
      lines.push(
        `| #${res.entry.prNumber} | \`${res.entry.expectedHeadSha.slice(0, 12)}\` | ${status} | ${behind} | ${details} |`,
      );
    }
    lines.push('');
  }

  if (options.state) {
    const s = options.state;
    lines.push('### Batch State', '');
    lines.push(`- **Schema version:** \`v${s.version}\``);
    lines.push(`- **Batch ID:** \`${s.batchId}\``);
    lines.push(`- **Status:** \`${s.status}\``);
    lines.push(`- **Authorized by:** ${s.authorizedBy}`);
    if (!isLegacyBatchState(s)) {
      if (s.approvedBy) {
        lines.push(`- **Environment approved by:** ${s.approvedBy}`);
      }
      lines.push(`- **Merge method:** \`${s.mergeMethod}\``);
      lines.push(`- **Integration policy:** \`${s.integrationPolicy}\``);
      if (s.observedMainSha) {
        lines.push(`- **Observed \`main\` SHA:** \`${s.observedMainSha.slice(0, 12)}\``);
      }
      lines.push(
        `- **Active PR:** ${s.activePrNumber ? `#${s.activePrNumber} (reviewed \`${s.activeReviewedHeadSha?.slice(0, 12)}\`, current \`${s.activeHeadSha?.slice(0, 12)}\`)` : 'None'}`,
      );
      lines.push(
        `- **Completed merges:** ${formatCompletedSummary(s.completedMerges, s.completedPrNumbers)}`,
      );
      if (s.integrationUpdates.length > 0) {
        lines.push(
          `- **Integration updates:** ${s.integrationUpdates
            .map(
              (u) =>
                `#${u.prNumber} (\`${u.fromHeadSha.slice(0, 12)}\` -> \`${u.toHeadSha.slice(0, 12)}\` + \`main@${u.mergedBaseSha.slice(0, 12)}\`${u.overlappingFiles.length > 0 ? `, overlapping: ${u.overlappingFiles.join(', ')}` : ''})`,
            )
            .join('; ')}`,
        );
      }
      if (s.lastVerification) {
        const v = s.lastVerification;
        lines.push(
          `- **Last verification:** PR #${v.prNumber}@\`${v.candidateHeadSha.slice(0, 12)}\` verdict=\`${v.verdict}\` (protection=${v.protectionReadAccess}, passing=${v.passingChecks.length}, pending=${v.pendingChecks.length}, failing=${v.failingChecks.length}, canceled=${v.canceledChecks.length}, stale=${v.staleChecks.length}, missing=${v.missingChecks.length})`,
        );
      }
      lines.push(`- **Next action:** ${s.nextAction}`);
      if (s.holdReason) {
        lines.push(`- **Hold reason:** ${s.holdReason}`);
      }
      if (s.stopReason) {
        lines.push(`- **Stop/cancel reason:** ${s.stopReason}`);
      }
    } else {
      lines.push(
        `- **Completed PRs:** ${s.completedPrNumbers.length > 0 ? s.completedPrNumbers.map((n) => `#${n}`).join(', ') : 'None'}`,
      );
      lines.push(
        `- **Active PR:** ${s.activePrNumber ? `#${s.activePrNumber}@\`${s.activeHeadSha?.slice(0, 12)}\`` : 'None'}`,
      );
      if (s.stopReason) {
        lines.push(`- **Stop reason:** ${s.stopReason}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
