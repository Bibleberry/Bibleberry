import { appendFileSync } from 'node:fs';
import {
  abortBatch,
  COMPARE_FILES_TRUNCATION_LIMIT,
  DEFAULT_INTEGRATION_POLICY,
  DEFAULT_MERGE_METHOD,
  formatSummaryMarkdown,
  handleChecksCompleted,
  handlePullRequestClosed,
  handlePullRequestSynchronize,
  parseBatchEntries,
  reconcileBatch,
  runPreflight,
  startBatch,
  type ApprovalVerificationResult,
  type CommitComparison,
  type CommitDetails,
  type GitHubBatchClient,
  type IntegrationPolicy,
  type PullRequestCommentNode,
  type PullRequestSnapshot,
  type RepositoryPolicy,
  type StatusContextNode,
  type StoredBatchState,
} from './merge-queue-batch-lib.ts';

const STATE_VARIABLE_NAME = 'MERGE_QUEUE_BATCH_STATE';
const GITHUB_API_BASE = 'https://api.github.com';
const MAX_COMMENT_PAGES = 10;

const PR_SNAPSHOT_QUERY = `
query DirectBatchPullRequest($owner: String!, $repo: String!, $prNumber: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      id
      number
      url
      title
      state
      isDraft
      author {
        login
      }
      baseRefName
      baseRepository {
        nameWithOwner
      }
      headRefName
      headRefOid
      headRepository {
        nameWithOwner
      }
      isInMergeQueue
      mergeable
      mergeStateStatus
      reviewDecision
      mergeCommit {
        oid
      }
      mergedAt
      mergedBy {
        login
      }
      latestReviews(first: 50) {
        nodes {
          state
          submittedAt
          author {
            login
          }
          commit {
            oid
          }
        }
      }
      reviewThreads(first: 100) {
        totalCount
        pageInfo {
          hasNextPage
        }
        nodes {
          isResolved
        }
      }
      statusCheckRollup {
        state
        contexts(first: 100) {
          pageInfo {
            hasNextPage
          }
          nodes {
            __typename
            ... on CheckRun {
              name
              status
              conclusion
              completedAt
              startedAt
              checkSuite {
                commit {
                  oid
                }
              }
            }
            ... on StatusContext {
              context
              state
            }
          }
        }
      }
    }
  }
}
`;

// Retained solely to safely dequeue an unresolved active legacy v1 batch during abort.
const LEGACY_DEQUEUE_PR_MUTATION = `
mutation DequeueLegacyPullRequest($pullRequestId: ID!) {
  dequeuePullRequest(input: { id: $pullRequestId }) {
    mergeQueueEntry {
      id
    }
  }
}
`;

interface RawGraphQLContextNode extends StatusContextNode {
  checkSuite?: {
    commit?: {
      oid?: string | null;
    } | null;
  } | null;
}

interface RawGraphQLPullRequest extends Omit<PullRequestSnapshot, 'statusCheckRollup' | 'issueComments'> {
  statusCheckRollup: {
    state: string;
    contexts: {
      pageInfo?: { hasNextPage: boolean };
      nodes: RawGraphQLContextNode[];
    };
  } | null;
}

interface WorkflowRunApproval {
  environments?: Array<{ name?: string }>;
  state?: string;
  user?: { login?: string };
}

interface RestIssueComment {
  id: number;
  body?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  user?: { login?: string } | null;
}

