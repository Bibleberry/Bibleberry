export const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;
export const DEFAULT_REQUIRED_CHECKS = [
  'Build reader application',
  'Verify Sanity Studio',
];
export const DEFAULT_AUTHORIZED_OWNERS = ['ContraPhilosophy'];
export const APPROVAL_ENVIRONMENT_NAME = 'merge-queue-approval';

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
}

export interface PullRequestSnapshot {
  id: string;
  number: number;
  url: string;
  title: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED' | string;
  isDraft: boolean;
  baseRefName: string;
  baseRepository: { nameWithOwner: string } | null;
  headRefOid: string;
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
  reviewThreads: {
    totalCount?: number;
    pageInfo?: { hasNextPage: boolean };
    nodes: Array<{ isResolved: boolean }>;
  };
  statusCheckRollup: {
    state: 'ERROR' | 'EXPECTED' | 'FAILURE' | 'PENDING' | 'SUCCESS' | string;
    contexts: {
      nodes: StatusContextNode[];
    };
  } | null;
}

export interface PreflightResult {
  ok: boolean;
  entry: BatchEntry;
  reasons: string[];
  pr?: PullRequestSnapshot;
}

export interface BatchState {
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

export interface ApprovalVerificationResult {
  ok: boolean;
  reason?: string;
  approvedBy?: string;
}

export interface GitHubBatchClient {
  getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequestSnapshot | null>;
  enqueuePullRequest(pullRequestId: string, expectedHeadOid: string): Promise<{ queueEntryId?: string }>;
  dequeuePullRequest(pullRequestId: string): Promise<void>;
  getBatchState(owner: string, repo: string): Promise<BatchState | null>;
  saveBatchState(owner: string, repo: string, state: BatchState): Promise<void>;
  verifyWorkflowApproval?(
    owner: string,
    repo: string,
    runId: string,
    environmentName: string,
    authorizedOwners: string[],
  ): Promise<ApprovalVerificationResult>;
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

// SKIPPED alone must never satisfy a required check; an earlier SKIPPED Draft run is only
// acceptable when accompanied by an actual passing execution (SUCCESS or NEUTRAL).
const PASSING_CHECK_CONCLUSIONS = new Set(['SUCCESS', 'NEUTRAL']);

function hasPassingRequiredCheck(
  contexts: StatusContextNode[],
  checkName: string,
): { present: boolean; passing: boolean; skippedOnly: boolean } {
  const matchingChecks = contexts.filter((ctx) => {
    if (ctx.__typename === 'StatusContext' || (!ctx.name && ctx.context)) {
      return ctx.context === checkName;
    }
    return ctx.name === checkName;
  });

  if (matchingChecks.length === 0) {
    return { present: false, passing: false, skippedOnly: false };
  }

  const anyPassing = matchingChecks.some((ctx) => {
    if (ctx.__typename === 'StatusContext' || (!ctx.name && ctx.context)) {
      return ctx.state === 'SUCCESS';
    }
    return ctx.status === 'COMPLETED' && PASSING_CHECK_CONCLUSIONS.has(ctx.conclusion ?? '');
  });

  const skippedOnly =
    !anyPassing &&
    matchingChecks.every(
      (ctx) => ctx.status === 'COMPLETED' && ctx.conclusion === 'SKIPPED',
    );

  return { present: true, passing: anyPassing, skippedOnly };
}

/**
 * Evaluates whether a pull request satisfies all pre-queue policy, revision, and check requirements.
 * Branch-out-of-date alone (`mergeStateStatus === 'BEHIND'` with `mergeable === 'MERGEABLE'`)
 * is intentionally allowed so GitHub's native merge queue tests the integration commit via `merge_group`.
 */
export function evaluatePullRequestPreflight(
  pr: PullRequestSnapshot | null,
  entry: BatchEntry,
  expectedRepo: string,
  requiredChecks: string[] = DEFAULT_REQUIRED_CHECKS,
): PreflightResult {
  const reasons: string[] = [];

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

  if (pr.headRefOid.toLowerCase() !== entry.expectedHeadSha.toLowerCase()) {
    reasons.push(
      `PR #${entry.prNumber} head SHA is ${pr.headRefOid}, which does not match authorized SHA ${entry.expectedHeadSha}.`,
    );
  }

  if (pr.isInMergeQueue) {
    reasons.push(`PR #${entry.prNumber} is already in the merge queue.`);
  }

  if (pr.mergeable === 'CONFLICTING' || pr.mergeStateStatus === 'DIRTY') {
    reasons.push(`PR #${entry.prNumber} has merge conflicts (${pr.mergeable}/${pr.mergeStateStatus}) and must be resolved.`);
  } else if (pr.mergeable === 'UNKNOWN') {
    reasons.push(`PR #${entry.prNumber} mergeability is UNKNOWN; wait for GitHub to finish computing mergeability.`);
  }

  if (pr.reviewDecision === 'CHANGES_REQUESTED') {
    reasons.push(`PR #${entry.prNumber} has requested changes (reviewDecision=CHANGES_REQUESTED).`);
  } else if (pr.reviewDecision === 'REVIEW_REQUIRED') {
    reasons.push(`PR #${entry.prNumber} requires an approving review (reviewDecision=REVIEW_REQUIRED).`);
  }

  const unresolvedCount = pr.reviewThreads.nodes.filter((thread) => !thread.isResolved).length;
  if (unresolvedCount > 0) {
    reasons.push(`PR #${entry.prNumber} has ${unresolvedCount} unresolved review conversation(s).`);
  } else if (pr.reviewThreads.pageInfo?.hasNextPage) {
    reasons.push(`PR #${entry.prNumber} has more than ${pr.reviewThreads.nodes.length} review threads; cannot verify all are resolved.`);
  }

  if (!pr.statusCheckRollup) {
    reasons.push(`PR #${entry.prNumber} has no status checks reported.`);
  } else {
    if (pr.statusCheckRollup.state !== 'SUCCESS') {
      reasons.push(
        `PR #${entry.prNumber} statusCheckRollup state is ${pr.statusCheckRollup.state}, expected SUCCESS.`,
      );
    }

    const contexts = pr.statusCheckRollup.contexts.nodes;
    for (const checkName of requiredChecks) {
      const check = hasPassingRequiredCheck(contexts, checkName);
      if (!check.present) {
        reasons.push(`PR #${entry.prNumber} is missing required check "${checkName}".`);
      } else if (!check.passing) {
        reasons.push(
          check.skippedOnly
            ? `PR #${entry.prNumber} required check "${checkName}" only has SKIPPED runs and no passing execution.`
            : `PR #${entry.prNumber} required check "${checkName}" did not pass.`,
        );
      }
    }
  }

  return {
    ok: reasons.length === 0,
    entry,
    reasons,
    pr,
  };
}

export async function runPreflight(
  client: GitHubBatchClient,
  owner: string,
  repo: string,
  entries: BatchEntry[],
  requiredChecks: string[] = DEFAULT_REQUIRED_CHECKS,
): Promise<{ ok: boolean; results: PreflightResult[] }> {
  const expectedRepo = `${owner}/${repo}`;
  const results: PreflightResult[] = [];

  for (const entry of entries) {
    const pr = await client.getPullRequest(owner, repo, entry.prNumber);
    results.push(evaluatePullRequestPreflight(pr, entry, expectedRepo, requiredChecks));
  }

  return {
    ok: results.every((r) => r.ok),
    results,
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
): Promise<{ ok: boolean; reason?: string }> {
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
  }

  return { ok: true };
}

export interface StartBatchOptions {
  owner: string;
  repo: string;
  entries: BatchEntry[];
  authorizedBy: string;
  dryRun?: boolean;
  workflowRunId?: string;
  workflowRunUrl?: string;
  requiredChecks?: string[];
  authorizedOwners?: string[];
  now?: () => string;
}

export interface StartBatchOutcome {
  ok: boolean;
  dryRun: boolean;
  preflightResults: PreflightResult[];
  state?: BatchState;
  error?: string;
}

function isDefinitiveEnqueueRejection(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /GitHub GraphQL error:/i.test(msg) ||
    /GitHub GraphQL HTTP 4(?:00|01|03|04|22)\b/i.test(msg)
  );
}

interface EnqueueErrorResolution {
  outcome: 'enqueued_remotely' | 'merged_remotely' | 'stopped' | 'indeterminate';
  state: BatchState;
  message: string;
}

/**
 * Reconciles an enqueuePullRequest exception against live GitHub PR state.
 * Never discards `enqueuing` state on timeouts/network errors or when the PR actually entered the queue.
 */
async function resolveEnqueueError(
  client: GitHubBatchClient,
  options: {
    owner: string;
    repo: string;
    pendingState: BatchState;
    entry: BatchEntry;
    error: unknown;
    now: () => string;
  },
): Promise<EnqueueErrorResolution> {
  const { owner, repo, pendingState, entry, error, now } = options;
  const reason = error instanceof Error ? error.message : String(error);

  let recheckPr: PullRequestSnapshot | null = null;
  let recheckError: string | null = null;
  try {
    recheckPr = await client.getPullRequest(owner, repo, entry.prNumber);
  } catch (err) {
    recheckError = err instanceof Error ? err.message : String(err);
  }

  if (recheckPr?.isInMergeQueue) {
    const runningState: BatchState = {
      ...pendingState,
      status: 'running',
      updatedAt: now(),
    };
    try {
      await client.saveBatchState(owner, repo, runningState);
      return {
        outcome: 'enqueued_remotely',
        state: runningState,
        message: `PR #${entry.prNumber}@${entry.expectedHeadSha} is in the merge queue despite client error (${reason}); confirmed status=running.`,
      };
    } catch (saveErr) {
      const saveReason = saveErr instanceof Error ? saveErr.message : String(saveErr);
      return {
        outcome: 'enqueued_remotely',
        state: pendingState,
        message: `PR #${entry.prNumber}@${entry.expectedHeadSha} is in the merge queue despite client error (${reason}); write-ahead state preserved (status=enqueuing, confirm save error: ${saveReason}).`,
      };
    }
  }

  if (recheckPr?.state === 'MERGED') {
    const runningState: BatchState = {
      ...pendingState,
      status: 'running',
      updatedAt: now(),
    };
    try {
      await client.saveBatchState(owner, repo, runningState);
    } catch {
      // Write-ahead state remains in storage with activePrNumber = entry.prNumber.
    }
    return {
      outcome: 'merged_remotely',
      state: runningState,
      message: `PR #${entry.prNumber} already merged after client error (${reason}).`,
    };
  }

  if (recheckPr && recheckPr.state === 'OPEN' && !recheckPr.isInMergeQueue && isDefinitiveEnqueueRejection(error)) {
    const stoppedState: BatchState = {
      ...pendingState,
      status: 'stopped',
      updatedAt: now(),
      activePrNumber: null,
      activeHeadSha: null,
      stopReason: `Failed to enqueue PR #${entry.prNumber}: ${reason}`,
    };
    try {
      await client.saveBatchState(owner, repo, stoppedState);
    } catch {
      // Preserve failure reporting even if rollback save fails.
    }
    return {
      outcome: 'stopped',
      state: stoppedState,
      message: stoppedState.stopReason!,
    };
  }

  const detail = recheckError
    ? `live PR verification failed (${recheckError})`
    : `error was indeterminate (${reason}) and PR state is ${recheckPr?.state ?? 'unknown'}`;
  return {
    outcome: 'indeterminate',
    state: pendingState,
    message: `Enqueue outcome for PR #${entry.prNumber} is indeterminate (${detail}). Preserved status=enqueuing with activePrNumber=#${entry.prNumber}; reconcile will verify without duplicate enqueueing.`,
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
    workflowRunId,
    workflowRunUrl,
    requiredChecks = DEFAULT_REQUIRED_CHECKS,
    authorizedOwners = DEFAULT_AUTHORIZED_OWNERS,
    now = () => new Date().toISOString(),
  } = options;

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
        preflightResults: [],
        error: `Authorization failed (fail-closed): ${auth.reason}`,
      };
    }
  }

  const existingState = await client.getBatchState(owner, repo);
  if (existingState?.status === 'running' || existingState?.status === 'enqueuing') {
    return {
      ok: false,
      dryRun,
      preflightResults: [],
      state: existingState,
      error: `Another batch (${existingState.batchId}) is already ${existingState.status} (active PR #${existingState.activePrNumber}). Run reconcile, abort, or wait for it to finish before starting a new batch.`,
    };
  }

  const preflight = await runPreflight(client, owner, repo, entries, requiredChecks);
  if (!preflight.ok) {
    return {
      ok: false,
      dryRun,
      preflightResults: preflight.results,
      error: 'Preflight failed for one or more entries. No PRs were enqueued.',
    };
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      preflightResults: preflight.results,
    };
  }

  const firstEntry = entries[0];
  // Re-fetch immediately before enqueueing to narrow the race window against new pushes.
  const freshPr = await client.getPullRequest(owner, repo, firstEntry.prNumber);
  const freshCheck = evaluatePullRequestPreflight(
    freshPr,
    firstEntry,
    `${owner}/${repo}`,
    requiredChecks,
  );
  if (!freshCheck.ok || !freshPr) {
    return {
      ok: false,
      dryRun: false,
      preflightResults: [freshCheck],
      error: `Pre-enqueue recheck failed for PR #${firstEntry.prNumber}: ${freshCheck.reasons.join(' ')}`,
    };
  }

  const createdAt = now();
  const pendingState: BatchState = {
    version: 1,
    revision: (existingState?.revision ?? 0) + 1,
    batchId: `batch-${createdAt.replace(/[:.]/g, '-')}`,
    status: 'enqueuing',
    createdAt,
    updatedAt: createdAt,
    authorizedBy,
    workflowRunId,
    workflowRunUrl,
    entries,
    nextIndex: 0,
    activePrNumber: firstEntry.prNumber,
    activeHeadSha: firstEntry.expectedHeadSha,
    completedPrNumbers: [],
  };

  // Write-ahead state before enqueueing so a post-enqueue save failure never loses track of an enqueued PR.
  await client.saveBatchState(owner, repo, pendingState);

  try {
    await client.enqueuePullRequest(freshPr.id, firstEntry.expectedHeadSha);
  } catch (err) {
    const resolved = await resolveEnqueueError(client, {
      owner,
      repo,
      pendingState,
      entry: firstEntry,
      error: err,
      now,
    });
    if (resolved.outcome === 'enqueued_remotely') {
      return {
        ok: true,
        dryRun: false,
        preflightResults: preflight.results,
        state: resolved.state,
      };
    }
    if (resolved.outcome === 'merged_remotely') {
      const advanced = await advanceBatchOnPullRequestClosed(client, {
        owner,
        repo,
        prNumber: firstEntry.prNumber,
        merged: true,
        requiredChecks,
        now,
      });
      return {
        ok: advanced.action !== 'stopped',
        dryRun: false,
        preflightResults: preflight.results,
        state: advanced.state ?? resolved.state,
        error: advanced.action === 'stopped' ? advanced.message : undefined,
      };
    }
    return {
      ok: false,
      dryRun: false,
      preflightResults: preflight.results,
      state: resolved.state,
      error: resolved.message,
    };
  }

  const runningState: BatchState = {
    ...pendingState,
    status: 'running',
    updatedAt: now(),
  };

  try {
    await client.saveBatchState(owner, repo, runningState);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      dryRun: false,
      preflightResults: preflight.results,
      state: pendingState,
      error: `PR #${firstEntry.prNumber} was enqueued with write-ahead state saved (status=enqueuing), but confirming status=running failed: ${reason}. Run reconcile to recover.`,
    };
  }

  return {
    ok: true,
    dryRun: false,
    preflightResults: preflight.results,
    state: runningState,
  };
}

