import { appendFileSync } from 'node:fs';
import {
  abortBatch,
  advanceBatchOnPullRequestClosed,
  formatSummaryMarkdown,
  handleMergeGroupDestroyed,
  parseBatchEntries,
  runPreflight,
  startBatch,
  type BatchState,
  type GitHubBatchClient,
  type PullRequestSnapshot,
} from './merge-queue-batch-lib.ts';

const STATE_VARIABLE_NAME = 'MERGE_QUEUE_BATCH_STATE';
const GITHUB_API_BASE = 'https://api.github.com';

const PR_PREFLIGHT_QUERY = `
query MergeQueuePreflight($owner: String!, $repo: String!, $prNumber: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      id
      number
      url
      title
      state
      isDraft
      baseRefName
      baseRepository {
        nameWithOwner
      }
      headRefOid
      isInMergeQueue
      mergeable
      mergeStateStatus
      reviewDecision
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
          nodes {
            __typename
            ... on CheckRun {
              name
              status
              conclusion
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

const ENQUEUE_PR_MUTATION = `
mutation EnqueueApprovedPullRequest($pullRequestId: ID!, $expectedHeadOid: GitObjectID!) {
  enqueuePullRequest(input: { pullRequestId: $pullRequestId, expectedHeadOid: $expectedHeadOid }) {
    mergeQueueEntry {
      id
      position
      state
    }
  }
}
`;

export function createGitHubClient(token: string): GitHubBatchClient {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'bibleberry-merge-queue-batch',
    'X-GitHub-Api-Version': '2022-11-28',
  };

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

  return {
    async getPullRequest(owner, repo, prNumber): Promise<PullRequestSnapshot | null> {
      const data = await graphql<{
        repository: { pullRequest: PullRequestSnapshot | null } | null;
      }>(PR_PREFLIGHT_QUERY, { owner, repo, prNumber });
      return data.repository?.pullRequest ?? null;
    },

    async enqueuePullRequest(pullRequestId, expectedHeadOid) {
      const data = await graphql<{
        enqueuePullRequest: {
          mergeQueueEntry?: { id: string; position: number; state: string };
        };
      }>(ENQUEUE_PR_MUTATION, { pullRequestId, expectedHeadOid });
      return { queueEntryId: data.enqueuePullRequest.mergeQueueEntry?.id };
    },

    async getBatchState(owner, repo): Promise<BatchState | null> {
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
      return JSON.parse(data.value) as BatchState;
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
  const token = process.env.MERGE_QUEUE_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      'Missing GitHub token. Set MERGE_QUEUE_TOKEN, GH_TOKEN, or GITHUB_TOKEN (read-only preflight only needs a read token; enqueue/state requires write permissions).',
    );
  }
  return token;
}

async function main(): Promise<void> {
  const { command, flags } = parseCliArgs(process.argv.slice(2));
  const { owner, repo } = resolveRepo(flags);

  if (!command || flags.help) {
    console.log(
      'Usage: node --experimental-strip-types scripts/ci/merge-queue-batch.ts <preflight|start|advance|destroyed|status|abort> [options]',
    );
    return;
  }

  const client = createGitHubClient(getToken());

  if (command === 'preflight') {
    const rawEntries = typeof flags.entries === 'string' ? flags.entries : '';
    const entries = parseBatchEntries(rawEntries);
    const { ok, results } = await runPreflight(client, owner, repo, entries);
    writeStepSummary(
      formatSummaryMarkdown({
        title: 'Merge Queue Batch Preflight (Read-Only)',
        preflightResults: results,
        message: ok
          ? `All ${entries.length} PR(s) passed preflight checks.`
          : 'Preflight failed for one or more PRs. No queue changes were made.',
      }),
    );
    if (!ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'start') {
    const rawEntries = typeof flags.entries === 'string' ? flags.entries : '';
    const entries = parseBatchEntries(rawEntries);
    const dryRun = Boolean(flags['dry-run']);
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
      workflowRunId,
      workflowRunUrl,
    });

    writeStepSummary(
      formatSummaryMarkdown({
        title: dryRun ? 'Merge Queue Batch Dry-Run' : 'Merge Queue Batch Started',
        preflightResults: outcome.preflightResults,
        state: outcome.state,
        message: outcome.ok
          ? dryRun
            ? 'Dry-run succeeded. No PRs were enqueued and no state was saved.'
            : `Enqueued PR #${outcome.state?.activePrNumber} into the native merge queue.`
          : outcome.error,
      }),
    );

    if (!outcome.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'advance') {
    const prNumber = Number(flags.pr);
    const merged = String(flags.merged) === 'true';
    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      throw new Error('advance requires --pr <positive-integer>');
    }
    const outcome = await advanceBatchOnPullRequestClosed(client, {
      owner,
      repo,
      prNumber,
      merged,
    });
    writeStepSummary(
      formatSummaryMarkdown({
        title: `Merge Queue Batch Advance (${outcome.action})`,
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

  if (command === 'destroyed') {
    const reason = typeof flags.reason === 'string' ? flags.reason : 'unknown';
    const headSha = typeof flags['head-sha'] === 'string' ? flags['head-sha'] : undefined;
    const outcome = await handleMergeGroupDestroyed(client, {
      owner,
      repo,
      reason,
      headSha,
    });
    writeStepSummary(
      formatSummaryMarkdown({
        title: `Merge Queue Group Destroyed (${outcome.action})`,
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
        title: 'Merge Queue Batch Status',
        state,
        message: state ? undefined : 'No batch state recorded in MERGE_QUEUE_BATCH_STATE.',
      }),
    );
    return;
  }

  if (command === 'abort') {
    const actor =
      (typeof flags.actor === 'string' && flags.actor) ||
      process.env.GITHUB_ACTOR ||
      'unknown';
    const reason = typeof flags.reason === 'string' ? flags.reason : 'Aborted by operator';
    const outcome = await abortBatch(client, { owner, repo, actor, reason });
    writeStepSummary(
      formatSummaryMarkdown({
        title: 'Merge Queue Batch Abort',
        state: outcome.state,
        message: outcome.message,
      }),
    );
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