export function createGitHubClient(token: string, readToken?: string): GitHubBatchClient {
  const makeHeaders = (authToken: string) => ({
    Authorization: `Bearer ${authToken}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'bibleberry-copper-turnstile',
    'X-GitHub-Api-Version': '2022-11-28',
  });
  const headers = makeHeaders(token);
  const approvalHeaders = makeHeaders(readToken || token);

  async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${GITHUB_API_BASE}/graphql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub GraphQL HTTP ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string; type?: string }>;
    };

    if (payload.errors && payload.errors.length > 0) {
      const messages = payload.errors.map((e) => e.message).join('; ');
      throw new Error(`GitHub GraphQL error: ${messages}`);
    }

    if (!payload.data) {
      throw new Error('GitHub GraphQL response missing data.');
    }

    return payload.data;
  }

  async function restJson<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    path: string,
    body?: unknown,
    customHeaders = headers,
  ): Promise<T> {
    const response = await fetch(`${GITHUB_API_BASE}${path}`, {
      method,
      headers: customHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub REST HTTP ${response.status} (${method} ${path}): ${text}`);
    }
    return (await response.json()) as T;
  }

  async function fetchAllIssueComments(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<{ pageInfo: { hasNextPage: boolean }; nodes: PullRequestCommentNode[] }> {
    const nodes: PullRequestCommentNode[] = [];
    let hasNextPage = false;

    for (let page = 1; page <= MAX_COMMENT_PAGES; page += 1) {
      const batch = await restJson<RestIssueComment[]>(
        'GET',
        `/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100&page=${page}`,
      );
      for (const c of batch) {
        nodes.push({
          id: String(c.id),
          author: c.user?.login ? { login: c.user.login } : null,
          body: c.body ?? '',
          createdAt: c.created_at ?? null,
          updatedAt: c.updated_at ?? null,
        });
      }
      if (batch.length < 100) {
        hasNextPage = false;
        break;
      }
      if (page === MAX_COMMENT_PAGES) {
        hasNextPage = true;
      }
    }

    return { pageInfo: { hasNextPage }, nodes };
  }

  return {
    async getPullRequest(owner, repo, prNumber): Promise<PullRequestSnapshot | null> {
      const data = await graphql<{
        repository: { pullRequest: RawGraphQLPullRequest | null } | null;
      }>(PR_SNAPSHOT_QUERY, { owner, repo, prNumber });
      const raw = data.repository?.pullRequest;
      if (!raw) return null;

      const issueComments = await fetchAllIssueComments(owner, repo, prNumber);

      return {
        ...raw,
        issueComments,
        statusCheckRollup: raw.statusCheckRollup
          ? {
              state: raw.statusCheckRollup.state,
              contexts: {
                pageInfo: raw.statusCheckRollup.contexts.pageInfo,
                nodes: raw.statusCheckRollup.contexts.nodes.map((node) => ({
                  __typename: node.__typename,
                  name: node.name,
                  status: node.status,
                  conclusion: node.conclusion,
                  context: node.context,
                  state: node.state,
                  completedAt: node.completedAt,
                  startedAt: node.startedAt,
                  headSha: node.checkSuite?.commit?.oid ?? null,
                })),
              },
            }
          : null,
      };
    },

    async getBranchHeadSha(owner, repo, branch): Promise<string> {
      const encodedBranch = encodeURIComponent(branch);
      const data = await restJson<{ object?: { sha?: string } }>(
        'GET',
        `/repos/${owner}/${repo}/git/ref/heads/${encodedBranch}`,
      );
      if (!data.object?.sha) {
        throw new Error(`Branch ref heads/${branch} did not return a commit SHA.`);
      }
      return data.object.sha.toLowerCase();
    },

    async getRepositoryPolicy(owner, repo): Promise<RepositoryPolicy> {
      const repoData = await restJson<{
        default_branch?: string;
        allow_squash_merge?: boolean;
        allow_merge_commit?: boolean;
        allow_rebase_merge?: boolean;
        allow_auto_merge?: boolean;
        allow_update_branch?: boolean;
      }>('GET', `/repos/${owner}/${repo}`);

      const defaultBranch = repoData.default_branch ?? 'main';
      const policy: RepositoryPolicy = {
        defaultBranch,
        allowSquashMerge: repoData.allow_squash_merge ?? true,
        allowMergeCommit: repoData.allow_merge_commit ?? true,
        allowRebaseMerge: repoData.allow_rebase_merge ?? true,
        allowAutoMerge: repoData.allow_auto_merge,
        allowUpdateBranch: repoData.allow_update_branch,
        protectionAccessible: false,
      };

      const protResponse = await fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/branches/${encodeURIComponent(defaultBranch)}/protection`,
        { method: 'GET', headers },
      );

      if (protResponse.ok) {
        const prot = (await protResponse.json()) as {
          required_status_checks?: {
            strict?: boolean;
            contexts?: string[];
            checks?: Array<{ context?: string }>;
          };
          required_pull_request_reviews?: {
            required_approving_review_count?: number;
            dismiss_stale_reviews?: boolean;
            bypass_pull_request_allowances?: {
              users?: Array<{ login?: string }>;
              teams?: Array<{ slug?: string }>;
              apps?: Array<{ slug?: string }>;
            };
          };
          required_conversation_resolution?: { enabled?: boolean };
          enforce_admins?: { enabled?: boolean };
          allow_force_pushes?: { enabled?: boolean };
          allow_deletions?: { enabled?: boolean };
        };
        const contexts = new Set<string>();
        for (const c of prot.required_status_checks?.contexts ?? []) {
          contexts.add(c);
        }
        for (const c of prot.required_status_checks?.checks ?? []) {
          if (c.context) contexts.add(c.context);
        }

        const bypass = prot.required_pull_request_reviews?.bypass_pull_request_allowances;
        const bypassTargets: string[] = [
          ...(bypass?.users ?? []).map((u) => `user:${u.login ?? 'unknown'}`),
          ...(bypass?.teams ?? []).map((t) => `team:${t.slug ?? 'unknown'}`),
          ...(bypass?.apps ?? []).map((a) => `app:${a.slug ?? 'unknown'}`),
        ];

        policy.protectionAccessible = true;
        policy.strictStatusChecks = prot.required_status_checks?.strict === true;
        policy.requiredStatusChecks = [...contexts];
        policy.requiredApprovingReviewCount =
          prot.required_pull_request_reviews?.required_approving_review_count ?? 0;
        policy.dismissStaleReviews = prot.required_pull_request_reviews?.dismiss_stale_reviews ?? false;
        policy.requiredConversationResolution = prot.required_conversation_resolution?.enabled === true;
        policy.enforceAdmins = prot.enforce_admins?.enabled === true;
        policy.allowForcePushes = prot.allow_force_pushes?.enabled ?? true;
        policy.allowDeletions = prot.allow_deletions?.enabled ?? true;
        policy.hasBypassAllowances = bypassTargets.length > 0;
        policy.bypassAllowanceTargets = bypassTargets;
      }

      return policy;
    },

    async getCommit(owner, repo, sha): Promise<CommitDetails> {
      const data = await restJson<{
        sha: string;
        parents?: Array<{ sha: string }>;
        commit?: { message?: string };
        author?: { login?: string } | null;
        committer?: { login?: string } | null;
      }>('GET', `/repos/${owner}/${repo}/commits/${encodeURIComponent(sha)}`);

      return {
        sha: data.sha.toLowerCase(),
        parents: (data.parents ?? []).map((p) => p.sha.toLowerCase()),
        message: data.commit?.message ?? '',
        authorLogin: data.author?.login ?? null,
        committerLogin: data.committer?.login ?? null,
      };
    },

    async compareCommits(owner, repo, base, head): Promise<CommitComparison> {
      const data = await restJson<{
        status: string;
        ahead_by: number;
        behind_by: number;
        total_commits?: number;
        merge_base_commit?: { sha?: string };
        files?: Array<{
          filename: string;
          status: string;
          sha?: string;
          previous_filename?: string;
        }>;
      }>('GET', `/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);

      const files = (data.files ?? []).map((f) => ({
        filename: f.filename,
        status: f.status,
        sha: f.sha,
        previousFilename: f.previous_filename,
      }));

      return {
        status: data.status,
        aheadBy: data.ahead_by,
        behindBy: data.behind_by,
        totalCommits: data.total_commits,
        mergeBaseSha: (data.merge_base_commit?.sha ?? '').toLowerCase(),
        files,
        filesTruncated: files.length >= COMPARE_FILES_TRUNCATION_LIMIT,
      };
    },

    async updatePullRequestBranch(owner, repo, prNumber, expectedHeadSha) {
      return restJson<{ message?: string; url?: string }>(
        'PUT',
        `/repos/${owner}/${repo}/pulls/${prNumber}/update-branch`,
        { expected_head_sha: expectedHeadSha },
      );
    },

    async mergePullRequest(owner, repo, prNumber, expectedHeadSha, mergeMethod) {
      return restJson<{ sha: string; merged: boolean; message: string }>(
        'PUT',
        `/repos/${owner}/${repo}/pulls/${prNumber}/merge`,
        {
          sha: expectedHeadSha,
          merge_method: mergeMethod,
        },
      );
    },

    async dequeuePullRequest(pullRequestId) {
      await graphql(LEGACY_DEQUEUE_PR_MUTATION, { pullRequestId });
    },

    async getBatchState(owner, repo): Promise<StoredBatchState | null> {
      const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/variables/${STATE_VARIABLE_NAME}`;
      const response = await fetch(url, { method: 'GET', headers });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Failed to read ${STATE_VARIABLE_NAME} (HTTP ${response.status}): ${body}`);
      }
      const data = (await response.json()) as { value?: string };
      if (!data.value) {
        return null;
      }
      return JSON.parse(data.value) as StoredBatchState;
    },

    async saveBatchState(owner, repo, state): Promise<void> {
      const baseUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/variables`;
      const serialized = JSON.stringify(state);
      const patchResponse = await fetch(`${baseUrl}/${STATE_VARIABLE_NAME}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name: STATE_VARIABLE_NAME, value: serialized }),
      });

      if (patchResponse.status === 204) {
        return;
      }

      if (patchResponse.status === 404) {
        const postResponse = await fetch(baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: STATE_VARIABLE_NAME, value: serialized }),
        });
        if (postResponse.status === 201 || postResponse.status === 204) {
          return;
        }
        const postBody = await postResponse.text();
        throw new Error(`Failed to create ${STATE_VARIABLE_NAME} (HTTP ${postResponse.status}): ${postBody}`);
      }

      const patchBody = await patchResponse.text();
      throw new Error(`Failed to update ${STATE_VARIABLE_NAME} (HTTP ${patchResponse.status}): ${patchBody}`);
    },

    async verifyWorkflowApproval(
      owner,
      repo,
      runId,
      environmentName,
      authorizedOwners,
    ): Promise<ApprovalVerificationResult> {
      const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/runs/${runId}/approvals`;
      const response = await fetch(url, { method: 'GET', headers: approvalHeaders });
      if (!response.ok) {
        const body = await response.text();
        return {
          ok: false,
          reason: `Unable to verify ${environmentName} approval for run ${runId} (HTTP ${response.status}): ${body}`,
        };
      }

      const approvals = (await response.json()) as WorkflowRunApproval[];
      const allowedLogins = new Set(authorizedOwners.map((u) => u.toLowerCase()));

      const match = approvals.find((entry) => {
        const isApproved = entry.state === 'approved';
        const hasEnv = Boolean(entry.environments?.some((env) => env.name === environmentName));
        const login = entry.user?.login?.toLowerCase() ?? '';
        return isApproved && hasEnv && allowedLogins.has(login);
      });

      if (!match) {
        return {
          ok: false,
          reason: `Run ${runId} has no recorded "${environmentName}" approval from authorized owner(s) [${authorizedOwners.join(', ')}]. Ensure environment "${environmentName}" exists with Required Reviewers configured.`,
        };
      }

      return {
        ok: true,
        approvedBy: match.user?.login,
      };
    },
  };
}

function parseCliArgs(argv: string[]): { command: string; flags: Record<string, string | boolean> } {
  const [command = '', ...rest] = argv;
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith('--')) {
      continue;
    }
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }

  return { command, flags };
}

function writeStepSummary(markdown: string): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    appendFileSync(summaryPath, `${markdown}\n`, 'utf8');
  }
  console.log(markdown);
}

function resolveRepo(flags: Record<string, string | boolean>): { owner: string; repo: string } {
  const raw =
    (typeof flags.repo === 'string' && flags.repo) ||
    process.env.GITHUB_REPOSITORY ||
    'Bibleberry/Bibleberry';
  const [owner, repo] = raw.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid repository "${raw}". Expected OWNER/REPO.`);
  }
  return { owner, repo };
}