export interface AdvanceOutcome {
  action: 'ignored' | 'enqueued' | 'completed' | 'stopped' | 'reconciled';
  state: BatchState | null;
  message: string;
  preflightResult?: PreflightResult;
}

export async function advanceBatchOnPullRequestClosed(
  client: GitHubBatchClient,
  options: {
    owner: string;
    repo: string;
    prNumber: number;
    merged: boolean;
    requiredChecks?: string[];
    now?: () => string;
  },
): Promise<AdvanceOutcome> {
  const {
    owner,
    repo,
    prNumber,
    merged,
    requiredChecks = DEFAULT_REQUIRED_CHECKS,
    now = () => new Date().toISOString(),
  } = options;

  const state = await client.getBatchState(owner, repo);
  if (!state || (state.status !== 'running' && state.status !== 'enqueuing')) {
    return {
      action: 'ignored',
      state,
      message: 'No active merge-queue batch is running.',
    };
  }

  if (state.abortRequestedBy) {
    return {
      action: 'stopped',
      state,
      message: `Batch ${state.batchId} has a pending abort from ${state.abortRequestedBy}; refusing to advance.`,
    };
  }

  if (state.activePrNumber !== prNumber) {
    return {
      action: 'ignored',
      state,
      message: `Closed PR #${prNumber} is not the active batch PR (#${state.activePrNumber}).`,
    };
  }

  if (!merged) {
    const stoppedState: BatchState = {
      ...state,
      status: 'stopped',
      updatedAt: now(),
      activePrNumber: null,
      activeHeadSha: null,
      stopReason: `PR #${prNumber} was closed without merging. Remaining entries were not enqueued.`,
    };
    await client.saveBatchState(owner, repo, stoppedState);
    return {
      action: 'stopped',
      state: stoppedState,
      message: stoppedState.stopReason!,
    };
  }

  const completedPrNumbers = state.completedPrNumbers.includes(prNumber)
    ? [...state.completedPrNumbers]
    : [...state.completedPrNumbers, prNumber];
  const nextIndex = state.nextIndex + 1;

  if (nextIndex >= state.entries.length) {
    const completedState: BatchState = {
      ...state,
      status: 'completed',
      updatedAt: now(),
      nextIndex,
      activePrNumber: null,
      activeHeadSha: null,
      completedPrNumbers,
    };
    await client.saveBatchState(owner, repo, completedState);
    return {
      action: 'completed',
      state: completedState,
      message: `Batch ${state.batchId} completed: all ${state.entries.length} authorized PR(s) merged.`,
    };
  }

  const nextEntry = state.entries[nextIndex];
  const freshPr = await client.getPullRequest(owner, repo, nextEntry.prNumber);
  const preflightResult = evaluatePullRequestPreflight(
    freshPr,
    nextEntry,
    `${owner}/${repo}`,
    requiredChecks,
  );

  if (!preflightResult.ok || !freshPr) {
    const stoppedState: BatchState = {
      ...state,
      status: 'stopped',
      updatedAt: now(),
      nextIndex,
      activePrNumber: null,
      activeHeadSha: null,
      completedPrNumbers,
      stopReason: `Next PR #${nextEntry.prNumber} failed pre-enqueue verification: ${preflightResult.reasons.join(' ')}`,
    };
    await client.saveBatchState(owner, repo, stoppedState);
    return {
      action: 'stopped',
      state: stoppedState,
      message: stoppedState.stopReason!,
      preflightResult,
    };
  }

  const pendingRevision = (state.revision ?? 0) + 1;
  const pendingNextState: BatchState = {
    ...state,
    revision: pendingRevision,
    status: 'enqueuing',
    updatedAt: now(),
    nextIndex,
    activePrNumber: nextEntry.prNumber,
    activeHeadSha: nextEntry.expectedHeadSha,
    completedPrNumbers,
  };

  // Write-ahead before enqueueing so interrupted confirmation can be reconciled cleanly.
  await client.saveBatchState(owner, repo, pendingNextState);

  // Re-read state immediately before calling enqueuePullRequest to block post-abort or stale-revision races.
  const latestBeforeEnqueue = await client.getBatchState(owner, repo);
  if (
    !latestBeforeEnqueue ||
    latestBeforeEnqueue.batchId !== state.batchId ||
    latestBeforeEnqueue.status === 'aborted' ||
    latestBeforeEnqueue.status === 'stopped' ||
    Boolean(latestBeforeEnqueue.abortRequestedBy) ||
    (latestBeforeEnqueue.revision ?? 0) !== pendingRevision
  ) {
    return {
      action: 'ignored',
      state: latestBeforeEnqueue,
      message: `Aborted enqueue of PR #${nextEntry.prNumber}: batch state changed concurrently (status=${latestBeforeEnqueue?.status ?? 'none'}, abortRequestedBy=${latestBeforeEnqueue?.abortRequestedBy ?? 'none'}).`,
    };
  }

  try {
    await client.enqueuePullRequest(freshPr.id, nextEntry.expectedHeadSha);
  } catch (err) {
    const resolved = await resolveEnqueueError(client, {
      owner,
      repo,
      pendingState: pendingNextState,
      entry: nextEntry,
      error: err,
      now,
    });
    if (resolved.outcome === 'enqueued_remotely') {
      return {
        action: 'enqueued',
        state: resolved.state,
        message: resolved.message,
        preflightResult,
      };
    }
    if (resolved.outcome === 'merged_remotely') {
      return advanceBatchOnPullRequestClosed(client, {
        owner,
        repo,
        prNumber: nextEntry.prNumber,
        merged: true,
        requiredChecks,
        now,
      });
    }
    return {
      action: 'stopped',
      state: resolved.state,
      message: resolved.message,
      preflightResult,
    };
  }

  const runningNextState: BatchState = {
    ...pendingNextState,
    revision: pendingRevision + 1,
    status: 'running',
    updatedAt: now(),
  };

  try {
    await client.saveBatchState(owner, repo, runningNextState);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      action: 'enqueued',
      state: pendingNextState,
      message: `PR #${prNumber} merged and PR #${nextEntry.prNumber}@${nextEntry.expectedHeadSha} was enqueued with write-ahead state saved (status=enqueuing), but confirming status=running failed: ${reason}.`,
      preflightResult,
    };
  }

  return {
    action: 'enqueued',
    state: runningNextState,
    message: `PR #${prNumber} merged; enqueued next authorized PR #${nextEntry.prNumber}@${nextEntry.expectedHeadSha}.`,
    preflightResult,
  };
}

