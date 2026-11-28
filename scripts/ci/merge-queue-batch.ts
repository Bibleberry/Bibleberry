import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import {
  abortBatch,
  AUTH_MANIFEST_ARTIFACT_PREFIX,
  COMPARE_FILES_TRUNCATION_LIMIT,
  DEFAULT_INTEGRATION_POLICY,
  DEFAULT_MERGE_METHOD,
  formatSummaryMarkdown,
  handleChecksCompleted,
  handlePullRequestClosed,
  handlePullRequestSynchronize,
  parseBatchEntries,
  prepareAuthorizedManifest,
  reconcileBatch,
  runPreflight,
  startBatch,
  type ApprovalVerificationResult,
  type AuthorizedBatchManifest,
  type CommitComparison,
  type CommitDetails,
  type GitHubBatchClient,
  type IntegrationPolicy,
  type MergeMethod,
  type PullRequestCommentNode,
  type PullRequestSnapshot,
  type RepositoryPolicy,
  type StatusContextNode,
  type StoredBatchState,
} from './merge-queue-batch-lib.ts';

const STATE_VARIABLE_NAME = 'MERGE_QUEUE_BATCH_STATE';
const GITHUB_API_BASE = 'https://api.github.com';
const MAX_COMMENT_PAGES = 10;
const MANIFEST_FILENAME = 'copper-turnstile-auth-manifest.json';

/**
 * Extracts a single file from a standard ZIP archive (Store method 0 or Deflate method 8)
 * by reading the End of Central Directory and Central Directory Header, supporting
 * streaming ZIPs created by `actions/upload-artifact` where local header sizes may be 0.
 */
