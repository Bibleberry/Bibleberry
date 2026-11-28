import { createHash } from 'node:crypto';

export const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;
export const DEFAULT_REQUIRED_CHECKS = [
  'Build reader application',
  'Verify Sanity Studio',
];
export const DEFAULT_AUTHORIZED_OWNERS = ['ContraPhilosophy'];
/**
 * Distinct GitHub user/bot logins authorized to issue native GitHub PR APPROVED reviews
 * for Independent Technical Approval. Empty by default in a public repository so arbitrary
 * external non-author GitHub users can NEVER satisfy the independent review gate.
 */
export const DEFAULT_AUTHORIZED_NATIVE_REVIEWERS: string[] = [];
/**
 * Accounts permitted to post owner-attested Independent Review conversation comments
 * under the shared-account operating model. Account login alone never establishes
 * independence; comments MUST also be explicitly owner-attested by exact comment ID
 * (`PR@SHA#COMMENT_ID`) inside the owner-approved batch manifest and pass strict
 * top-level structure + digest immutability checks.
 */
export const DEFAULT_TRUSTED_COMMENT_POSTERS = ['ContraPhilosophy'];
export const APPROVAL_ENVIRONMENT_NAME = 'merge-queue-approval';
export const RUNTIME_ENVIRONMENT_NAME = 'copper-turnstile-runtime';
export const COORDINATOR_WORKFLOW_PATH = '.github/workflows/merge-queue-batch.yml';
export const START_APPROVAL_JOB_NAME = 'Owner approval gate for batch start';
export const AUTH_MANIFEST_ARTIFACT_PREFIX = 'copper-turnstile-auth-manifest';
export const DEFAULT_MERGE_METHOD: MergeMethod = 'squash';
export const DEFAULT_INTEGRATION_POLICY: IntegrationPolicy = 'integration-only';
export const DEFAULT_CHECK_TIMEOUT_MS = 90 * 60 * 1000;
export const DEFAULT_CHECK_STARTUP_GRACE_MS = 5 * 60 * 1000;
export const DEFAULT_UPDATE_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_MAX_INTEGRATION_UPDATES_PER_PR = 2;
export const COMPARE_FILES_TRUNCATION_LIMIT = 300;

export type MergeMethod = 'squash' | 'merge' | 'rebase';
export type IntegrationPolicy = 'integration-only' | 'hold-on-update';

export interface BatchEntry {
  prNumber: number;
  expectedHeadSha: string;
  /**
   * Owner-attested PR Conversation Independent Review comment ID (`PR@SHA#COMMENT_ID`).
   * Required under the shared-account model when no distinct authorized native reviewer
   * identity has approved the PR.
   */
  reviewCommentId?: string;
  /**
   * SHA-256 digest of the attested comment body captured at owner batch start to detect
   * post-authorization edits.
   */
  reviewCommentDigest?: string;
}

export interface AuthorizedBatchManifest {
  version: 2;
  owner: string;
  repo: string;
  workflowRunId: string;
  authorizedBy: string;
  mergeMethod: MergeMethod;
  integrationPolicy: IntegrationPolicy;
  entries: Array<{
    prNumber: number;
    expectedHeadSha: string;
    reviewCommentId?: string;
  }>;
  manifestSha256: string;
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
  commit: { oid: string | null } | null;
  submittedAt?: string | null;
}

export interface PullRequestCommentNode {
  id?: string;
  author: { login: string } | null;
  body: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface IndependentReviewEvidence {
  source: 'native-review' | 'owner-attested-comment';
  reviewedHeadSha: string;
  reviewer: string;
  recordedAt?: string | null;
  commentId?: string;
  commentDigest?: string;
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
  issueComments?: {
    pageInfo?: { hasNextPage: boolean };
    nodes: PullRequestCommentNode[];
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
  allowForcePushes?: boolean;
  allowDeletions?: boolean;
  hasBypassAllowances?: boolean;
  bypassAllowanceTargets?: string[];
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
  filesTruncated?: boolean;
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
  reviewEvidence?: IndependentReviewEvidence;
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
  /**
   * Plain SHA-256 consistency checksum over repo, ordered entries, integrationPolicy,
   * and mergeMethod. This is an accidental-corruption consistency check, NOT a
   * cryptographic signature; authorization authenticity is enforced by the main-only
   * environment write boundary and live verification of `workflowRunId` against
   * GitHub's `/actions/runs/{run_id}/approvals` API.
   */
  stateChecksum: string;
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
  lastReviewEvidence?: IndependentReviewEvidence | null;
  completedPrNumbers: number[];
  completedMerges: CompletedMergeRecord[];
  nextAction: string;
  holdReason?: string;
  stopReason?: string;
}

export type StoredBatchState = BatchState | LegacyBatchStateV1;

export interface WorkflowApprovalExpectations {
  expectedWorkflowPath?: string;
  expectedEvent?: string;
  expectedHeadBranch?: string;
  expectedStartApprovalJobName?: string;
}

export interface ApprovalVerificationResult {
  ok: boolean;
  reason?: string;
  approvedBy?: string;
  workflowPath?: string;
  event?: string;
  headBranch?: string;
  actor?: string;
  hasStartApprovalJob?: boolean;
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
    expectations?: WorkflowApprovalExpectations,
  ): Promise<ApprovalVerificationResult>;
  getAuthorizedManifest?(
    owner: string,
    repo: string,
    runId: string,
  ): Promise<AuthorizedBatchManifest | null>;
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
 * Computes a deterministic SHA-256 digest of a PR review comment body (LF-normalized).
 */
export function computeCommentBodyDigest(body: string): string {
  return createHash('sha256').update(body.replace(/\r\n/g, '\n')).digest('hex');
}

/**
 * Computes a deterministic SHA-256 consistency checksum over repo, ordered batch entries
 * (including owner-attested reviewCommentId), integration policy, and merge method.
 * (Not a cryptographic signature; authorization binding is enforced against the immutable
 * workflow-run manifest artifact and live run metadata/approvals.)
 */
export function computeStateChecksum(params: {
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
      ...(e.reviewCommentId ? { reviewCommentId: e.reviewCommentId } : {}),
    })),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Builds the canonical immutable authorization manifest uploaded as a run-bound artifact
 * by the owner-approved `start` run and re-verified on every continuation step.
 */
export function buildAuthorizedManifest(params: {
  owner: string;
  repo: string;
  workflowRunId: string;
  authorizedBy: string;
  mergeMethod: MergeMethod;
  integrationPolicy: IntegrationPolicy;
  entries: BatchEntry[];
}): AuthorizedBatchManifest {
  const normalizedEntries = params.entries.map((e) => ({
    prNumber: e.prNumber,
    expectedHeadSha: e.expectedHeadSha.toLowerCase(),
    ...(e.reviewCommentId ? { reviewCommentId: e.reviewCommentId } : {}),
  }));
  const payload = {
    version: 2 as const,
    owner: params.owner.toLowerCase(),
    repo: params.repo.toLowerCase(),
    workflowRunId: params.workflowRunId,
    authorizedBy: params.authorizedBy,
    mergeMethod: params.mergeMethod,
    integrationPolicy: params.integrationPolicy,
    entries: normalizedEntries,
  };
  const manifestSha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return {
    ...payload,
    manifestSha256,
  };
}

/**
 * Parses an ordered list of `PR_NUMBER@REVIEWED_HEAD_SHA[#REVIEW_COMMENT_ID]` entries.
 * Accepts comma, whitespace, or newline separators.
 */
export function parseBatchEntries(raw: string): BatchEntry[] {
  const tokens = raw
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error(
      'Batch entries list is empty. Provide one or more PR_NUMBER@REVIEWED_HEAD_SHA[#REVIEW_COMMENT_ID] entries.',
    );
  }

  const seenPrs = new Set<number>();
  const entries: BatchEntry[] = [];