export async function reconcileBatch(
  client: GitHubBatchClient,
  options: {
    owner: string;
    repo: string;
    requiredChecks?: string[];
    now?: () => string;
  },
): Promise<AdvanceOutcome> {
  const { owner, repo, requiredChecks = DEFAULT_REQUIRED_CHECKS, now = () => new Date().toISOString() } = options;
  const state = await client.getBatchState(owner, repo);

  if (!state || (state.status !== 'running' && state.status !== 'enqueuing')) {
    return {
      action: 'ignored',
      state,
      message: `No active or interrupted batch to reconcile (status=${state?.status ?? 'none'}).`,
    };
  }

  if (state.abortRequestedBy) {
    return {
      action: 'ignored',
      state,
      message: `Batch ${state.batchId} has a pending abort from ${state.abortRequestedBy}; skipping reconciliation.`,
    };
  }

  if (state.activePrNumber === null) {
    const stoppedState: BatchState = {
      ...state,
      status: 'stopped',
      updatedAt: now(),
      stopReason: 'Interrupted batch had no active PR number; stopped safely.',
    };
    await client.saveBatchState(owner, repo, stoppedState);
    return {
      action: 'stopped',
      state: stoppedState,
      message: stoppedState.stopReason!,
    };
  }

  const activePr = await client.getPullRequest(owner, repo, state.activePrNumber);
  if (!activePr) {
    const stoppedState: BatchState = {
      ...state,
      status: 'stopped',
      updatedAt: now(),
      activePrNumber: null,
      activeHeadSha: null,
      stopReason: `Active PR #${state.activePrNumber} could not be fetched during reconciliation.`,
    };
    await client.saveBatchState(owner, repo, stoppedState);
    return {
      action: 'stopped',
      state: stoppedState,
      message: stoppedState.stopReason!,
    };
  }

  if (activePr.state === 'MERGED') {
    return advanceBatchOnPullRequestClosed(client, {
      owner,
      repo,
      prNumber: state.activePrNumber,
      merged: true,
      requiredChecks,
      now,
    });
  }

  if (activePr.state === 'CLOSED') {
    return advanceBatchOnPullRequestClosed(client, {
      owner,
      repo,
      prNumber: state.activePrNumber,
      merged: false,
      requiredChecks,
      now,
    });
  }

  if (activePr.isInMergeQueue) {
    if (state.status === 'enqueuing') {
      const latest = await client.getBatchState(owner, repo);
      if (
        !latest ||
        latest.batchId !== state.batchId ||
        latest.status === 'aborted' ||
        latest.status === 'stopped' ||
        Boolean(latest.abortRequestedBy) ||
        (latest.revision ?? 0) !== (state.revision ?? 0)
      ) {
        return {
          action: 'ignored',
          state: latest,
          message: `Skipped enqueuing->running recovery for PR #${state.activePrNumber}: state changed concurrently.`,
        };
      }
      const recoveredState: BatchState = {
        ...state,
        revision: (state.revision ?? 0) + 1,
        status: 'running',
        updatedAt: now(),
      };
      await client.saveBatchState(owner, repo, recoveredState);
      return {
        action: 'reconciled',
        state: recoveredState,
        message: `Recovered interrupted state: PR #${state.activePrNumber} is in the merge queue; status restored to running.`,
      };
    }
    return {
      action: 'ignored',
      state,
      message: `PR #${state.activePrNumber} is actively in the merge queue; no recovery needed.`,
    };
  }

  const stoppedState: BatchState = {
    ...state,
    status: 'stopped',
    updatedAt: now(),
    activePrNumber: null,
    activeHeadSha: null,
    stopReason: `Reconciliation found PR #${state.activePrNumber} is OPEN but not in the merge queue (status was ${state.status}). Stopped without double-enqueueing.`,
  };
  await client.saveBatchState(owner, repo, stoppedState);
  return {
    action: 'stopped',
    state: stoppedState,
    message: stoppedState.stopReason!,
  };
}