function getToken(): string {
  const token =
    process.env.COPPER_TURNSTILE_TOKEN ||
    process.env.MERGE_QUEUE_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      'Missing GitHub token. Configure the repository-scoped GitHub App in the main-only copper-turnstile-runtime environment (COPPER_TURNSTILE_APP_CLIENT_ID + COPPER_TURNSTILE_APP_PRIVATE_KEY), or GH_TOKEN/GITHUB_TOKEN for read-only preflight.',
    );
  }
  return token;
}

function resolveIntegrationPolicy(raw: string | boolean | undefined): IntegrationPolicy {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!value || value === 'integration-only') {
    return DEFAULT_INTEGRATION_POLICY;
  }
  if (value === 'hold-on-update') {
    return 'hold-on-update';
  }
  throw new Error(`Invalid integration policy "${value}". Expected "integration-only" or "hold-on-update".`);
}

async function main(): Promise<void> {
  const { command, flags } = parseCliArgs(process.argv.slice(2));
  const { owner, repo } = resolveRepo(flags);
  const requireWorkflowApprovalRecord = process.env.GITHUB_ACTIONS === 'true';

  if (!command || flags.help) {
    console.log(
      'Usage: node --experimental-strip-types scripts/ci/merge-queue-batch.ts <preflight|start|advance|sync|checks|reconcile|status|abort> [options]',
    );
    return;
  }

  // `status` renders directly from BATCH_STATE_JSON (vars.MERGE_QUEUE_BATCH_STATE) with zero write credentials.
  if (command === 'status' && process.env.BATCH_STATE_JSON !== undefined) {
    const rawJson = process.env.BATCH_STATE_JSON.trim();
    const state = rawJson ? (JSON.parse(rawJson) as StoredBatchState) : null;
    writeStepSummary(
      formatSummaryMarkdown({
        title: 'Copper Turnstile Batch Status',
        state,
        message: state ? undefined : `No batch state recorded in ${STATE_VARIABLE_NAME}.`,
      }),
    );
    return;
  }

  const client = createGitHubClient(getToken(), process.env.GITHUB_TOKEN);

  if (command === 'preflight') {
    const rawEntries =
      (typeof flags.entries === 'string' ? flags.entries : undefined) ?? process.env.BATCH_ENTRIES ?? '';
    const mergeMethod =
      (typeof flags['merge-method'] === 'string' ? flags['merge-method'] : undefined) ??
      process.env.MERGE_METHOD ??
      DEFAULT_MERGE_METHOD;
    const entries = parseBatchEntries(rawEntries);
    const { ok, results, observedMainSha, policyError, protectionNotice } = await runPreflight(
      client,
      owner,
      repo,
      entries,
      undefined,
      { mergeMethod, requireVerifiedProtection: false },
    );
    const baseMsg = ok
      ? `All ${entries.length} PR(s) passed preflight against main@${observedMainSha.slice(0, 12)} (merge method: ${mergeMethod}). Zero writes were performed.`
      : policyError ?? 'Preflight failed for one or more PRs. Zero writes were performed.';
    writeStepSummary(
      formatSummaryMarkdown({
        title: 'Copper Turnstile Preflight (Read-Only)',
        preflightResults: results,
        message: protectionNotice ? `${baseMsg}\n\n> ${protectionNotice}` : baseMsg,
      }),
    );
    if (!ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'start') {
    const rawEntries =
      (typeof flags.entries === 'string' ? flags.entries : undefined) ?? process.env.BATCH_ENTRIES ?? '';
    const entries = parseBatchEntries(rawEntries);
    const dryRun = Boolean(flags['dry-run']);
    const mergeMethod =
      (typeof flags['merge-method'] === 'string' ? flags['merge-method'] : undefined) ??
      process.env.MERGE_METHOD ??
      DEFAULT_MERGE_METHOD;
    const integrationPolicy = resolveIntegrationPolicy(
      flags['integration-policy'] ?? process.env.INTEGRATION_POLICY,
    );
    const actor =
      (typeof flags.actor === 'string' && flags.actor) ||
      process.env.GITHUB_ACTOR ||
      'unknown';
    const workflowRunId = process.env.GITHUB_RUN_ID;
    const workflowRunUrl =
      workflowRunId && process.env.GITHUB_SERVER_URL
        ? `${process.env.GITHUB_SERVER_URL}/${owner}/${repo}/actions/runs/${workflowRunId}`
        : undefined;

    const outcome = await startBatch(client, {
      owner,
      repo,
      entries,
      authorizedBy: actor,
      dryRun,
      mergeMethod,
      integrationPolicy,
      requireWorkflowApprovalRecord,
      workflowRunId,
      workflowRunUrl,
    });

    writeStepSummary(
      formatSummaryMarkdown({
        title: dryRun
          ? 'Copper Turnstile Batch Dry-Run'
          : `Copper Turnstile Batch Start (${outcome.action})`,
        preflightResults: outcome.preflightResults,
        state: outcome.state,
        message: outcome.ok ? outcome.message : outcome.error,
      }),
    );

    if (!outcome.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'advance') {
    const prNumber = Number(flags.pr ?? process.env.EVENT_PR_NUMBER);
    const merged = String(flags.merged ?? process.env.EVENT_PR_MERGED) === 'true';
    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      throw new Error('advance requires --pr <positive-integer> or EVENT_PR_NUMBER');
    }
    const outcome = await handlePullRequestClosed(client, {
      owner,
      repo,
      prNumber,
      merged,
      requireWorkflowApprovalRecord,
    });
    writeStepSummary(
      formatSummaryMarkdown({
        title: `Copper Turnstile PR Closed (${outcome.action})`,
        preflightResults: outcome.preflightResult ? [outcome.preflightResult] : undefined,
        state: outcome.state,
        message: outcome.message,
      }),
    );
    if (outcome.action === 'stopped') {
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'sync') {
    const prNumber = Number(flags.pr ?? process.env.EVENT_PR_NUMBER);
    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      throw new Error('sync requires --pr <positive-integer> or EVENT_PR_NUMBER');
    }
    const outcome = await handlePullRequestSynchronize(client, {
      owner,
      repo,
      prNumber,
      requireWorkflowApprovalRecord,
    });
    writeStepSummary(
      formatSummaryMarkdown({
        title: `Copper Turnstile PR Synchronize (${outcome.action})`,
        preflightResults: outcome.preflightResult ? [outcome.preflightResult] : undefined,
        state: outcome.state,
        message: outcome.message,
      }),
    );
    if (outcome.action === 'stopped') {
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'checks') {
    const headSha =
      (typeof flags['head-sha'] === 'string' ? flags['head-sha'] : undefined) ??
      (process.env.EVENT_WORKFLOW_HEAD_SHA || undefined);
    const outcome = await handleChecksCompleted(client, {
      owner,
      repo,
      headSha,
      requireWorkflowApprovalRecord,
    });
    writeStepSummary(
      formatSummaryMarkdown({
        title: `Copper Turnstile CI Completion Wakeup (${outcome.action})`,
        preflightResults: outcome.preflightResult ? [outcome.preflightResult] : undefined,
        state: outcome.state,
        message: outcome.message,
      }),
    );
    if (outcome.action === 'stopped') {
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'reconcile') {
    const requireApproval = Boolean(flags['require-approval']);
    const actor =
      (typeof flags.actor === 'string' && flags.actor) ||
      process.env.GITHUB_ACTOR ||
      'unknown';
    const outcome = await reconcileBatch(client, {
      owner,
      repo,
      requireWorkflowApprovalRecord,
      requireApproval: requireApproval
        ? { actor, workflowRunId: process.env.GITHUB_RUN_ID }
        : undefined,
    });
    writeStepSummary(
      formatSummaryMarkdown({
        title: `Copper Turnstile Batch Reconcile (${outcome.action})`,
        preflightResults: outcome.preflightResult ? [outcome.preflightResult] : undefined,
        state: outcome.state,
        message: outcome.message,
      }),
    );
    if (outcome.action === 'stopped') {
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'status') {
    const state = await client.getBatchState(owner, repo);
    writeStepSummary(
      formatSummaryMarkdown({
        title: 'Copper Turnstile Batch Status',
        state,
        message: state ? undefined : `No batch state recorded in ${STATE_VARIABLE_NAME}.`,
      }),
    );
    return;
  }

  if (command === 'abort') {
    const actor =
      (typeof flags.actor === 'string' && flags.actor) ||
      process.env.GITHUB_ACTOR ||
      'unknown';
    const reason =
      (typeof flags.reason === 'string' ? flags.reason : undefined) ??
      process.env.ABORT_REASON ??
      'Aborted by operator';
    const outcome = await abortBatch(client, {
      owner,
      repo,
      actor,
      reason,
      workflowRunId: process.env.GITHUB_RUN_ID,
    });
    writeStepSummary(
      formatSummaryMarkdown({
        title: 'Copper Turnstile Batch Abort',
        state: outcome.state,
        message: outcome.message,
      }),
    );
    if (!outcome.aborted) {
      process.exitCode = 1;
    }
    return;
  }

  throw new Error(`Unknown command "${command}".`);
}

const isMainModule =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMainModule) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
