export const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;
export const DEFAULT_REQUIRED_CHECKS = [
  'Build reader application',
  'Verify Sanity Studio',
];

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
  batchId: string;
  status: 'running' | 'completed' | 'stopped' | 'aborted';
  createdAt: string;
  updatedAt: string;
  authorizedBy: string;
  workflowRunId?: string;
  workflowRunUrl?: string;
  entries: BatchEntry[];
  nextIndex: number;
  activePrNumber: number | null;
  activeHeadSha: string | null;
  completedPrNumbers: number[];
  stopReason?: string;
}

export interface GitHubBatchClient {
  getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequestSnapshot | null>;
  enqueuePullRequest(pullRequestId: string, expectedHeadOid: string): Promise<{ queueEntryId?: string }>;
  getBatchState(owner: string, repo: string): Promise<BatchState | null>;
  saveBatchState(owner: string, repo: string, state: BatchState): Promise<void>;
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

const PASSING_CHECK_CONCLUSIONS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);

function hasPassingRequiredCheck(
  contexts: StatusContextNode[],
  checkName: string,
): { present: boolean; passing: boolean } {
  const matchingChecks = contexts.filter((ctx) => {
    if (ctx.__typename === 'StatusContext' || (!ctx.name && ctx.context)) {
      return ctx.context === checkName;
    }
    return ctx.name === checkName;
  });

  if (matchingChecks.length === 0) {
    return { present: false, passing: false };
  }

  // GitHub can retain earlier SKIPPED runs (e.g. from when the PR was Draft) alongside newer SUCCESS runs.
  const anyPassing = matchingChecks.some((ctx) => {
    if (ctx.__typename === 'StatusContext' || (!ctx.name && ctx.context)) {
      return ctx.state === 'SUCCESS';
    }
    return ctx.status === 'COMPLETED' && PASSING_CHECK_CONCLUSIONS.has(ctx.conclusion ?? '');
  });

  return { present: true, passing: anyPassing };
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
        reasons.push(`PR #${entry.prNumber} required check "${checkName}" did not pass.`);
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

export interface StartBatchOptions {
  owner: string;
  repo: string;
  entries: BatchEntry[];
  authorizedBy: string;
  dryRun?: boolean;
  workflowRunId?: string;
  workflowRunUrl?: string;
  requiredChecks?: string[];
  now?: () => string;
}

export interface StartBatchOutcome {
  ok: boolean;
  dryRun: boolean;
  preflightResults: PreflightResult[];
  state?: BatchState;
  error?: string;
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
    now = () => new Date().toISOString(),
  } = options;

  const existingState = await client.getBatchState(owner, repo);
  if (existingState?.status === 'running') {
    return {
      ok: false,
      dryRun,
      preflightResults: [],
      state: existingState,
      error: `Another batch (${existingState.batchId}) is already running (active PR #${existingState.activePrNumber}). Abort or wait for it to finish before starting a new batch.`,
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

  await client.enqueuePullRequest(freshPr.id, firstEntry.expectedHeadSha);

  const timestamp = now();
  const state: BatchState = {
    version: 1,
    batchId: `batch-${timestamp.replace(/[:.]/g, '-')}`,
    status: 'running',
    createdAt: timestamp,
    updatedAt: timestamp,
    authorizedBy,
    workflowRunId,
    workflowRunUrl,
    entries,
    nextIndex: 0,
    activePrNumber: firstEntry.prNumber,
    activeHeadSha: firstEntry.expectedHeadSha,
    completedPrNumbers: [],
  };

  await client.saveBatchState(owner, repo, state);

  return {
    ok: true,
    dryRun: false,
    preflightResults: preflight.results,
    state,
  };
}

export interface AdvanceOutcome {
  action: 'ignored' | 'enqueued' | 'completed' | 'stopped';
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
  if (!state || state.status !== 'running') {
    return {
      action: 'ignored',
      state,
      message: 'No active merge-queue batch is running.',
    };
  }

  if (state.activePrNumber !== prNumber) {
    return {
      action: 'ignored',
      state,
      message: `Closed PR #${prNumber} is not the active batch PR (#${state.activePrNumber}).`,
    };
  }

  const timestamp = now();

  if (!merged) {
    const stoppedState: BatchState = {
      ...state,
      status: 'stopped',
      updatedAt: timestamp,
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

  const completedPrNumbers = [...state.completedPrNumbers, prNumber];
  const nextIndex = state.nextIndex + 1;

  if (nextIndex >= state.entries.length) {
    const completedState: BatchState = {
      ...state,
      status: 'completed',
      updatedAt: timestamp,
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
      updatedAt: timestamp,
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

  try {
    await client.enqueuePullRequest(freshPr.id, nextEntry.expectedHeadSha);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const stoppedState: BatchState = {
      ...state,
      status: 'stopped',
      updatedAt: timestamp,
      nextIndex,
      activePrNumber: null,
      activeHeadSha: null,
      completedPrNumbers,
      stopReason: `Failed to enqueue PR #${nextEntry.prNumber}: ${reason}`,
    };
    await client.saveBatchState(owner, repo, stoppedState);
    return {
      action: 'stopped',
      state: stoppedState,
      message: stoppedState.stopReason!,
      preflightResult,
    };
  }

  const updatedState: BatchState = {
    ...state,
    status: 'running',
    updatedAt: timestamp,
    nextIndex,
    activePrNumber: nextEntry.prNumber,
    activeHeadSha: nextEntry.expectedHeadSha,
    completedPrNumbers,
  };
  await client.saveBatchState(owner, repo, updatedState);

  return {
    action: 'enqueued',
    state: updatedState,
    message: `PR #${prNumber} merged; enqueued next authorized PR #${nextEntry.prNumber}@${nextEntry.expectedHeadSha}.`,
    preflightResult,
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
  if (!state || state.status !== 'running' || state.activePrNumber === null) {
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
    now?: () => string;
  },
): Promise<{ aborted: boolean; state: BatchState | null; message: string }> {
  const { owner, repo, actor, reason = 'Aborted by operator', now = () => new Date().toISOString() } = options;
  const state = await client.getBatchState(owner, repo);
  if (!state || state.status !== 'running') {
    return {
      aborted: false,
      state,
      message: 'No running merge-queue batch to abort.',
    };
  }

  const abortedState: BatchState = {
    ...state,
    status: 'aborted',
    updatedAt: now(),
    activePrNumber: null,
    activeHeadSha: null,
    stopReason: `Aborted by ${actor}: ${reason}`,
  };
  await client.saveBatchState(owner, repo, abortedState);

  return {
    aborted: true,
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