export async function handleMergeGroupDestroyed(
  client: GitHubBatchClient,
  options: {
    owner: string;
    repo: string;
    reason?: string;
    headSha?: string;
    now?: () => string;
  },
): Promise<AdvanceOutcome> {
  const { owner, repo, reason = 'unknown', headSha, now = () => new Date().toISOString() } = options;

  if (reason.toLowerCase() === 'merged') {
    return {
      action: 'ignored',
      state: await client.getBatchState(owner, repo),
      message: 'merge_group destroyed with reason=merged; advancement is handled by pull_request closed.',
    };
  }

  const state = await client.getBatchState(owner, repo);
  if (!state || (state.status !== 'running' && state.status !== 'enqueuing') || state.activePrNumber === null) {
    return {
      action: 'ignored',
      state,
      message: 'No active merge-queue batch is running.',
    };
  }

  const activePr = await client.getPullRequest(owner, repo, state.activePrNumber);
  // If the active PR is still in the merge queue or was already merged, do not stop on an unrelated merge_group event.
  if (activePr && (activePr.isInMergeQueue || activePr.state === 'MERGED')) {
    return {
      action: 'ignored',
      state,
      message: `Active PR #${state.activePrNumber} is still queued or already merged; ignoring merge_group destroyed (${reason}).`,
    };
  }

  const shaContext = headSha ? ` (merge_group head ${headSha})` : '';
  const stoppedState: BatchState = {
    ...state,
    status: 'stopped',
    updatedAt: now(),
    activePrNumber: null,
    activeHeadSha: null,
    stopReason: `Active PR #${state.activePrNumber} left the merge queue without merging (merge_group destroyed reason=${reason}${shaContext}). Remaining entries were not enqueued.`,
  };
  await client.saveBatchState(owner, repo, stoppedState);

  return {
    action: 'stopped',
    state: stoppedState,
    message: stoppedState.stopReason!,
  };
}

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
): Promise<{ aborted: boolean; dequeuedPrNumber?: number; state: BatchState | null; message: string }> {
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
    return {
      aborted: false,
      state: await client.getBatchState(owner, repo),
      message: `Abort authorization failed (fail-closed): ${auth.reason}`,
    };
  }

  const state = await client.getBatchState(owner, repo);
  if (!state || (state.status !== 'running' && state.status !== 'enqueuing')) {
    return {
      aborted: false,
      state,
      message: 'No running merge-queue batch to abort.',
    };
  }

  // Persist abort intent immediately so any concurrent advance/reconcile refuses to enqueue further PRs.
  const abortIntentState: BatchState = {
    ...state,
    revision: (state.revision ?? 0) + 1,
    abortRequestedBy: actor,
    updatedAt: now(),
  };
  await client.saveBatchState(owner, repo, abortIntentState);

  let dequeuedPrNumber: number | undefined;
  if (abortIntentState.activePrNumber !== null) {
    const activePr = await client.getPullRequest(owner, repo, abortIntentState.activePrNumber);
    if (activePr?.isInMergeQueue) {
      try {
        await client.dequeuePullRequest(activePr.id);
        dequeuedPrNumber = abortIntentState.activePrNumber;
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : String(err);
        return {
          aborted: false,
          state: abortIntentState,
          message: `Failed to dequeue active PR #${abortIntentState.activePrNumber} during abort: ${errMessage}. Abort intent recorded to block further enqueues; inspect queue state before retrying.`,
        };
      }
    }
  }

  const abortedState: BatchState = {
    ...abortIntentState,
    revision: (abortIntentState.revision ?? 0) + 1,
    status: 'aborted',
    updatedAt: now(),
    activePrNumber: null,
    activeHeadSha: null,
    stopReason: `Aborted by ${actor}: ${reason}${dequeuedPrNumber ? ` (dequeued PR #${dequeuedPrNumber})` : ''}`,
  };
  await client.saveBatchState(owner, repo, abortedState);

  return {
    aborted: true,
    dequeuedPrNumber,
    state: abortedState,
    message: abortedState.stopReason!,
  };
}

