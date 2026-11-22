# Bibleberry merge-queue integration runbook

**Status:** Native merge queue enabled and proven ([#201](https://github.com/Bibleberry/Bibleberry/pull/201)); batch coordinator in review ([#202](https://github.com/Bibleberry/Bibleberry/issues/202), [#203](https://github.com/Bibleberry/Bibleberry/pull/203)).
**Owner:** Aaron Waid. **Tracking:** [#195](https://github.com/Bibleberry/Bibleberry/issues/195), [#202](https://github.com/Bibleberry/Bibleberry/issues/202).

## Purpose and authorization boundary

Development agents may work on independent draft feature PRs. Reviewers evaluate a
specific head commit, return defects for repair, and make a recommendation. Only
Aaron authorizes promotion, queue entry and merge. Authorizing a specified,
reviewed batch may satisfy that approval for its exact PR numbers and head SHAs;
it is never blanket permission for an AI agent to merge future code. A revised
head SHA must be reviewed and authorized again.

GitHub's native merge queue integrates approved PRs against the current `main`
using `merge_group` check runs and merges passing integration candidates. Set
maximum PRs per merge group **1** and build concurrency **1**, so that queued
PRs are verified and integrated one by one.

## CI changes in the preparation PR

- `Bibleberry CI` subscribes to `merge_group: checks_requested`, preserving
  required job names **Build reader application** and **Verify Sanity Studio**.
  Its adapter and release-gateway jobs also perform full queue verification.
- `Collections Browser Tests` runs browser regression tests on the queue
  integration commit.
- `Native Android debug build` runs on merge-group commits without its
  ordinary pull-request path filters, avoiding omission of integrated changes.
- `scripts/ci/check-scope.mjs` forces all targets to execute for
  `merge_group` even if an apparent diff is empty or irrelevant. In merge
  group mode, it does not use PR merge-base diff resolution.
- Existing draft-PR waiting-room semantics, read-only workflow token
  permissions, job identities, and per-PR cancellation behavior remain.
  *(Updated by [#239](https://github.com/Bibleberry/Bibleberry/issues/239) / `Silver Badger`: Draft-PR waiting-room CI suppression was later removed on standard hosted runners; read-only token permissions, job identities, per-PR cancellation, and Draft PR ineligibility for merge/queue entry remain unchanged. See [draft-pr-hosted-ci.md](draft-pr-hosted-ci.md).)*

**iOS:** The iOS workflow runs on PRs, main pushes, and manual dispatch. Before Aaron authorizes queue entry, Review and Checks & Merge confirm the iOS summary for the exact reviewed head. Native-sensitive and unknown scopes require **iOS Runtime Verified**. GitHub branch protection currently requires the reader and Studio checks. Adding an iOS required context would need owner approval and a check that also reports on merge-group commits. [Pine Relay scope and required-check handoff](native-ci-trigger-parity.md#checks--merge-handoff)

## PR assignment identity: required-check activation (Indigo Relay #304)

The trusted [PR Assignment Identity workflow](../../.github/workflows/pr-assignment-identity.yml) checks **each human-directed PR's codename and originating Issue** on `pull_request_target` and reports the status **Verify PR codename and originating Issue**. It does not check out or run code from the PR. Its new `merge_group: checks_requested` path reports **the same job name** on GitHub's synthetic queue commit and validates that event's trusted head/base SHA and base branch. **Queue context success alone does not prove any PR metadata passed.** Enforcement depends on requiring the job on the individual PR *as well as* receiving the job for the merge-group candidate.

**Owner-controlled activation, only after this workflow change is reviewed and merged:**

1. Admin checks a real post-merge Actions run of **Verify PR codename and originating Issue** on an ordinary PR, records its exact head SHA, and confirms the check still fails on a PR with an invalid codename/Issue reference. The PR validation step must run; a skipped check is not evidence of validation.
2. Aaron authorizes a controlled, non-feature merge-queue test candidate **without changing the required status list yet**. Admin records the `merge_group` run, integration head SHA, the unchanged job name, and result. If unavailable or failing, do not activate a new required gate.
3. When active queues are clear and the above evidence is satisfactory, Aaron edits the **existing protected `main` rule** in [repository branch settings](https://github.com/Bibleberry/Bibleberry/settings/branches) to add **Verify PR codename and originating Issue** as a required check from the correct GitHub Actions source. **Preserve** existing required checks **Build reader application** and **Verify Sanity Studio**, merge-queue settings, reviews and owner controls. This repository's GitHub App cannot read/modify the complete protection rule (403); only owner UI confirmation establishes that the requirement is actually enforced.
4. Confirm another owner-authorized queue candidate passes the now-required context on both the PR and `merge_group` SHA; record an invalid-identity negative check showing that a malformed human PR cannot merge. If the check stays pending, fails, or is missing on merge-group runs, **do not bypass or disable protection**. Remove the test candidate from the queue as appropriate, diagnose the trigger/context and return for a new review.
5. Keep [Indigo Relay Issue #304](https://github.com/Bibleberry/Bibleberry/issues/304) open until the owner-controlled required-check activation and hosted positive/negative evidence are recorded. The workflow PR alone prepares enforcement but **does not enforce it**.

This is separate from the existing [Copper Turnstile #202](https://github.com/Bibleberry/Bibleberry/issues/202) batch-queue coordinator. Do not edit its code, queue order, credentials, approval environment, or protection settings as part of Indigo Relay.

## Activation procedure (human admin steps after CI preparation PR passes and merges)

1. Inspect the final head of the CI preparation PR. Check the workflow,
   `merge_group` regression tests, and GitHub Actions results, then authorize
   and merge the infrastructure PR normally under existing `main` protection.
2. On [Bibleberry repository branch protection settings](https://github.com/Bibleberry/Bibleberry/settings/branches),
   edit the existing `main` protection/rule (do not remove or recreate it).
   Enable **Require merge queue**. Preserve required checks, including
   **Build reader application** and **Verify Sanity Studio**, PR
   requirements, conversation resolution, and restrictions on bypassing rules.
3. Configure **build concurrency = 1**, **minimum PRs to merge = 1**,
   **maximum PRs to merge = 1**; use the existing accepted merge method and
   fail/remove an unsuccessful candidate. Do not make optional unstable
   platform checks required without first addressing them.
4. Use one **non-feature test PR**, ready for review, with passing normal PR
   checks. As repository owner, use **Merge when ready** to enqueue it. Confirm
   a `merge_group` workflow run appears for the temporary
   `gh-readonly-queue/main/` ref; verify both named required check jobs pass
   on the integration SHA and that GitHub merges that exact candidate
   automatically.
5. Verify `main` protection still blocks bypass and that other draft PRs
   remain drafts and outside the queue. Check any remaining external
   integrations after the recent owner transfer.
6. Only after successful proof, authorize reviewed feature PRs to enter
   the queue, one at a time in the selected order.

**If required checks are pending forever:** inspect whether `merge_group`
actually triggered, whether the required names still match, and whether a
workflow's job-level guards or filters unintentionally skip execution.
Remove the test candidate from the queue to restore normal development if
needed; do **not** disable required checks to unblock it.

**If a queued PR fails:** GitHub should not merge it. Return the failed
candidate and its exact integration-check evidence to the author for repair.
New code requires fresh review/approval. Later PRs may need new integration
runs against updated `main`.

## Current proposed review order (not yet approved to merge)

1. [#180 Hub Continue](https://github.com/Bibleberry/Bibleberry/pull/180) — **Merged** (`0cf2175`).
2. [#181 CMS Resources](https://github.com/Bibleberry/Bibleberry/pull/181) — Ready for Review, ordinary CI passing; awaiting explicit owner batch/queue authorization.
3. [#184 News](https://github.com/Bibleberry/Bibleberry/pull/184) — Held for navigation-fix review.
4. [#183 Library–Shelf](https://github.com/Bibleberry/Bibleberry/pull/183) — Draft.

[#182 Account Sessions](https://github.com/Bibleberry/Bibleberry/pull/182)
remains held for a separate session-security review. Existing #166, #164 and
dependency PRs are not part of this proposed queue batch.

## Batch coordinator (Issue #202)

A single-approval, event-driven batch coordinator is implemented in:

- [`.github/workflows/merge-queue-batch.yml`](../../.github/workflows/merge-queue-batch.yml)
- [`scripts/ci/merge-queue-batch.ts`](../../scripts/ci/merge-queue-batch.ts)
- [`scripts/ci/merge-queue-batch-lib.ts`](../../scripts/ci/merge-queue-batch-lib.ts)

### Why `GITHUB_TOKEN` alone is insufficient

1. **Durable cross-run state:** Unattended advancement without a long-running polling job persists batch state in the repository Actions variable `MERGE_QUEUE_BATCH_STATE` and advances via `pull_request` (`closed`) and `merge_group` (`destroyed`) events. Default `GITHUB_TOKEN` cannot write repository Actions variables.
2. **Owner approval gate:** `workflow_dispatch` alone does not enforce an owner review checkpoint. A dedicated GitHub Environment (`merge-queue-approval`) with **Required reviewers = `ContraPhilosophy`** ensures Aaron explicitly approves the batch before any PR is enqueued.

### Required owner setup (one-time)

Before running `action: start` in GitHub Actions:

1. **Create Environment `merge-queue-approval`** in repository Settings → Environments:
   - Add **Required reviewers**: `ContraPhilosophy` (Aaron).
   - Set **Deployment branches and tags** to **Selected branches and tags** and allow **`main` only**.
   - Note: `start` and `abort` fail closed by verifying `/actions/runs/{run_id}/approvals` against `ContraPhilosophy` and `merge-queue-approval`, so an unconfigured or unprotected environment cannot enqueue PRs.
2. **Create secret `MERGE_QUEUE_TOKEN`** (either as a repository secret so `advance-or-stop` can advance unattended after merge, or via a GitHub App installation token):
   - Use a fine-grained PAT (or GitHub App) scoped **only** to `Bibleberry/Bibleberry` with minimum permissions:
     - **Contents:** Read and write (required by `enqueuePullRequest` on protected `main`)
     - **Pull requests:** Read and write (required by `enqueuePullRequest`)
     - **Variables:** Read and write (required to persist `MERGE_QUEUE_BATCH_STATE`)
3. **Optional queue setting check:** `main`'s native merge queue is active (`mergeMethod: SQUASH`). Note that GitHub currently reports `maximumEntriesToBuild: 5` and `maximumEntriesToMerge: 5`; the coordinator enforces one-PR-at-a-time entry regardless, or Aaron may lower those values to `1` and `1` in branch protection settings.

### Operator usage

1. **Dry-run preflight (read-only, no secret or environment approval required):**
   - Run **Actions → Merge Queue Batch Coordinator → Run workflow** with `action: dry-run` and `entries: <PR_NUMBER>@<40_CHAR_SHA>,...` (or locally via `GH_TOKEN="$(gh auth token)" node --experimental-strip-types scripts/ci/merge-queue-batch.ts preflight --entries "..."`).
2. **Authorize and start a batch:**
   - Run **Actions → Merge Queue Batch Coordinator → Run workflow** with `action: start` and the exact ordered `PR_NUMBER@REVIEWED_HEAD_SHA` list.
   - Preflight validates every PR (open, not Draft, base `main`, exact head SHA, no conflicts, no requested changes or unresolved conversations, passing required checks; `BEHIND` alone is allowed).
   - Approve the `merge-queue-approval` deployment in the workflow run UI.
   - The coordinator re-verifies PR #1's exact head SHA immediately before calling GraphQL `enqueuePullRequest(pullRequestId, expectedHeadOid)` and records `MERGE_QUEUE_BATCH_STATE`.
3. **Unattended advancement and failure recovery:**
   - When the active PR merges, `pull_request` (`closed`, `merged: true`) triggers `advance-or-stop`, which re-validates the next approved PR's exact SHA and enqueues it. All state-mutating jobs (`authorize-and-start`, `advance-or-stop`, `reconcile-watchdog`, `reconcile`, `abort`) share a single-writer concurrency group (`merge-queue-batch-writer`, `cancel-in-progress: false`, `queue: max`), queuing pending writers in FIFO order (up to GitHub's 100-pending-run limit) rather than replacing pending runs; `advance`/`reconcile` also verify monotonic state `revision` and `abortRequestedBy` before any queue mutation.
   - The 15-minute `schedule` watchdog (`reconcile-watchdog`) and manual `action: reconcile` remain in place to recover from lost webhooks, indeterminate enqueue errors, or other failures.
   - On head-SHA drift, failed check, conflict, `merge_group` destruction (`reason != merged`), or closed-without-merge, the coordinator marks `MERGE_QUEUE_BATCH_STATE` as `stopped`, leaves remaining PRs unenqueued, and reports the exact reason in the workflow summary.
   - Use `action: status` to inspect `MERGE_QUEUE_BATCH_STATE`, `action: reconcile` (owner-gated) to recover an interrupted `enqueuing`/`running` state against live GitHub PRs without double-enqueueing, or `action: abort` (approval-gated) to dequeue the active queued PR via `dequeuePullRequest` and mark the batch `aborted`.

This runbook does not authorize opening a queue or merging a feature PR.
