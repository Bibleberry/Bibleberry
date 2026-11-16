# Bibleberry merge-queue integration runbook

**Status:** CI preparation PR; **GitHub merge queue is not enabled by this file**.
**Owner:** Aaron Waid. **Tracking:** [#195](https://github.com/Bibleberry/Bibleberry/issues/195).

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

**iOS:** `Native iOS simulator build` remains PR/push/workflow_dispatch only
and is **not** a merge-queue gate at this stage. Its simulator runtime
installation/lifecycle checks have experienced runner timeouts. Keep its
existing PR checks; investigate and stabilize before deciding to make it a
queue-required check. Do not treat absence of a queue-specific iOS run as
evidence that iOS integration was verified.

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

1. [#184 News](https://github.com/Bibleberry/Bibleberry/pull/184)
2. [#180 Hub Continue](https://github.com/Bibleberry/Bibleberry/pull/180)
3. [#181 CMS Resources](https://github.com/Bibleberry/Bibleberry/pull/181)
4. [#183 Library–Shelf](https://github.com/Bibleberry/Bibleberry/pull/183)

[#182 Account Sessions](https://github.com/Bibleberry/Bibleberry/pull/182)
remains held for a separate session-security review. Existing #166, #164 and
dependency PRs are not part of this proposed queue batch.

## Follow-up: one-action batch enqueue

Separate from CI enablement, implement a manually invoked, security-reviewed
batch coordinator that accepts an explicit ordered list of PR numbers and
**reviewed head SHAs**, validates readiness/approval/unchanged revisions, and
requests GitHub queue entry. It must never promote draft PRs automatically,
silently substitute newer revisions, choose extra PRs, or bypass branch
protection. Protect any write-capable token; use least privilege, GitHub
environments/approval controls if available, and audit the authorization and
outcome of each attempted entry. A pure manual queue-entry workflow is
acceptable until the batch coordinator is verified.

This runbook does not authorize opening a queue or merging a feature PR.