export function formatSummaryMarkdown(options: {
  title: string;
  preflightResults?: PreflightResult[];
  state?: BatchState | null;
  message?: string;
}): string {
  const lines: string[] = [`## ${options.title}`, ''];

  if (options.message) {
    lines.push(options.message, '');
  }

  if (options.preflightResults && options.preflightResults.length > 0) {
    lines.push('### Preflight Results', '');
    lines.push('| PR | Reviewed SHA | Status | Details |');
    lines.push('| --- | --- | --- | --- |');
    for (const res of options.preflightResults) {
      const status = res.ok ? 'PASS' : 'FAIL';
      const details = res.ok ? 'Eligible for merge queue' : res.reasons.join('; ');
      lines.push(`| #${res.entry.prNumber} | \`${res.entry.expectedHeadSha.slice(0, 12)}\` | ${status} | ${details} |`);
    }
    lines.push('');
  }

  if (options.state) {
    const s = options.state;
    lines.push('### Batch State', '');
    lines.push(`- **Batch ID:** \`${s.batchId}\``);
    lines.push(`- **Status:** \`${s.status}\``);
    lines.push(`- **Authorized by:** ${s.authorizedBy}`);
    lines.push(`- **Completed PRs:** ${s.completedPrNumbers.length > 0 ? s.completedPrNumbers.map((n) => `#${n}`).join(', ') : 'None'}`);
    lines.push(`- **Active PR:** ${s.activePrNumber ? `#${s.activePrNumber}@\`${s.activeHeadSha?.slice(0, 12)}\`` : 'None'}`);
    if (s.stopReason) {
      lines.push(`- **Stop reason:** ${s.stopReason}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