export function extractSingleFileFromZip(zipBytes: Uint8Array, expectedFilename?: string): Buffer {
  const buf = Buffer.from(zipBytes);
  // Locate End of Central Directory record (signature 0x06054b50) scanning backwards.
  let eocdOffset = -1;
  const minOffset = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minOffset; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('Invalid ZIP archive: missing End of Central Directory record.');
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  if (totalEntries < 1) {
    throw new Error('Invalid ZIP archive: no entries present.');
  }

  let cursor = cdOffset;
  for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
    if (cursor + 46 > buf.length || buf.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('Invalid ZIP archive: malformed Central Directory Header.');
    }
    const compressionMethod = buf.readUInt16LE(cursor + 10);
    const compressedSize = buf.readUInt32LE(cursor + 20);
    const fileNameLength = buf.readUInt16LE(cursor + 28);
    const extraLength = buf.readUInt16LE(cursor + 30);
    const commentLength = buf.readUInt16LE(cursor + 32);
    const localHeaderOffset = buf.readUInt32LE(cursor + 42);
    const fileName = buf.subarray(cursor + 46, cursor + 46 + fileNameLength).toString('utf8');

    cursor += 46 + fileNameLength + extraLength + commentLength;

    if (expectedFilename && fileName !== expectedFilename && !fileName.endsWith(`/${expectedFilename}`)) {
      continue;
    }

    if (localHeaderOffset + 30 > buf.length || buf.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error('Invalid ZIP archive: malformed Local File Header.');
    }
    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buf.length) {
      throw new Error('Invalid ZIP archive: entry data exceeds buffer bounds.');
    }
    const compressedSlice = buf.subarray(dataStart, dataEnd);
    if (compressionMethod === 0) {
      return Buffer.from(compressedSlice);
    }
    if (compressionMethod === 8) {
      return inflateRawSync(compressedSlice);
    }
    throw new Error(`Unsupported ZIP compression method ${compressionMethod}.`);
  }

  throw new Error(`ZIP archive did not contain expected file "${expectedFilename ?? ''}".`);
}

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
      expectations,
    ): Promise<ApprovalVerificationResult> {
      const allowedLogins = new Set(authorizedOwners.map((u) => u.toLowerCase()));

      // 1. Verify workflow run identity, event, head_branch, and actor from GitHub API.
      const runUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/runs/${encodeURIComponent(runId)}`;
      const runResponse = await fetch(runUrl, { method: 'GET', headers: approvalHeaders });
      if (!runResponse.ok) {
        const body = await runResponse.text();
        return {
          ok: false,
          reason: `Unable to read workflow run ${runId} metadata (HTTP ${runResponse.status}): ${body}`,
        };
      }

      const runMeta = (await runResponse.json()) as {
        path?: string;
        event?: string;
        head_branch?: string;
        actor?: { login?: string };
        repository?: { full_name?: string };
      };

      const workflowPath = runMeta.path ?? '';
      const event = runMeta.event ?? '';
      const headBranch = runMeta.head_branch ?? '';
      const actor = runMeta.actor?.login ?? '';
      const repoFullName = runMeta.repository?.full_name ?? '';

      if (repoFullName && repoFullName.toLowerCase() !== `${owner}/${repo}`.toLowerCase()) {
        return {
          ok: false,
          reason: `Workflow run ${runId} belongs to repository "${repoFullName}", expected "${owner}/${repo}".`,
        };
      }
      if (expectations?.expectedWorkflowPath && workflowPath !== expectations.expectedWorkflowPath) {
        return {
          ok: false,
          reason: `Workflow run ${runId} executed "${workflowPath}", expected "${expectations.expectedWorkflowPath}".`,
        };
      }
      if (expectations?.expectedEvent && event !== expectations.expectedEvent) {
        return {
          ok: false,
          reason: `Workflow run ${runId} event was "${event}", expected "${expectations.expectedEvent}".`,
        };
      }
      if (expectations?.expectedHeadBranch && headBranch !== expectations.expectedHeadBranch) {
        return {
          ok: false,
          reason: `Workflow run ${runId} head_branch was "${headBranch}", expected "${expectations.expectedHeadBranch}".`,
        };
      }
      if (!allowedLogins.has(actor.toLowerCase())) {
        return {
          ok: false,
          reason: `Workflow run ${runId} actor "${actor || 'unknown'}" is not in authorized owners [${authorizedOwners.join(', ')}].`,
        };
      }

      // 2. Verify environment approval on `merge-queue-approval` by authorized owner.
      const approvalsUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/runs/${encodeURIComponent(runId)}/approvals`;
      const response = await fetch(approvalsUrl, { method: 'GET', headers: approvalHeaders });
      if (!response.ok) {
        const body = await response.text();
        return {
          ok: false,
          reason: `Unable to verify ${environmentName} approval for run ${runId} (HTTP ${response.status}): ${body}`,
        };
      }

      const approvals = (await response.json()) as WorkflowRunApproval[];
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

      // 3. When verifying a batch `start` run, confirm the `approve-start` job succeeded
      //    (prevents replaying an approved `abort` or `reconcile` run as a batch start).
      let hasStartApprovalJob: boolean | undefined;
      if (expectations?.expectedStartApprovalJobName) {
        const jobsUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/runs/${encodeURIComponent(runId)}/jobs?per_page=100`;
        const jobsResponse = await fetch(jobsUrl, { method: 'GET', headers: approvalHeaders });
        if (!jobsResponse.ok) {
          const body = await jobsResponse.text();
          return {
            ok: false,
            reason: `Unable to inspect jobs for run ${runId} (HTTP ${jobsResponse.status}): ${body}`,
          };
        }
        const jobsData = (await jobsResponse.json()) as {
          jobs?: Array<{ name?: string; conclusion?: string | null }>;
        };
        const startJob = (jobsData.jobs ?? []).find(
          (j) => j.name === expectations.expectedStartApprovalJobName && j.conclusion === 'success',
        );
        hasStartApprovalJob = Boolean(startJob);
        if (!startJob) {
          return {
            ok: false,
            reason: `Workflow run ${runId} did not complete "${expectations.expectedStartApprovalJobName}" (cannot treat an unrelated or non-start run as a batch start authorization).`,
          };
        }
      }

      return {
        ok: true,
        approvedBy: match.user?.login,
        workflowPath,
        event,
        headBranch,
        actor,
        hasStartApprovalJob,
      };
    },

    async getAuthorizedManifest(
      owner,
      repo,
      runId,
    ): Promise<AuthorizedBatchManifest | null> {
      const artifactName = `${AUTH_MANIFEST_ARTIFACT_PREFIX}-${runId}`;
      const listUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/runs/${encodeURIComponent(runId)}/artifacts?name=${encodeURIComponent(artifactName)}`;
      const listResp = await fetch(listUrl, { method: 'GET', headers: approvalHeaders });
      if (!listResp.ok) {
        if (listResp.status === 404) return null;
        const body = await listResp.text();
        throw new Error(`Failed to list artifacts for run ${runId} (HTTP ${listResp.status}): ${body}`);
      }

      const listPayload = (await listResp.json()) as {
        artifacts?: Array<{ id: number; name: string; expired: boolean; archive_download_url?: string }>;
      };
      const artifact = (listPayload.artifacts ?? []).find((a) => a.name === artifactName && !a.expired);
      if (!artifact) {
        return null;
      }

      const downloadUrl =
        artifact.archive_download_url ||
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/artifacts/${artifact.id}/zip`;
      const dlResp = await fetch(downloadUrl, {
        method: 'GET',
        headers: approvalHeaders,
        redirect: 'follow',
      });
      if (!dlResp.ok) {
        const body = await dlResp.text();
        throw new Error(`Failed to download authorization manifest artifact ${artifact.id} (HTTP ${dlResp.status}): ${body}`);
      }

      const zipBytes = new Uint8Array(await dlResp.arrayBuffer());
      const jsonBuf = extractSingleFileFromZip(zipBytes, MANIFEST_FILENAME);
      return JSON.parse(jsonBuf.toString('utf8')) as AuthorizedBatchManifest;
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
      'Usage: node --experimental-strip-types scripts/ci/merge-queue-batch.ts <emit-manifest|preflight|start|advance|sync|checks|reconcile|status|abort> [options]',
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

  // `emit-manifest` validates entries against live GitHub PRs, captures exact verified
  // `reviewCommentDigest`s, and writes the immutable start-run manifest JSON BEFORE upload-artifact.
  if (command === 'emit-manifest') {
    const rawEntries =
      (typeof flags.entries === 'string' ? flags.entries : undefined) ?? process.env.BATCH_ENTRIES ?? '';
    const entries = parseBatchEntries(rawEntries);
    const mergeMethod = ((typeof flags['merge-method'] === 'string' ? flags['merge-method'] : undefined) ??
      process.env.MERGE_METHOD ??
      DEFAULT_MERGE_METHOD)
      .trim()
      .toLowerCase() as MergeMethod;
    const integrationPolicy = resolveIntegrationPolicy(
      flags['integration-policy'] ?? process.env.INTEGRATION_POLICY,
    );
    const workflowRunId =
      (typeof flags['run-id'] === 'string' ? flags['run-id'] : undefined) ?? process.env.GITHUB_RUN_ID ?? '';
    if (!workflowRunId) {
      throw new Error('emit-manifest requires GITHUB_RUN_ID or --run-id.');
    }
    const actor =
      (typeof flags.actor === 'string' && flags.actor) || process.env.GITHUB_ACTOR || 'unknown';
    const outPath =
      (typeof flags.out === 'string' ? flags.out : undefined) ?? process.env.MANIFEST_OUT ?? '';
    if (!outPath) {
      throw new Error('emit-manifest requires MANIFEST_OUT or --out.');
    }
    const prepared = await prepareAuthorizedManifest(client, {
      owner,
      repo,
      workflowRunId,
      authorizedBy: actor,
      mergeMethod,
      integrationPolicy,
      entries,
      requireWorkflowApprovalRecord,
    });
    if (!prepared.ok || !prepared.manifest) {
      writeStepSummary(
        formatSummaryMarkdown({
          title: 'Copper Turnstile Manifest Preparation (Failed)',
          preflightResults: prepared.preflightResults,
          message: prepared.error ?? 'Failed to prepare digest-bound authorization manifest.',
        }),
      );
      process.exitCode = 1;
      return;
    }
    writeFileSync(outPath, `${JSON.stringify(prepared.manifest, null, 2)}\n`, 'utf8');
    console.log(
      `Emitted digest-bound immutable authorization manifest for run ${workflowRunId} (${entries.length} entries, sha256=${prepared.manifest.manifestSha256.slice(0, 12)}).`,
    );
    return;
  }

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
    const manifestPath =
      (typeof flags.manifest === 'string' ? flags.manifest : undefined) ?? process.env.MANIFEST_PATH;
    const authorizedManifest = manifestPath
      ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as AuthorizedBatchManifest)
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
      authorizedManifest,
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