  for (const token of tokens) {
    const atParts = token.split('@');
    if (atParts.length !== 2) {
      throw new Error(
        `Invalid batch entry "${token}". Expected format PR_NUMBER@REVIEWED_HEAD_SHA or PR_NUMBER@REVIEWED_HEAD_SHA#REVIEW_COMMENT_ID.`,
      );
    }

    const [rawPr, shaAndComment] = atParts;
    if (!/^[1-9]\d*$/.test(rawPr)) {
      throw new Error(`Invalid PR number in entry "${token}". PR number must be a positive integer.`);
    }
    const prNumber = Number(rawPr);

    const hashParts = shaAndComment.split('#');
    if (hashParts.length > 2) {
      throw new Error(
        `Invalid batch entry "${token}". Expected at most one #REVIEW_COMMENT_ID suffix.`,
      );
    }

    const [rawSha, rawCommentId] = hashParts;
    if (!FULL_SHA_PATTERN.test(rawSha)) {
      throw new Error(
        `Invalid head SHA in entry "${token}". Provide the full 40-character hexadecimal commit SHA.`,
      );
    }

    let reviewCommentId: string | undefined;
    if (rawCommentId !== undefined) {
      if (!/^[1-9]\d*$/.test(rawCommentId)) {
        throw new Error(
          `Invalid review comment ID in entry "${token}". Provide the numeric GitHub issue comment ID after "#".`,
        );
      }
      reviewCommentId = rawCommentId;
    }

    if (seenPrs.has(prNumber)) {
      throw new Error(`Duplicate PR #${prNumber} in batch entries. Each PR may appear at most once.`);
    }
    seenPrs.add(prNumber);

    entries.push({
      prNumber,
      expectedHeadSha: rawSha.toLowerCase(),
      ...(reviewCommentId ? { reviewCommentId } : {}),
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

/**
 * Verifies effective branch protection invariants on `main` fail-closed before any write.
 * Ensures strict status checks, enforce_admins, conversation resolution, no force-push/deletion,
 * no PR bypass allowances, and presence of baseline required checks.
 */
export function evaluateBranchProtectionSafety(
  policy: RepositoryPolicy,
  baselineRequiredChecks: string[] = DEFAULT_REQUIRED_CHECKS,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (!policy.protectionAccessible) {
    return {
      ok: false,
      reasons: [
        'Branch protection metadata for main is inaccessible (403/unavailable). Cannot verify strict protection and no-bypass invariants fail-closed before writes; ensure the Copper Turnstile GitHub App has Administration: Read-only.',
      ],
    };
  }

  if (policy.strictStatusChecks !== true) {
    reasons.push('Branch protection on main does not enforce strict up-to-date status checks (strict=false).');
  }

  if (policy.enforceAdmins !== true) {
    reasons.push('Branch protection on main does not enforce rules for administrators (enforce_admins=false).');
  }

  if (policy.requiredConversationResolution !== true) {
    reasons.push(
      'Branch protection on main does not require conversation resolution (required_conversation_resolution=false).',
    );
  }

  if (policy.allowForcePushes !== false) {
    reasons.push('Branch protection on main permits force pushes (allow_force_pushes!=false).');
  }

  if (policy.allowDeletions !== false) {
    reasons.push('Branch protection on main permits branch deletion (allow_deletions!=false).');
  }

  if (policy.hasBypassAllowances === true) {
    const targets = policy.bypassAllowanceTargets?.join(', ') || 'configured principals';
    reasons.push(
      `Branch protection on main grants pull-request bypass allowances (${targets}); refusing automated writes until bypass is removed or audited.`,
    );
  }

  const activeContexts = new Set(policy.requiredStatusChecks ?? []);
  for (const check of baselineRequiredChecks) {
    if (!activeContexts.has(check)) {
      reasons.push(`Branch protection on main is missing required check "${check}".`);
    }
  }

  return { ok: reasons.length === 0, reasons };
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
  return (
    (node.__typename === 'StatusContext' || (!node.name && node.context) ? node.context : node.name) ??
    '(unnamed check)'
  );
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
      reasons.push(
        `PR #${pr.number}@${candidateHeadSha.slice(0, 12)} has no status checks reported yet; awaiting CI startup.`,
      );
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

// Strict top-level Line-1 Independent Review header matching real Bibleberry dispositions:
// e.g. `**Claude Says | [Issue #367](...) | PR #375 | Independent Review | exact HEAD `cecc4...`**`
const STRUCTURED_REVIEW_HEADER_LINE =
  /^(?:\*\*)?[^|\n]+\|\s*(?:\[?Issue #[1-9]\d*\]?(?:\([^)]+\))?\s*\|\s*)?\[?PR #([1-9]\d*)\]?(?:\([^)]+\))?\s*\|\s*Independent\s+(?:re-?review|review|documentary\s+review|source\s+review|technical\s+review)\s*\|\s*exact\s+HEAD\s+`([0-9a-f]{40})`(?:\*\*)?$/i;

const TOP_LEVEL_APPROVING_DISPOSITION_LINE =
  /^(?:\*\*)?Disposition:\s*(CODE\s+APPROVED|APPROVED(?:\s+FOR\s+OWNER\s+(?:MERGE|QUEUE\s+ENTRY))?)(?:\b|[\s.—:-])/i;

const TOP_LEVEL_BLOCKING_DISPOSITION_LINE =
  /^(?:\*\*)?Disposition:\s*(CHANGES\s+REQUESTED|HOLD|BLOCKED|REJECTED|DO\s+NOT\s+MERGE|NOT\s+APPROVED)(?:\b|[\s.—:-])/i;

export interface ParsedStructuredReviewComment {
  kind: 'approved' | 'blocking' | 'none';
  prNumber?: number;
  reviewedHeadSha?: string;
  dispositionLine?: string;
}

/**
 * Strictly parses a PR Conversation comment for top-level (non-quoted, non-fenced)
 * Independent Review dispositions. Quoted text (`> ...`), fenced code blocks (` ``` `),
 * and prose references buried inside implementation-agent comments are ignored/rejected.
 */
export function parseStructuredIndependentReviewComment(body: string): ParsedStructuredReviewComment {
  const rawLines = body.replace(/\r\n/g, '\n').split('\n');
  const topLevelNonEmptyLines: Array<{ line: string; originalIndex: number }> = [];
  let inFence = false;

  for (let i = 0; i < rawLines.length; i += 1) {
    const trimmed = rawLines[i].trim();
    if (/^`{3,}|^~{3,}/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith('>')) {
      continue;
    }
    topLevelNonEmptyLines.push({ line: trimmed, originalIndex: i });
  }

  if (topLevelNonEmptyLines.length === 0) {
    return { kind: 'none' };
  }

  // First non-empty raw line MUST NOT be a blockquote or code fence for a valid structured review.
  const firstRawNonEmpty = rawLines.find((l) => l.trim().length > 0)?.trim() ?? '';
  const firstLineIsQuotedOrFenced =
    firstRawNonEmpty.startsWith('>') || /^`{3,}|^~{3,}/.test(firstRawNonEmpty);

  // Check if ANY top-level non-quoted line carries a blocking Disposition directive.
  for (const item of topLevelNonEmptyLines) {
    const blockMatch = TOP_LEVEL_BLOCKING_DISPOSITION_LINE.exec(item.line);
    if (blockMatch) {
      const headerMatch = !firstLineIsQuotedOrFenced
        ? STRUCTURED_REVIEW_HEADER_LINE.exec(topLevelNonEmptyLines[0].line)
        : null;
      return {
        kind: 'blocking',
        prNumber: headerMatch ? Number(headerMatch[1]) : undefined,
        reviewedHeadSha: headerMatch ? headerMatch[2].toLowerCase() : undefined,
        dispositionLine: blockMatch[0].replace(/^\*\*/, ''),
      };
    }
  }

  if (firstLineIsQuotedOrFenced || topLevelNonEmptyLines.length < 2) {
    return { kind: 'none' };
  }

  // Approving review MUST strictly have the canonical header on line 1 AND Disposition on line 2.
  const headerMatch = STRUCTURED_REVIEW_HEADER_LINE.exec(topLevelNonEmptyLines[0].line);
  if (!headerMatch) {
    return { kind: 'none' };
  }

  const prNumber = Number(headerMatch[1]);
  const reviewedHeadSha = headerMatch[2].toLowerCase();
  const secondLine = topLevelNonEmptyLines[1].line;

  if (TOP_LEVEL_BLOCKING_DISPOSITION_LINE.test(secondLine)) {
    return {
      kind: 'blocking',
      prNumber,
      reviewedHeadSha,
      dispositionLine: secondLine,
    };
  }

  const approveMatch = TOP_LEVEL_APPROVING_DISPOSITION_LINE.exec(secondLine);
  if (!approveMatch) {
    return { kind: 'none' };
  }

  return {
    kind: 'approved',
    prNumber,
    reviewedHeadSha,
    dispositionLine: approveMatch[0].replace(/^\*\*/, ''),
  };
}

export interface CommentReviewEvaluation {
  truncated: boolean;
  blocked: boolean;
  blockReason?: string;
  approved: boolean;
  missingAttestation?: boolean;
  attestationError?: string;
  staleApprovedSha?: string;
  evidence?: IndependentReviewEvidence;
}

/**
 * Evaluates PR Conversation Independent Review comments under the shared-account model.
 *
 * Security invariants:
 * - Account login alone NEVER establishes departmental independence; under the shared
 *   account model, the owner MUST explicitly attest the exact review comment ID inside
 *   the batch entry (`PR@SHA#COMMENT_ID`).
 * - The attested comment MUST exist on this PR, be authored by `trustedCommentPosters`,
 *   strictly match the top-level 2-line Independent Review format for this exact PR and
 *   40-char `reviewedHeadSha`, and match `expectedCommentDigest` if recorded at start.
 * - Any chronologically later top-level blocking disposition (`CHANGES REQUESTED`,
 *   `HOLD`, `BLOCKED`, `REJECTED`) from a trusted poster supersedes the attested approval.
 */
export function evaluateIndependentReviewComments(options: {
  pr: PullRequestSnapshot;
  reviewedHeadSha: string;
  attestedCommentId?: string;
  expectedCommentDigest?: string;
  trustedCommentPosters?: string[];
}): CommentReviewEvaluation {
  const {
    pr,
    reviewedHeadSha,
    attestedCommentId,
    expectedCommentDigest,
    trustedCommentPosters = DEFAULT_TRUSTED_COMMENT_POSTERS,
  } = options;

  if (pr.issueComments?.pageInfo?.hasNextPage) {
    return {
      truncated: true,
      blocked: true,
      blockReason: `PR #${pr.number} conversation comments are truncated; cannot conclusively verify Independent Review disposition.`,
      approved: false,
    };
  }

  const allowedPosters = new Set(trustedCommentPosters.map((login) => login.toLowerCase()));
  const nodes = pr.issueComments?.nodes ?? [];

  const ordered = nodes.map((node, index) => ({
    node,
    index,
    ts: node.createdAt ? Date.parse(node.createdAt) : Number.NaN,
  }));
  if (ordered.every((item) => !Number.isNaN(item.ts))) {
    ordered.sort((a, b) => (a.ts === b.ts ? a.index - b.index : a.ts - b.ts));
  }

  // First check whether the latest top-level trusted disposition on the PR is blocking.
  let latestBlocking: { index: number; reviewer: string; dispositionLine: string; citedSha?: string } | null = null;
  let attestedIndex = -1;
  let attestedNode: PullRequestCommentNode | null = null;

  for (let i = 0; i < ordered.length; i += 1) {
    const { node } = ordered[i];
    if (attestedCommentId && node.id === attestedCommentId) {
      attestedIndex = i;
      attestedNode = node;
    }

    const authorLogin = node.author?.login ?? '';
    if (!allowedPosters.has(authorLogin.toLowerCase())) {
      continue;
    }

    const parsed = parseStructuredIndependentReviewComment(node.body ?? '');
    if (parsed.kind === 'blocking') {
      latestBlocking = {
        index: i,
        reviewer: authorLogin,
        dispositionLine: parsed.dispositionLine ?? 'Disposition: BLOCKED',
        citedSha: parsed.reviewedHeadSha,
      };
    }
  }

  // If no comment ID was owner-attested, never silently accept an unattested shared-account comment.
  if (!attestedCommentId) {
    if (latestBlocking) {
      const shaSuffix = latestBlocking.citedSha ? ` at ${latestBlocking.citedSha.slice(0, 12)}` : '';
      return {
        truncated: false,
        blocked: true,
        blockReason: `PR #${pr.number} has a blocking Independent Review conversation disposition from ${latestBlocking.reviewer} (${latestBlocking.dispositionLine}${shaSuffix}).`,
        approved: false,
      };
    }
    return {
      truncated: false,
      blocked: false,
      approved: false,
      missingAttestation: true,
    };
  }

  if (!attestedNode) {
    return {
      truncated: false,
      blocked: false,
      approved: false,
      attestationError: `Owner-attested review comment #${attestedCommentId} was not found on PR #${pr.number}.`,
    };
  }

  const attestedAuthor = attestedNode.author?.login ?? '';
  if (!allowedPosters.has(attestedAuthor.toLowerCase())) {
    return {
      truncated: false,
      blocked: false,
      approved: false,
      attestationError: `Owner-attested review comment #${attestedCommentId} was posted by untrusted author "${attestedAuthor || 'unknown'}" (allowed: [${trustedCommentPosters.join(', ')}]).`,
    };
  }

  const parsedAttested = parseStructuredIndependentReviewComment(attestedNode.body ?? '');
  if (parsedAttested.kind === 'blocking') {
    return {
      truncated: false,
      blocked: true,
      blockReason: `Owner-attested review comment #${attestedCommentId} on PR #${pr.number} carries a blocking disposition (${parsedAttested.dispositionLine}).`,
      approved: false,
    };
  }

  if (parsedAttested.kind !== 'approved') {
    return {
      truncated: false,
      blocked: false,
      approved: false,
      attestationError: `Owner-attested comment #${attestedCommentId} on PR #${pr.number} does not match the strict top-level Independent Review format (quoted, fenced, or unstructured prose is rejected).`,
    };
  }

  if (parsedAttested.prNumber !== pr.number) {
    return {
      truncated: false,
      blocked: false,
      approved: false,
      attestationError: `Owner-attested review comment #${attestedCommentId} cites PR #${parsedAttested.prNumber}, not PR #${pr.number}.`,
    };
  }

  if (parsedAttested.reviewedHeadSha !== reviewedHeadSha.toLowerCase()) {
    return {
      truncated: false,
      blocked: false,
      approved: false,
      staleApprovedSha: parsedAttested.reviewedHeadSha,
    };
  }

  const actualDigest = computeCommentBodyDigest(attestedNode.body ?? '');
  if (expectedCommentDigest && actualDigest !== expectedCommentDigest) {
    return {
      truncated: false,
      blocked: false,
      approved: false,
      attestationError: `Owner-attested review comment #${attestedCommentId} on PR #${pr.number} was edited after batch authorization (comment digest mismatch).`,
    };
  }

  // Check if a chronologically later trusted blocking comment superseded the attested approval!
  if (latestBlocking && latestBlocking.index > attestedIndex) {
    const shaSuffix = latestBlocking.citedSha ? ` at ${latestBlocking.citedSha.slice(0, 12)}` : '';
    return {
      truncated: false,
      blocked: true,
      blockReason: `Owner-attested review comment #${attestedCommentId} on PR #${pr.number} was superseded by a later blocking disposition from ${latestBlocking.reviewer} (${latestBlocking.dispositionLine}${shaSuffix}).`,
      approved: false,
    };
  }

  return {
    truncated: false,
    blocked: false,
    approved: true,
    evidence: {
      source: 'owner-attested-comment',
      reviewedHeadSha: reviewedHeadSha.toLowerCase(),
      reviewer: attestedAuthor,
      recordedAt: attestedNode.createdAt ?? null,
      commentId: attestedCommentId,
      commentDigest: actualDigest,
    },
  };
}

/**
 * Fail-closed review and independent-approval evaluator.
 *
 * Distinguishes two separate requirements:
 * 1. Native GitHub branch-protection review requirements (`reviewDecision`, `CHANGES_REQUESTED`,
 *    `requiredApprovingReviewCount` when > 0, unresolved threads).
 * 2. Independent Technical Approval for `reviewedHeadSha`:
 *    - Native path: ONLY accepts `APPROVED` reviews whose author is in `authorizedNativeReviewers`
 *      (never arbitrary public-repo external users!), differs from PR author, AND carries a
 *      non-null exact 40-char `commit.oid === reviewedHeadSha`.
 *    - Shared-account owner-attested comment path (when `requiredApprovingReviewCount === 0`):
 *      requires an explicit owner-attested `#REVIEW_COMMENT_ID` in the batch entry matching the
 *      strict top-level Independent Review format for this PR + exact `reviewedHeadSha`, unchanged
 *      comment digest, and zero superseding blocking dispositions.
 */
export function evaluateReviewEligibility(options: {
  pr: PullRequestSnapshot;
  reviewedHeadSha: string;
  candidateHeadSha: string;
  attestedCommentId?: string;
  expectedCommentDigest?: string;
  policy?: RepositoryPolicy | null;
  authorizedNativeReviewers?: string[];
  trustedCommentPosters?: string[];
}): { ok: boolean; reasons: string[]; evidence?: IndependentReviewEvidence } {
  const {
    pr,
    reviewedHeadSha,
    candidateHeadSha,
    attestedCommentId,
    expectedCommentDigest,
    policy,
    authorizedNativeReviewers = DEFAULT_AUTHORIZED_NATIVE_REVIEWERS,
    trustedCommentPosters = DEFAULT_TRUSTED_COMMENT_POSTERS,
  } = options;
  const reasons: string[] = [];
  const normalizedReviewed = reviewedHeadSha.toLowerCase();
  const normalizedCandidate = candidateHeadSha.toLowerCase();

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

  const unresolvedCount = pr.reviewThreads.nodes.filter((thread) => !thread.isResolved).length;
  if (unresolvedCount > 0) {
    reasons.push(`PR #${pr.number} has ${unresolvedCount} unresolved review conversation(s).`);
  } else if (pr.reviewThreads.pageInfo?.hasNextPage) {
    reasons.push(
      `PR #${pr.number} has more than ${pr.reviewThreads.nodes.length} review threads; cannot verify all are resolved.`,
    );
  }

  // Evaluate PR Conversation comments (checking both owner-attested approval AND any blocking dispositions).
  const commentEval = evaluateIndependentReviewComments({
    pr,
    reviewedHeadSha: normalizedReviewed,
    attestedCommentId,
    expectedCommentDigest,
    trustedCommentPosters,
  });
  if (commentEval.blocked && commentEval.blockReason) {
    reasons.push(commentEval.blockReason);
  }

  // Evaluate native GitHub APPROVED reviews strictly:
  // - Non-author AND explicitly listed in `authorizedNativeReviewers` (public-repo external users NEVER qualify!)
  // - Non-null exact 40-char commit.oid matching target SHA.
  const prAuthor = pr.author?.login?.toLowerCase() ?? '';
  const allowedNativeReviewers = new Set(authorizedNativeReviewers.map((u) => u.toLowerCase()));
  const approvedReviews = latestReviews.filter((r) => r.state === 'APPROVED');
  const nonAuthorApproved = approvedReviews.filter(
    (r) => !prAuthor || (r.author?.login?.toLowerCase() ?? '') !== prAuthor,
  );
  const authorizedNativeApproved = nonAuthorApproved.filter((r) =>
    allowedNativeReviewers.has(r.author?.login?.toLowerCase() ?? ''),
  );
  const unauthorizedExternalApproved = nonAuthorApproved.filter(
    (r) => !allowedNativeReviewers.has(r.author?.login?.toLowerCase() ?? ''),
  );

  const nullOidAuthorized = authorizedNativeApproved.filter(
    (r) => !r.commit?.oid || !FULL_SHA_PATTERN.test(r.commit.oid),
  );
  const exactReviewedAuthorizedNative = authorizedNativeApproved.filter(
    (r) => Boolean(r.commit?.oid && r.commit.oid.toLowerCase() === normalizedReviewed),
  );
  const exactCandidateAuthorizedNative = authorizedNativeApproved.filter(
    (r) => Boolean(r.commit?.oid && r.commit.oid.toLowerCase() === normalizedCandidate),
  );
  const staleAuthorizedForReviewed = authorizedNativeApproved.filter(
    (r) =>
      Boolean(r.commit?.oid && FULL_SHA_PATTERN.test(r.commit.oid)) &&
      r.commit!.oid!.toLowerCase() !== normalizedReviewed,
  );
  const staleAuthorizedForCandidate = authorizedNativeApproved.filter(
    (r) =>
      Boolean(r.commit?.oid && FULL_SHA_PATTERN.test(r.commit.oid)) &&
      r.commit!.oid!.toLowerCase() !== normalizedCandidate,
  );

  // Separate check for native required_approving_review_count (when branch protection enforces > 0).
  const requiredApprovalCount = policy?.requiredApprovingReviewCount ?? 0;
  let evidence: IndependentReviewEvidence | undefined;

  if (requiredApprovalCount > 0) {
    if (exactCandidateAuthorizedNative.length < requiredApprovalCount) {
      if (nullOidAuthorized.length > 0) {
        reasons.push(
          `PR #${pr.number} has an authorized native approving review with missing/null commit OID, which cannot verify exact HEAD ${normalizedCandidate.slice(0, 12)}.`,
        );
      } else if (staleAuthorizedForCandidate.length > 0) {
        reasons.push(
          `PR #${pr.number} authorized native approving review is stale (bound to ${staleAuthorizedForCandidate[0].commit?.oid?.slice(0, 12)}, not current HEAD ${normalizedCandidate.slice(0, 12)}).`,
        );
      } else if (unauthorizedExternalApproved.length > 0 && authorizedNativeApproved.length === 0) {
        const externalLogins = unauthorizedExternalApproved.map((r) => r.author?.login ?? 'unknown').join(', ');
        reasons.push(
          `PR #${pr.number} only has native approval from unauthorized identity [${externalLogins}] (not in authorizedNativeReviewers).`,
        );
      } else if (approvedReviews.length > 0 && nonAuthorApproved.length === 0) {
        reasons.push(
          `PR #${pr.number} only has self-approval by PR author; independent approving review is required.`,
        );
      } else {
        reasons.push(
          `PR #${pr.number} has ${exactCandidateAuthorizedNative.length}/${requiredApprovalCount} required authorized independent native approving review(s) bound to exact HEAD ${normalizedCandidate.slice(0, 12)}.`,
        );
      }
    } else {
      const first = exactCandidateAuthorizedNative[0];
      evidence = {
        source: 'native-review',
        reviewedHeadSha: normalizedCandidate,
        reviewer: first.author?.login ?? 'unknown',
        recordedAt: first.submittedAt ?? null,
      };
    }
  } else {
    // requiredApprovingReviewCount === 0: MUST STILL FAIL CLOSED without authorized independent approval!
    if (exactReviewedAuthorizedNative.length > 0) {
      const first = exactReviewedAuthorizedNative[0];
      evidence = {
        source: 'native-review',
        reviewedHeadSha: normalizedReviewed,
        reviewer: first.author?.login ?? 'unknown',
        recordedAt: first.submittedAt ?? null,
      };
    } else if (commentEval.approved && commentEval.evidence) {
      evidence = commentEval.evidence;
    } else {
      if (commentEval.attestationError) {
        reasons.push(commentEval.attestationError);
      } else if (commentEval.staleApprovedSha) {
        reasons.push(
          `PR #${pr.number} owner-attested Independent Review comment #${attestedCommentId} is stale (bound to ${commentEval.staleApprovedSha.slice(0, 12)}, not reviewed HEAD ${normalizedReviewed.slice(0, 12)}).`,
        );
      } else if (approvedReviews.length > 0 && nonAuthorApproved.length === 0) {
        reasons.push(
          `PR #${pr.number} has only an invalid self-approval by PR author and no authorized independent review approval for ${normalizedReviewed.slice(0, 12)}.`,
        );
      } else if (nullOidAuthorized.length > 0) {
        reasons.push(
          `PR #${pr.number} authorized native approving review has missing/null commit OID and cannot satisfy exact-HEAD approval for ${normalizedReviewed.slice(0, 12)}.`,
        );
      } else if (staleAuthorizedForReviewed.length > 0) {
        reasons.push(
          `PR #${pr.number} authorized native approving review is stale (bound to ${staleAuthorizedForReviewed[0].commit?.oid?.slice(0, 12)}, not reviewed HEAD ${normalizedReviewed.slice(0, 12)}).`,
        );
      } else if (unauthorizedExternalApproved.length > 0 && authorizedNativeApproved.length === 0) {
        const externalLogins = unauthorizedExternalApproved.map((r) => r.author?.login ?? 'unknown').join(', ');
        reasons.push(
          `PR #${pr.number} native approval by "${externalLogins}" is rejected (not in authorizedNativeReviewers; public-repo non-author is not a trusted reviewer identity). Provide an owner-attested PR@SHA#REVIEW_COMMENT_ID or configure a dedicated authorized native reviewer.`,
        );
      } else if (!commentEval.blocked) {
        reasons.push(
          commentEval.missingAttestation
            ? `PR #${pr.number} has no authorized native review and no owner-attested review comment ID for ${normalizedReviewed.slice(0, 12)}. Under the shared-account model, specify PR@SHA#REVIEW_COMMENT_ID referencing the structured Independent Review disposition comment.`
            : `PR #${pr.number} has no verified exact-HEAD Independent Review approval for ${normalizedReviewed.slice(0, 12)}.`,
        );
      }
    }
  }

  return { ok: reasons.length === 0, reasons, evidence };
}

/**
 * Evaluates whether a pull request satisfies all preflight policy, revision, independent-review,
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
    authorizedNativeReviewers?: string[];
    trustedCommentPosters?: string[];
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

  const reviewEval = evaluateReviewEligibility({
    pr,
    reviewedHeadSha: entry.expectedHeadSha,
    candidateHeadSha: expectedSha,
    attestedCommentId: entry.reviewCommentId,
    expectedCommentDigest: entry.reviewCommentDigest,
    policy: options?.policy,
    authorizedNativeReviewers: options?.authorizedNativeReviewers,
    trustedCommentPosters: options?.trustedCommentPosters,
  });
  reasons.push(...reviewEval.reasons);

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
    reviewEvidence: reviewEval.evidence,
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
    requireVerifiedProtection?: boolean;
    authorizedNativeReviewers?: string[];
    trustedCommentPosters?: string[];
    now?: () => string;
  },
): Promise<{
  ok: boolean;
  results: PreflightResult[];
  observedMainSha: string;
  policy: RepositoryPolicy;
  policyError?: string;
  protectionNotice?: string;
}> {
  const expectedRepo = `${owner}/${repo}`;
  const [observedMainSha, policy] = await Promise.all([
    client.getBranchHeadSha(owner, repo, 'main'),
    client.getRepositoryPolicy(owner, repo),
  ]);

  const methodCheck = validateMergeMethod(options?.mergeMethod ?? DEFAULT_MERGE_METHOD, policy);
  const protectionCheck = evaluateBranchProtectionSafety(policy, requiredChecks);

  let policyError: string | undefined;
  let protectionNotice: string | undefined;

  if (!methodCheck.ok) {
    policyError = methodCheck.reason;
  } else if (policy.protectionAccessible && !protectionCheck.ok) {
    policyError = protectionCheck.reasons.join(' ');
  } else if (!policy.protectionAccessible) {
    if (options?.requireVerifiedProtection) {
      policyError = protectionCheck.reasons.join(' ');
    } else {
      protectionNotice =
        'Read-only token could not read /branches/main/protection (403); live protection invariants (strict checks, enforce_admins, conversation resolution, no bypass) will be verified fail-closed by the copper-turnstile-runtime GitHub App token before any writes.';
    }
  }

  const results: PreflightResult[] = [];
  for (const entry of entries) {
    const pr = await client.getPullRequest(owner, repo, entry.prNumber);
    results.push(
      evaluatePullRequestPreflight(pr, entry, expectedRepo, requiredChecks, {
        policy,
        observedBaseSha: observedMainSha,
        authorizedNativeReviewers: options?.authorizedNativeReviewers,
        trustedCommentPosters: options?.trustedCommentPosters,
        now: options?.now,
      }),
    );
  }

  return {
    ok: !policyError && results.every((r) => r.ok),
    results,
    observedMainSha,
    policy,
    policyError,
    protectionNotice,
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

function isCompareTruncated(comp: CommitComparison): boolean {
  return Boolean(comp.filesTruncated) || (comp.files?.length ?? 0) >= COMPARE_FILES_TRUNCATION_LIMIT;
}

/**
 * Conclusively verifies that a post-update PR HEAD commit is strictly a clean, two-parent
 * main-into-PR mechanical integration merge commit with:
 * - parents === [previousHeadSha, acceptedMainCommit]
 * - non-truncated file diffs (<300 files)
 * - exact commit-count preservation (no extra PR commits)
 * - zero unauthorized source changes or blob hash mismatches
 * - exact recording of any overlapping files (which MUST HOLD under §2C)
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
    const ancestry = await client.compareCommits(owner, repo, parentBaseSha, normalizedCurrentMain);
    if (ancestry.behindBy !== 0 || (ancestry.status !== 'ahead' && ancestry.status !== 'identical')) {
      return {
        ok: false,
        reason: `PR #${prNumber} updated commit ${newHeadSha.slice(0, 12)} second parent ${parentBaseSha.slice(0, 12)} is not an accepted commit on main (${normalizedCurrentMain.slice(0, 12)}).`,
      };
    }
  }

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

  if (
    isCompareTruncated(mergeBaseToPr) ||
    isCompareTruncated(mergeBaseToMain) ||
    isCompareTruncated(prToNewHead) ||
    isCompareTruncated(mainToNewHead)
  ) {
    return {
      ok: false,
      reason: `PR #${prNumber} integration diff exceeded GitHub's ${COMPARE_FILES_TRUNCATION_LIMIT}-file comparison limit; cannot conclusively prove disjoint mechanical integration.`,
    };
  }

  if (
    typeof mergeBaseToPr.totalCommits === 'number' &&
    typeof mainToNewHead.totalCommits === 'number' &&
    mainToNewHead.totalCommits !== mergeBaseToPr.totalCommits + 1
  ) {
    return {
      ok: false,
      reason: `PR #${prNumber} integration commit count relative to main is ${mainToNewHead.totalCommits}, expected ${mergeBaseToPr.totalCommits + 1} (unexpected commits detected).`,
    };
  }

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
    expectations?: WorkflowApprovalExpectations;
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
      {
        expectedWorkflowPath: COORDINATOR_WORKFLOW_PATH,
        expectedEvent: 'workflow_dispatch',
        expectedHeadBranch: 'main',
        ...options.expectations,
      },
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
  authorizedNativeReviewers?: string[];
  trustedCommentPosters?: string[];
  requireWorkflowApprovalRecord?: boolean;
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
  protectionNotice?: string;
}

export interface AdvanceOutcome {
  action:
    | 'ignored'
    | 'merged'
    | 'updating'
    | 'awaiting_checks'
    | 'waiting'
    | 'held'
    | 'completed'
    | 'stopped'
    | 'reconciled';
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

function verifyManifestMatchesState(
  manifest: AuthorizedBatchManifest,
  state: BatchState,
  owner: string,
  repo: string,
): { ok: boolean; reason?: string } {
  const expected = buildAuthorizedManifest({
    owner: manifest.owner,
    repo: manifest.repo,
    workflowRunId: manifest.workflowRunId,
    authorizedBy: manifest.authorizedBy,
    mergeMethod: manifest.mergeMethod,
    integrationPolicy: manifest.integrationPolicy,
    entries: manifest.entries,
  });

  if (manifest.manifestSha256 !== expected.manifestSha256) {
    return {
      ok: false,
      reason: `Authorized manifest artifact for run ${manifest.workflowRunId} failed internal SHA-256 verification.`,
    };
  }

  if (
    manifest.owner.toLowerCase() !== owner.toLowerCase() ||
    manifest.repo.toLowerCase() !== repo.toLowerCase() ||
    manifest.workflowRunId !== state.workflowRunId ||
    manifest.authorizedBy.toLowerCase() !== state.authorizedBy.toLowerCase() ||
    manifest.mergeMethod !== state.mergeMethod ||
    manifest.integrationPolicy !== state.integrationPolicy
  ) {
    return {
      ok: false,
      reason: `Persisted batch ${state.batchId} metadata (repo/actor/method/policy) does not match the immutable manifest attached to approved start run ${state.workflowRunId}.`,
    };
  }

  if (manifest.entries.length !== state.entries.length) {
    return {
      ok: false,
      reason: `Persisted batch ${state.batchId} entry count (${state.entries.length}) does not match immutable start-run manifest (${manifest.entries.length}) for run ${state.workflowRunId}.`,
    };
  }

  for (let i = 0; i < manifest.entries.length; i += 1) {
    const m = manifest.entries[i];
    const s = state.entries[i];
    if (
      m.prNumber !== s.prNumber ||
      m.expectedHeadSha.toLowerCase() !== s.expectedHeadSha.toLowerCase() ||
      (m.reviewCommentId ?? '') !== (s.reviewCommentId ?? '')
    ) {
      return {
        ok: false,
        reason: `Persisted batch ${state.batchId} entry #${i + 1} (PR #${s.prNumber}@${s.expectedHeadSha.slice(0, 12)}${s.reviewCommentId ? `#${s.reviewCommentId}` : ''}) does not match immutable manifest entry (PR #${m.prNumber}@${m.expectedHeadSha.slice(0, 12)}${m.reviewCommentId ? `#${m.reviewCommentId}` : ''}) for approved start run ${state.workflowRunId}.`,
      };
    }
  }

  return { ok: true };
}

async function verifyPersistedBatchAuthority(
  client: GitHubBatchClient,
  state: BatchState,
  options: {
    owner: string;
    repo: string;
    authorizedOwners: string[];
    requireWorkflowApprovalRecord?: boolean;
    isOriginatingStartRun?: boolean;
  },
): Promise<{ ok: boolean; reason?: string }> {
  const {
    owner,
    repo,
    authorizedOwners,
    requireWorkflowApprovalRecord = false,
    isOriginatingStartRun = false,
  } = options;
  const allowed = new Set(authorizedOwners.map((u) => u.toLowerCase()));
  if (!allowed.has(state.authorizedBy.toLowerCase())) {
    return {
      ok: false,
      reason: `Persisted batch ${state.batchId} authorizedBy "${state.authorizedBy}" is not an authorized owner.`,
    };
  }

  const expectedChecksum = computeStateChecksum({
    owner,
    repo,
    entries: state.entries,
    integrationPolicy: state.integrationPolicy,
    mergeMethod: state.mergeMethod,
  });
  if (state.stateChecksum !== expectedChecksum) {
    return {
      ok: false,
      reason: `Persisted batch ${state.batchId} failed stateChecksum consistency check (entries or policy do not match stored checksum).`,
    };
  }

  if (requireWorkflowApprovalRecord && !state.workflowRunId) {
    return {
      ok: false,
      reason: `Persisted batch ${state.batchId} is missing an owner-approved workflowRunId record; refusing unattended execution.`,
    };
  }

  if (state.workflowRunId) {
    if (!client.verifyWorkflowApproval) {
      return {
        ok: false,
        reason: `Persisted batch ${state.batchId} requires live run-approval verification for run ${state.workflowRunId}, but verifyWorkflowApproval is unavailable.`,
      };
    }
    const approval = await client.verifyWorkflowApproval(
      owner,
      repo,
      state.workflowRunId,
      APPROVAL_ENVIRONMENT_NAME,
      authorizedOwners,
      {
        expectedWorkflowPath: COORDINATOR_WORKFLOW_PATH,
        expectedEvent: 'workflow_dispatch',
        expectedHeadBranch: 'main',
        expectedStartApprovalJobName: START_APPROVAL_JOB_NAME,
      },
    );
    if (!approval.ok) {
      return {
        ok: false,
        reason: `Persisted batch ${state.batchId} failed live owner-approval verification for workflow run ${state.workflowRunId}: ${approval.reason}`,
      };
    }

    // Bind persisted state to the immutable manifest artifact uploaded by the approved start run
    // on every continuation/reconciliation run (eliminating mutable-state substitution attacks).
    if (!isOriginatingStartRun && (requireWorkflowApprovalRecord || client.getAuthorizedManifest)) {
      if (!client.getAuthorizedManifest) {
        return {
          ok: false,
          reason: `Persisted batch ${state.batchId} requires immutable start-run manifest verification for run ${state.workflowRunId}, but getAuthorizedManifest is unavailable.`,
        };
      }
      const manifest = await client.getAuthorizedManifest(owner, repo, state.workflowRunId);
      if (!manifest) {
        return {
          ok: false,
          reason: `Missing immutable authorization manifest artifact (${AUTH_MANIFEST_ARTIFACT_PREFIX}-${state.workflowRunId}) for approved start run ${state.workflowRunId}; refusing to trust mutable batch state.`,
        };
      }
      const manifestCheck = verifyManifestMatchesState(manifest, state, owner, repo);
      if (!manifestCheck.ok) {
        return manifestCheck;
      }
    }
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
 * Re-verifies persisted owner run-approval, live branch protection invariants,
 * exact-HEAD independent technical approval, integration provenance, and fresh CI
 * before every mutation. Advances automatically across clean disjoint-file mechanical
 * integration updates under amended §2C, stopping/holding whenever human or Review
 * intervention is genuinely required.
 */
async function driveBatchProgress(
  client: GitHubBatchClient,
  initialState: BatchState,
  options: {
    owner: string;
    repo: string;
    fromReconcile?: boolean;
    isOriginatingStartRun?: boolean;
  } & RuntimePolicyOptions,
): Promise<AdvanceOutcome> {
  const {
    owner,
    repo,
    isOriginatingStartRun = false,
    requiredChecks = DEFAULT_REQUIRED_CHECKS,
    authorizedOwners = DEFAULT_AUTHORIZED_OWNERS,
    authorizedNativeReviewers = DEFAULT_AUTHORIZED_NATIVE_REVIEWERS,
    trustedCommentPosters = DEFAULT_TRUSTED_COMMENT_POSTERS,
    requireWorkflowApprovalRecord = false,
    maxIntegrationUpdatesPerPr = DEFAULT_MAX_INTEGRATION_UPDATES_PER_PR,
    checkTimeoutMs = DEFAULT_CHECK_TIMEOUT_MS,
    checkStartupGraceMs = DEFAULT_CHECK_STARTUP_GRACE_MS,
    updateTimeoutMs = DEFAULT_UPDATE_TIMEOUT_MS,
    now = () => new Date().toISOString(),
  } = options;

  let state = initialState;

  const authority = await verifyPersistedBatchAuthority(client, state, {
    owner,
    repo,
    authorizedOwners,
    requireWorkflowApprovalRecord,
    isOriginatingStartRun,
  });
  if (!authority.ok) {
    const stopped = await stopBatchState(client, owner, repo, state, authority.reason!, now);
    return { action: 'stopped', state: stopped, message: stopped.stopReason! };
  }

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

    // Fail closed if live main branch protection cannot be verified or is unsafe.
    const protectionCheck = evaluateBranchProtectionSafety(policy, requiredChecks);
    if (!protectionCheck.ok) {
      const stopped = await stopBatchState(
        client,
        owner,
        repo,
        state,
        `Branch protection safety verification failed (fail-closed): ${protectionCheck.reasons.join(' ')}`,
        now,
        { observedMainSha: currentMainSha },
      );
      return { action: 'stopped', state: stopped, message: stopped.stopReason! };
    }

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
      const pendingMerge =
        state.pendingOperation?.type === 'merge' && state.pendingOperation.prNumber === entry.prNumber
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
      const pendingUpdate =
        state.pendingOperation?.type === 'update-branch' && state.pendingOperation.prNumber === entry.prNumber
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

      // New commit landed on PR branch — conclusively verify mechanical integration provenance!
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

      // Hold immediately on overlapping files before waiting on CI to fail fast for Independent Review!
      if (provenance.record.overlappingFiles.length > 0 && state.integrationPolicy === 'integration-only') {
        const holdReason = `PR #${entry.prNumber}@${pr.headRefOid.slice(0, 12)} merged overlapping file(s) also changed on main (${provenance.record.overlappingFiles.join(', ')}); under §2C bounded integration-only policy, overlapping file merges require fresh Independent Review.`;
        const nextAction = `Independent Review must inspect overlapping file integration on PR #${entry.prNumber}@${pr.headRefOid.slice(0, 12)} before merge.`;
        const held = await holdBatchState(client, owner, repo, state, holdReason, nextAction, now, {
          activeHeadSha: pr.headRefOid.toLowerCase(),
          observedMainSha: currentMainSha,
          integrationUpdates: [...state.integrationUpdates, provenance.record],
        });
        return { action: 'held', state: held, message: holdReason };
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
      continue;
    }

    // 4. Handle interrupted `merging` state when PR is still OPEN.
    if (state.status === 'merging') {
      const pendingMerge =
        state.pendingOperation?.type === 'merge' && state.pendingOperation.prNumber === entry.prNumber
          ? state.pendingOperation
          : null;

      if (pendingMerge && pr.headRefOid.toLowerCase() === pendingMerge.expectedHeadSha.toLowerCase()) {
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

    // 6. Validate merge method and non-check structural/independent-review eligibility before any mutation.
    const methodCheck = validateMergeMethod(state.mergeMethod, policy);
    if (!methodCheck.ok) {
      const stopped = await stopBatchState(client, owner, repo, state, methodCheck.reason!, now, {
        observedMainSha: currentMainSha,
      });
      return { action: 'stopped', state: stopped, message: stopped.stopReason! };
    }

    const structuralCheck = evaluatePullRequestPreflight(pr, entry, `${owner}/${repo}`, requiredChecks, {
      policy,
      observedBaseSha: currentMainSha,
      expectedHeadOverride: trackedHeadSha,
      allowPendingChecks: state.status === 'awaiting_checks',
      authorizedNativeReviewers,
      trustedCommentPosters,
      now,
    });

    const nonCheckReasons = structuralCheck.reasons.filter(
      (r) => !structuralCheck.verification?.reasons.includes(r),
    );
    if (nonCheckReasons.length > 0) {
      const stopped = await stopBatchState(
        client,
        owner,
        repo,
        state,
        `PR #${entry.prNumber} failed eligibility recheck: ${nonCheckReasons.join(' ')}`,
        now,
        {
          observedMainSha: currentMainSha,
          lastVerification: structuralCheck.verification,
          lastReviewEvidence: structuralCheck.reviewEvidence ?? null,
        },
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
          {
            observedMainSha: currentMainSha,
            lastVerification: structuralCheck.verification,
            lastReviewEvidence: structuralCheck.reviewEvidence ?? null,
          },
        );
        return { action: 'held', state: held, message: holdReason, preflightResult: structuralCheck };
      }

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
        lastReviewEvidence: structuralCheck.reviewEvidence ?? null,
        nextAction: `Updating behind PR #${entry.prNumber}@${trackedHeadSha.slice(0, 12)} against main@${currentMainSha.slice(0, 12)}.`,
      };
      await client.saveBatchState(owner, repo, updatingState);

      const guardBeforeApi = await checkConcurrentStateGuard(client, owner, repo, state.batchId, pendingRevision);
      if (!guardBeforeApi.ok) {
        return { action: 'ignored', state: guardBeforeApi.latest, message: guardBeforeApi.reason! };
      }

      try {
        await client.updatePullRequestBranch(owner, repo, entry.prNumber, trackedHeadSha);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        let recheckPr: PullRequestSnapshot | null = null;
        try {
          recheckPr = await client.getPullRequest(owner, repo, entry.prNumber);
        } catch {
          // Preserve write-ahead updating state for watchdog reconcile.
        }

        if (recheckPr && recheckPr.state === 'OPEN' && recheckPr.headRefOid.toLowerCase() !== trackedHeadSha) {
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
          message: `Branch update response for PR #${entry.prNumber} was indeterminate (${reason}). Write-ahead status=updating preserved; synchronize/reconcile will recover without duplicate update.`,
        };
      }

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
      state.status === 'awaiting_checks' && !Number.isNaN(elapsedWaitMs) && elapsedWaitMs < checkStartupGraceMs;

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

    // 9. All fresh checks PASSED on current main! Enforce §2C integration policy & provenance invariants.
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

      if (state.integrationPolicy === 'hold-on-update') {
        const holdReason = `PR #${entry.prNumber} was cleanly updated from reviewed SHA ${entry.expectedHeadSha.slice(0, 12)} to integration SHA ${trackedHeadSha.slice(0, 12)} (merging main@${latestUpdate.mergedBaseSha.slice(0, 12)}) and passed ordinary PR CI; holding because batch was started with hold-on-update policy.`;
        const nextAction = `Independent Review and Aaron: inspect PR #${entry.prNumber}@${trackedHeadSha.slice(0, 12)}, merge or re-authorize remaining entries with updated SHA, or abort this held batch.`;
        const held = await holdBatchState(client, owner, repo, state, holdReason, nextAction, now, {
          observedMainSha: currentMainSha,
          lastVerification: verification,
          lastReviewEvidence: structuralCheck.reviewEvidence ?? null,
        });
        return { action: 'held', state: held, message: holdReason };
      }

      const overlapping = updateRecords.flatMap((u) => u.overlappingFiles);
      if (overlapping.length > 0) {
        const uniqueOverlapping = [...new Set(overlapping)].sort();
        const holdReason = `PR #${entry.prNumber}@${trackedHeadSha.slice(0, 12)} modified file(s) also changed on main (${uniqueOverlapping.join(', ')}); under §2C bounded integration-only policy, overlapping file merges require fresh Independent Review.`;
        const nextAction = `Independent Review must review overlapping file integration on PR #${entry.prNumber}@${trackedHeadSha.slice(0, 12)} before merge.`;
        const held = await holdBatchState(client, owner, repo, state, holdReason, nextAction, now, {
          observedMainSha: currentMainSha,
          lastVerification: verification,
          lastReviewEvidence: structuralCheck.reviewEvidence ?? null,
        });
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
      lastReviewEvidence: structuralCheck.reviewEvidence ?? null,
      nextAction: `Executing protected direct ${state.mergeMethod} merge of PR #${entry.prNumber}@${trackedHeadSha.slice(0, 12)} into main@${currentMainSha.slice(0, 12)}.`,
    };
    await client.saveBatchState(owner, repo, mergingState);

    const guardBeforeMerge = await checkConcurrentStateGuard(client, owner, repo, state.batchId, pendingRevision);
    if (!guardBeforeMerge.ok) {
      return { action: 'ignored', state: guardBeforeMerge.latest, message: guardBeforeMerge.reason! };
    }

    let mergeResult: { sha: string; merged: boolean; message: string };
    try {
      mergeResult = await client.mergePullRequest(owner, repo, entry.prNumber, trackedHeadSha, state.mergeMethod);
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
        state = mergingState;
        continue;
      }

      if (
        recheckPr?.state === 'OPEN' &&
        recheckPr.headRefOid.toLowerCase() === trackedHeadSha &&
        recheckMainSha &&
        (recheckMainSha.toLowerCase() !== currentMainSha.toLowerCase() || recheckPr.mergeStateStatus === 'BEHIND') &&
        isBaseModifiedOrBehindError(err)
      ) {
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
    workflowRunId,
    workflowRunUrl,
    requiredChecks = DEFAULT_REQUIRED_CHECKS,
    authorizedOwners = DEFAULT_AUTHORIZED_OWNERS,
    authorizedNativeReviewers = DEFAULT_AUTHORIZED_NATIVE_REVIEWERS,
    trustedCommentPosters = DEFAULT_TRUSTED_COMMENT_POSTERS,
    requireWorkflowApprovalRecord = false,
    maxIntegrationUpdatesPerPr = DEFAULT_MAX_INTEGRATION_UPDATES_PER_PR,
    checkTimeoutMs = DEFAULT_CHECK_TIMEOUT_MS,
    checkStartupGraceMs = DEFAULT_CHECK_STARTUP_GRACE_MS,
    updateTimeoutMs = DEFAULT_UPDATE_TIMEOUT_MS,
    now = () => new Date().toISOString(),
  } = options;

  let approvedBy: string | undefined;
  if (!dryRun) {
    if (requireWorkflowApprovalRecord && !workflowRunId) {
      return {
        ok: false,
        dryRun: false,
        action: 'stopped',
        preflightResults: [],
        error: 'Authorization failed (fail-closed): missing GITHUB_RUN_ID for owner environment approval verification.',
      };
    }
    const auth = await verifyOwnerAuthorization(client, {
      owner,
      repo,
      actor: authorizedBy,
      workflowRunId,
      authorizedOwners,
      expectations: {
        expectedStartApprovalJobName: START_APPROVAL_JOB_NAME,
      },
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
    requireVerifiedProtection: !dryRun,
    authorizedNativeReviewers,
    trustedCommentPosters,
    now,
  });

  if (preflight.policyError) {
    return {
      ok: false,
      dryRun,
      action: 'stopped',
      preflightResults: preflight.results,
      error: preflight.policyError,
      protectionNotice: preflight.protectionNotice,
    };
  }

  if (!preflight.ok) {
    return {
      ok: false,
      dryRun,
      action: 'stopped',
      preflightResults: preflight.results,
      error: 'Preflight failed for one or more entries. No PRs were updated or merged.',
      protectionNotice: preflight.protectionNotice,
    };
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      action: 'dry-run',
      preflightResults: preflight.results,
      protectionNotice: preflight.protectionNotice,
      message: `Dry-run passed for ${entries.length} PR(s) against main@${preflight.observedMainSha.slice(0, 12)} (policy: ${integrationPolicy}). Zero writes were performed.${preflight.protectionNotice ? ` Note: ${preflight.protectionNotice}` : ''}`,
    };
  }

  const mergeMethod = rawMergeMethod.trim().toLowerCase() as MergeMethod;
  // Capture verified comment body digests at start time to detect post-authorization edits.
  const boundEntries: BatchEntry[] = entries.map((entry, idx) => {
    const digest = preflight.results[idx]?.reviewEvidence?.commentDigest;
    return digest ? { ...entry, reviewCommentDigest: digest } : { ...entry };
  });
  const firstEntry = boundEntries[0];
  const createdAt = now();
  const initialRevision = (existingState?.revision ?? 0) + 1;
  const stateChecksum = computeStateChecksum({
    owner,
    repo,
    entries: boundEntries,
    integrationPolicy,
    mergeMethod,
  });

  const initialState: BatchState = {
    version: 2,
    revision: initialRevision,
    batchId: workflowRunId ? `batch-run-${workflowRunId}` : `batch-${createdAt.replace(/[:.]/g, '-')}`,
    stateChecksum,
    status: 'running',
    createdAt,
    updatedAt: createdAt,
    authorizedBy,
    approvedBy,
    integrationPolicy,
    mergeMethod,
    workflowRunId,
    workflowRunUrl,
    entries: boundEntries,
    nextIndex: 0,
    activePrNumber: firstEntry.prNumber,
    activeReviewedHeadSha: firstEntry.expectedHeadSha,
    activeHeadSha: firstEntry.expectedHeadSha,
    observedMainSha: preflight.observedMainSha,
    pendingOperation: null,
    awaitingChecksSince: null,
    integrationUpdates: [],
    lastVerification: preflight.results[0]?.verification ?? null,
    lastReviewEvidence: preflight.results[0]?.reviewEvidence ?? null,
    completedPrNumbers: [],
    completedMerges: [],
    nextAction: `Evaluate PR #${firstEntry.prNumber}@${firstEntry.expectedHeadSha.slice(0, 12)} against main@${preflight.observedMainSha.slice(0, 12)}.`,
  };

  await client.saveBatchState(owner, repo, initialState);

  const outcome = await driveBatchProgress(client, initialState, {
    owner,
    repo,
    isOriginatingStartRun: true,
    requiredChecks,
    authorizedOwners,
    authorizedNativeReviewers,
    trustedCommentPosters,
    requireWorkflowApprovalRecord,
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
 * Handles `pull_request_target: closed` events for the active batch.
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
 * Handles `pull_request_target: synchronize` events (treated purely as a wakeup;
 * re-reads live PR, commits, provenance, checks, and reviews from GitHub API).
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
 * Handles `workflow_run: completed` wakeups from ordinary PR CI workflows.
 * Never trusts workflow_run payloads or artifacts; treats the event strictly as a
 * wakeup signal and re-reads live PR, main, checks, reviews, and protection from GitHub API.
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
      message: `Workflow completion wakeup for ${headSha.slice(0, 12)} does not match active PR #${state.activePrNumber} HEAD ${state.activeHeadSha.slice(0, 12)}.`,
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

  const completedPrNumbers = [...abortIntentState.completedPrNumbers];
  const completedMerges = [...abortIntentState.completedMerges];
  if (
    previousStage === 'merging' &&
    abortIntentState.activePrNumber !== null &&
    abortIntentState.pendingOperation?.type === 'merge'
  ) {
    try {
      const activePr = await client.getPullRequest(owner, repo, abortIntentState.activePrNumber);
      if (activePr?.state === 'MERGED' && activePr.mergeCommit?.oid && !completedPrNumbers.includes(activePr.number)) {
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
    lines.push('| PR | Reviewed SHA | Independent Review | Status | Behind `main` | Details |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const res of options.preflightResults) {
      const status = res.ok ? 'PASS' : 'FAIL';
      const reviewCol = res.reviewEvidence
        ? `${res.reviewEvidence.source} (${res.reviewEvidence.reviewer})`
        : 'Missing / Blocked';
      const behind = res.behindMain ? 'Yes (auto-update when active)' : 'No (current)';
      const details = res.ok
        ? res.behindMain
          ? 'Eligible; will update branch & await ordinary PR CI when active'
          : 'Eligible for direct protected merge without branch update'
        : res.reasons.join('; ');
      lines.push(
        `| #${res.entry.prNumber} | \`${res.entry.expectedHeadSha.slice(0, 12)}\` | ${reviewCol} | ${status} | ${behind} | ${details} |`,
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
        lines.push(`- **Environment approved by:** ${s.approvedBy} (run \`${s.workflowRunId ?? 'local'}\`)`);
      }
      lines.push(`- **Merge method:** \`${s.mergeMethod}\``);
      lines.push(`- **Integration policy:** \`${s.integrationPolicy}\``);
      if (s.observedMainSha) {
        lines.push(`- **Observed \`main\` SHA:** \`${s.observedMainSha.slice(0, 12)}\``);
      }
      lines.push(
        `- **Active PR:** ${s.activePrNumber ? `#${s.activePrNumber} (reviewed \`${s.activeReviewedHeadSha?.slice(0, 12)}\`, current \`${s.activeHeadSha?.slice(0, 12)}\`)` : 'None'}`,
      );
      lines.push(`- **Completed merges:** ${formatCompletedSummary(s.completedMerges, s.completedPrNumbers)}`);
      if (s.lastReviewEvidence) {
        lines.push(
          `- **Verified Independent Review:** \`${s.lastReviewEvidence.source}\` by ${s.lastReviewEvidence.reviewer} on \`${s.lastReviewEvidence.reviewedHeadSha.slice(0, 12)}\``,
        );
      }
      if (s.integrationUpdates.length > 0) {
        lines.push(
          `- **Integration updates:** ${s.integrationUpdates
            .map(
              (u) =>
                `#${u.prNumber} (\`${u.fromHeadSha.slice(0, 12)}\` -> \`${u.toHeadSha.slice(0, 12)}\` + \`main@${u.mergedBaseSha.slice(0, 12)}\`${u.overlappingFiles.length > 0 ? `, overlapping: ${u.overlappingFiles.join(', ')}` : ', disjoint'})`,
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
