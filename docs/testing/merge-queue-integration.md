# Bibleberry protected direct-merge batch coordinator runbook (Copper Turnstile)

**Status:** Coordinator adapted to protected direct PR merging (revising native-queue PR [#203](https://github.com/Bibleberry/Bibleberry/pull/203); tracking [#202](https://github.com/Bibleberry/Bibleberry/issues/202)). Live activation and acceptance rehearsal require Independent Review and separate owner authorization.  
**Owner:** Aaron Waid (`ContraPhilosophy`).  
**Tracking:** [#202](https://github.com/Bibleberry/Bibleberry/issues/202) (Copper Turnstile), [#243](https://github.com/Bibleberry/Bibleberry/issues/243) (Velvet Meteor — preserved as the independent settings and operational audit record), [#367](https://github.com/Bibleberry/Bibleberry/issues/367) (Claude Says — CI coverage and toolchain coordination).

---

## 1. Purpose and governance boundary

Copper Turnstile provides **optional, unattended, approval-gated batch coordination over ordinary protected PR merging**. It replaces the earlier mandatory GitHub native merge-queue dependency (`mergeQueue` is now disabled on `main`) while preserving the normal individual PR merge experience and [AI Development Protocol §2C](../ai-development-protocol.md#2c-protected-merge-authorization-and-coordination).

- **Owner-only merge authority:** Development agents work on PRs; Independent Review evaluates exact commits, returns defects, and records technical disposition (and owns routine Checks & Merge under §2C); **only Aaron authorizes merge or batch execution**.
- **Explicit, immutable batch scope:** A batch specifies an exact ordered list of `PR_NUMBER@REVIEWED_HEAD_SHA` entries. The coordinator never auto-selects PRs, promotes Draft PRs, or substitutes unapproved revisions.
- **No protection bypass:** Every merge uses GitHub's supported protected PR merge endpoint (`PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge`) with exact `sha` validation and an allowed repository `merge_method`. The coordinator never bypasses branch protection, uses administrative override, pushes directly to `main`, or force-pushes.
- **Default §2C HOLD after branch updates:** When a behind PR is automatically updated from `main`, the resulting integration merge commit has a new HEAD SHA. Under the default policy (`hold-on-update`), the coordinator verifies provenance, waits for ordinary PR CI on the updated HEAD, and **HOLDS** for Independent Review / Aaron re-authorization rather than weakening §2C.

---

## 2. Normal single-PR merging (unchanged)

Manual individual PR merging remains completely available at all times:

1. Open or review a Ready-for-review PR targeting `main`.
2. Confirm ordinary PR CI checks pass (required checks plus applicable browser, Android, and `iOS verification summary` / `iOS Runtime Verified` evidence per [Native CI Trigger Parity](native-ci-trigger-parity.md#checks--merge-handoff)).
3. If the PR is behind `main`, update the branch normally and wait for ordinary PR CI on the updated HEAD.
4. Once Independent Review disposition, required checks, conversation resolution, and Aaron's explicit authorization are recorded for the exact HEAD, merge normally via GitHub's protected PR merge UI/CLI (no merge queue required).

If a manual merge lands on `main` while a Copper Turnstile batch is active, the coordinator rechecks `main` before every mutation and handles base advancement safely (see Section 8).

---

## 3. Architecture and files

Copper Turnstile adapts the existing implementation in place (no competing coordinator or separate tracking Issue):

- [`.github/workflows/merge-queue-batch.yml`](../../.github/workflows/merge-queue-batch.yml) — trusted default-branch workflow (`permissions: {}`, default-branch-only checkouts with `persist-credentials: false`, SHA-pinned actions, idle zero-runner variable gating, single-writer FIFO concurrency).
- [`scripts/ci/merge-queue-batch.ts`](../../scripts/ci/merge-queue-batch.ts) — GitHub REST + GraphQL client and CLI (`preflight`, `start`, `advance`, `sync`, `checks`, `reconcile`, `status`, `abort`).
- [`scripts/ci/merge-queue-batch-lib.ts`](../../scripts/ci/merge-queue-batch-lib.ts) — input parser, check/review verification, integration provenance verifier, write-ahead v2 state machine, legacy v1 preservation, and recovery logic.
- [`tests/ci/merge-queue-batch.test.ts`](../../tests/ci/merge-queue-batch.test.ts) — unit, failure-mode, race, recovery, and workflow security tests.

### How a batch executes

1. **Preflight (`dry-run` or before `start`):** Read-only validation against live `main`, repository merge-method settings, branch protection (when readable), PR state/base/repo/Draft/conflicts, reviews, unresolved conversations, and checks. Zero writes.
2. **Owner approval (`start`):** Requires `github.ref == 'refs/heads/main'`, `github.actor == 'ContraPhilosophy'`, GitHub Environment `merge-queue-approval` approval, and fail-closed runtime verification of `/actions/runs/{run_id}/approvals`.
3. **Current PR fast path:** If the active PR is already up to date with `main` (`behindBy === 0`, not `BEHIND`) and all applicable checks and approvals are valid on the exact reviewed HEAD, the coordinator persists write-ahead `status: merging` and calls `PUT /pulls/{n}/merge` directly **without** calling `update-branch` or triggering an unnecessary new CI cycle.
4. **Behind PR automatic branch update:** If the active PR is behind `main` (for example, PR #2 after PR #1 merges), the coordinator persists write-ahead `status: updating` and calls `PUT /pulls/{n}/update-branch` bound to `expected_head_sha`.
5. **Provenance verification & ordinary PR CI wait:** When the update commit lands (`pull_request: synchronize` or `reconcile`), the coordinator verifies that the commit is strictly a 2-parent merge commit `[previousAuthorizedHead, acceptedMainCommit]` with no rewritten history, extra commits, or unauthorized source edits, transitions to `status: awaiting_checks`, and exits without holding a polling runner. `check_suite: completed` (and the 15-minute watchdog) wake up to evaluate ordinary PR CI.
6. **Post-CI policy gate:** Once ordinary PR CI passes on the updated HEAD, the coordinator re-reads effective approval requirements and applies the integration policy (defaulting to **`status: held`** under §2C).

---

## 4. Required GitHub settings (verified vs UI-only)

### Verified live repository settings (read-only API audit, 2026-11-27, `main` = `b8a3cafb34ef781d2d810c8d861c72f18d5a7f25`)

| Setting | Verified live value | Operational implication |
| --- | --- | --- |
| Repository visibility / default branch | `public` / `main` | Public-repo hosted runners (`ubuntu-24.04`, `macos-26`). |
| Native merge queue (`mergeQueue`) | `null` (disabled) | Ordinary protected direct PR merging is active. |
| `required_status_checks.strict` | `true` | Branches must be up to date with `main` before merging; behind PRs require `update-branch` + fresh PR CI. |
| `required_status_checks.contexts` | `Build reader application`, `Verify Sanity Studio` (`app_id: 15368`) | Coordinator unions live branch protection required checks (when readable) with this floor, so adding Claude Says [#367](https://github.com/Bibleberry/Bibleberry/issues/367) checks later is picked up automatically. |
| `required_pull_request_reviews` | `required_approving_review_count: 0`, `dismiss_stale_reviews: false`, `require_last_push_approval: false` | GitHub does **not** currently enforce native PR approvals or dismiss stale reviews on push. Under §2C, Copper Turnstile defaults to `hold-on-update` rather than relying on GitHub's `reviewDecision` alone. |
| `required_conversation_resolution` | `true` | Unresolved review threads block both preflight and GitHub merge. |
| `enforce_admins` | `true` | Protected rules apply to administrators too. |
| `allow_force_pushes` / `allow_deletions` | `false` / `false` | Protected `main` history cannot be rewritten. |
| Repository merge methods | `allow_squash_merge: true`, `allow_merge_commit: true`, `allow_rebase_merge: true`, `delete_branch_on_merge: true` | Coordinator defaults to `squash` and validates the requested method against live repo settings before mutating. |
| `allow_auto_merge` / `allow_update_branch` | `true` / `false` | `PUT /pulls/{n}/update-branch` works under `strict: true` regardless of the UI `allow_update_branch` hint. |
| Repository rulesets | `[]` (none) | Classic branch protection on `main` is the active rule source. |
| Environments | Only `copilot` exists | **`merge-queue-approval` is NOT yet created** (owner setup required before `start`). |
| Actions variables | `[]` (`MERGE_QUEUE_BATCH_STATE` absent) | **No unresolved active legacy batch exists.** |
| Actions secrets | Empty | **No Copper Turnstile credentials configured yet** (owner setup required before `start`). |
| Default Actions workflow permissions | `read`; `can_approve_pull_request_reviews: false` | Workflows cannot self-approve PRs or write repo variables with `GITHUB_TOKEN`. |

### Settings requiring GitHub Settings UI verification (inaccessible or outside repo REST scope)

- Installed GitHub Apps and their granted repository permissions (Settings → Integrations → GitHub Apps).
- Organization-level secrets/variables and Actions billing/spending limits (Settings → Billing / Actions).
- Any future branch-protection updates (for example, adding Claude Says [#367](https://github.com/Bibleberry/Bibleberry/issues/367)'s `Reader browser suites (Chromium)` and `Build and verify R06 release artifact` jobs as required checks, or enabling `required_approving_review_count` / `dismiss_stale_reviews`).

---

## 5. Automation credentials and execution security

### Identity comparison

| Option | Triggers ordinary PR CI after `update-branch`? | Can persist `MERGE_QUEUE_BATCH_STATE`? | Token lifetime & identity | Recommendation |
| --- | --- | --- | --- | --- |
| **Repository-scoped GitHub App installation token** (`COPPER_TURNSTILE_APP_CLIENT_ID` + `COPPER_TURNSTILE_APP_PRIVATE_KEY`) | **Yes** | **Yes** | Short-lived (~1h), auto-revoked post-job, dedicated bot identity, scoped strictly to `Bibleberry/Bibleberry` | **Preferred** |
| **Fine-grained PAT** (`MERGE_QUEUE_TOKEN`) | **Yes** | **Yes** | Long-lived until expiry, tied to Aaron's personal user identity, requires manual rotation | Simpler fallback |
| **Default `GITHUB_TOKEN`** | **No** (GitHub suppresses Actions runs triggered by `GITHUB_TOKEN` to prevent recursion) | **No** (cannot write repository Actions variables) | Short-lived | **Insufficient** (used only for read-only `preflight` and approval verification) |

### Minimum necessary GitHub App permissions (scoped ONLY to `Bibleberry/Bibleberry`)

Configure the GitHub App installation for **Only select repositories → `Bibleberry/Bibleberry`** with strictly these repository permissions:

| Permission | Level | Why required |
| --- | --- | --- |
| **Contents** | Read and write | `PUT /pulls/{n}/update-branch` (creates merge commit on PR branch) and `PUT /pulls/{n}/merge` (merges into protected `main`). |
| **Pull requests** | Read and write | `PUT /pulls/{n}/update-branch`, `PUT /pulls/{n}/merge`, and PR GraphQL queries. |
| **Variables** (Actions variables) | Read and write | Persists durable write-ahead batch state in `MERGE_QUEUE_BATCH_STATE`. |
| **Checks** | Read-only | Reads check runs and commit SHAs for verification evidence. |
| **Commit statuses** | Read-only | Reads commit statuses for verification evidence. |
| **Actions** | Read-only | Reads workflow run approvals when needed (`GITHUB_TOKEN` with `actions: read` is primary). |
| **Administration** *(optional)* | Read-only | Allows reading live `GET /branches/main/protection` required checks dynamically. If omitted, the coordinator degrades cleanly (`protectionReadAccess: inaccessible`) and uses its configured required-check floor plus GitHub's server-side merge enforcement. |

**Never grant:** `Administration: write`, `Workflows: write`, `Secrets`, `Environments: write`, or organization-wide repository access.

### Credential isolation and trusted-source execution

- Top-level `permissions: {}` in `.github/workflows/merge-queue-batch.yml`.
- Every `actions/checkout` explicitly pins `ref: ${{ github.event.repository.default_branch }}` (`main`) with `persist-credentials: false`. Candidate PR code is **never** checked out or executed with automation credentials.
- Read-only jobs (`preflight` / `dry-run` and `status`) never receive `COPPER_TURNSTILE_APP_PRIVATE_KEY` or `MERGE_QUEUE_TOKEN`. `status` reads `vars.MERGE_QUEUE_BATCH_STATE` directly.
- Event-driven (`pull_request`, `check_suite`) and `schedule` watchdog jobs check `vars.MERGE_QUEUE_BATCH_STATE` in job-level `if:` expressions so **zero runners spin up and zero tokens are minted when no batch is active** (addressing [Velvet Meteor #243](https://github.com/Bibleberry/Bibleberry/issues/243)).
- `start`, manual `reconcile`, and `abort` require `github.ref == 'refs/heads/main'`, `github.actor == 'ContraPhilosophy'`, `environment: merge-queue-approval`, and runtime fail-closed `/actions/runs/{run_id}/approvals` verification.
- Persisted `v2` state stores an `authorizationDigest` (SHA-256 of repository, ordered `entries`, `integrationPolicy`, and `mergeMethod`) verified on every continuation/reconcile step to prevent state tampering or unauthorized substitution.

---

## 6. Review and integration-only update policy (§2C reconciliation)

When a behind PR (`H_orig`) is updated against accepted `main` (`M`), GitHub creates a new merge commit `H_new` with parents `[H_orig, M]`.

1. **Always verified on every automatic update:**
   - `H_new` has exactly 2 parents: `parents[0] === H_orig` and `parents[1]` is an accepted commit on `main`.
   - Every file changed in `H_orig..H_new` belongs to `mergeBase..M` (no unauthorized edits outside what `main` changed), and every file changed in `M..H_new` belongs to `mergeBase..H_orig` (no unauthorized additions outside the reviewed PR).
   - Non-overlapping file blob SHAs match `M` and `H_orig` exactly.
   - Ordinary PR CI must complete and pass on `H_new` with zero failed, missing, skipped-only, canceled, or stale checks.
   - Effective review requirements (`reviewDecision`, `latestReviews`, `requiredApprovingReviewCount`, `reviewThreads`) are re-read on `H_new`.

2. **Default active behavior — `hold-on-update` (strict §2C exact-HEAD):**
   - **Active by default and enforced by `.github/workflows/merge-queue-batch.yml`.**
   - After provenance verification and passing ordinary PR CI on `H_new`, the coordinator transitions to **`status: held`** and stops without merging `H_new`, leaving remaining PRs untouched.
   - Independent Review and Aaron inspect `H_new` and its CI evidence, then merge or authorize remaining entries.

3. **Investigated bounded policy (NOT ACTIVATED — requires explicit owner §2C decision):**
   - `scripts/ci/merge-queue-batch-lib.ts` models a narrowly bounded `integration-only` policy that is **hard-disabled by default** (`allowIntegrationOnlyPolicy: false`) and **not exposed** in `.github/workflows/merge-queue-batch.yml`.
   - Even if Aaron separately approves a §2C governance addendum and enables it in a follow-up PR, `integration-only` would ONLY permit merging `H_new` when **all** of the following hold simultaneously:
     1. Exact 2-parent merge commit `[H_orig, acceptedMain]` with verified blob SHAs.
     2. **Zero overlapping files** between `mergeBase..H_orig` and `mergeBase..M` (`PR_files ∩ MAIN_files === ∅`); any overlapping file ALWAYS holds for fresh Independent Review even if Git auto-merged cleanly.
     3. All ordinary PR CI checks pass on `H_new`.
     4. Effective GitHub review requirements remain satisfied on `H_new` (for example, if `dismiss_stale_reviews` or `required_approving_review_count > 0` requires fresh native approval, it stops/holds).
     5. Bounded update cap (`maxIntegrationUpdatesPerPr`) is not exceeded.
   - **Open owner decision:** Confirm whether to keep strict `hold-on-update` indefinitely (eliminating manual update clicks and CI waiting while requiring exact-HEAD approval for each updated PR) OR adopt a bounded §2C addendum enabling opt-in per-batch `integration-only` for disjoint-file merges.

---

## 7. Operator usage (dry-run, start, status, cancel, reconcile)

All actions live under **Actions → Copper Turnstile Batch Coordinator → Run workflow** (always select branch `main`).

1. **Dry-run preflight (read-only, zero writes, no secret or environment approval required):**
   - Select `action: dry-run`, enter ordered `entries: <PR>@<40_CHAR_SHA>,...`, and select `merge_method` (default `squash`).
   - Or run locally (read-only):
     `GH_TOKEN="$(gh auth token)" node --experimental-strip-types scripts/ci/merge-queue-batch.ts preflight --entries "371@<sha>,373@<sha>"`
2. **Authorize and start a batch (`action: start`):**
   - Select `action: start`, enter exact ordered `entries`, and choose `merge_method`.
   - `preflight` runs read-only first; if it passes, approve the `merge-queue-approval` deployment gate in the workflow UI.
   - Current verified PR #1 merges directly without a branch update; if PR #2 is behind the new `main`, Copper Turnstile updates PR #2's branch, verifies provenance, awaits ordinary PR CI, and holds per §2C.
3. **Inspect status (`action: status`):**
   - Read-only; prints current batch schema version, status, authorization, observed `main` SHA, active PR, integration updates, last verification summary, completed merges with accepted `mergeCommitSha`s, and next action.
4. **Cancel / abort (`action: abort`):**
   - Owner-gated (`ContraPhilosophy` + `merge-queue-approval`). Works during any stage (`running`, `updating`, `awaiting_checks`, `merging`, `held`, or unresolved legacy `v1`).
   - Persists `abortRequestedBy` immediately to block concurrent writers, checks whether an in-flight `merging` PR already landed on GitHub, marks the batch `aborted`, stops all subsequent mutations, and clearly lists all already-completed merges and their accepted `main` SHAs.
5. **Recover / reconcile (`action: reconcile`):**
   - Owner-gated manual recovery (plus automatic 15-minute `schedule` watchdog while a batch is active).
   - Recovers from missed webhooks, post-merge state-save failures, or indeterminate API timeouts without issuing duplicate `update-branch` or `merge` mutations.

---

## 8. Failure disposition and recovery

| Condition | Coordinator behavior | Operator next step |
| --- | --- | --- |
| Current PR fails preflight (wrong repo/base, Draft, closed, stale SHA, conflicts, invalid/stale review, unresolved threads, disallowed merge method) | Fails before any writes (`dry-run` or `start`). | Fix PR / obtain review / refresh exact SHA and re-run `dry-run`. |
| Behind PR has merge conflict (`422`) or unexpected post-update commit (non-merge, rewritten history, non-main parent, unauthorized file/blob edit) | Transitions to `stopped` with exact provenance/conflict error; never waits for CI or merges. | Resolve conflict or investigate unexpected commits; re-review new HEAD. |
| Overlapping file changed by both `main` and PR | Transitions to `held` (even if Git auto-merged cleanly). | Independent Review inspects overlapping merge commit; merge or re-authorize explicitly. |
| Failed, missing, skipped-only, canceled, or stale check on candidate HEAD | Transitions to `stopped` with exact check classification. | Inspect failing/canceled/stale CI run, repair PR, re-review. |
| Ordinary PR CI exceeds timeout (`90m` default) | Transitions to `stopped` with `verdict: timed_out`. | Check Actions runner status; reconcile or restart once CI is healthy. |
| Permission failure (`403`) or branch-protection rejection (`405`) | Transitions to `stopped` with exact GitHub HTTP error. | Verify GitHub App permissions and branch-protection status. |
| Concurrent manual merge advances `main` before merge | Rechecks `main`; handles `409 Base branch was modified` by transitioning cleanly to behind-branch update (subject to `maxIntegrationUpdatesPerPr` cap -> `held`). | Monitor ordinary PR CI or inspect `held` state. |
| Active PR closed without merge or merged externally outside coordinator's `merging` step | Transitions to `stopped`; never mistakes closure or unverified manual merge for batch completion. | Inspect accepted `main` and remaining PRs; start a fresh batch for remaining PRs if desired. |
| Interrupted network/5xx response during `update-branch` or `merge` | Preserves write-ahead `updating`/`merging` state; `reconcile` verifies live GitHub state and recovers without issuing duplicate mutations. | Let 15-min watchdog run or trigger manual `reconcile`. |
| Simultaneous `start` while a batch is active, `held`, or unresolved legacy `v1` | Refuses `start` without overwriting existing state. | Run `status`, `reconcile`, or `abort` on the existing batch first. |

---

## 9. Migration and rollback (from legacy native-queue coordinator)

- **Verified live state (2026-11-27):** `MERGE_QUEUE_BATCH_STATE` does not currently exist (`variables: []`), so **zero active legacy `v1` batches exist**.
- **Safety guarantee if a legacy `v1` batch ever exists:** `v2` explicitly detects `version: 1` state. Terminal legacy states (`completed`, `stopped`, `aborted`) allow starting a new `v2` batch cleanly. Unresolved active legacy states (`enqueuing` or `running`) are **never discarded**: `start` refuses to overwrite them, `reconcile` safely inspects the PR (without calling `enqueuePullRequest`), and `abort` safely dequeues via `dequeuePullRequest` if `isInMergeQueue` is still true.
- **Watchdog migration:** The 15-minute `schedule` watchdog now checks `vars.MERGE_QUEUE_BATCH_STATE` in its job `if:` condition, eliminating idle scheduled runner usage when no batch is active (including terminal states).
- **Rollback procedure:**
  1. Run `action: status` and, if any batch is active or `held`, run `action: abort` first so no batch is left mid-flight.
  2. Disable the workflow in GitHub Actions UI (or revert the Copper Turnstile PR) — normal manual protected PR merging continues uninterrupted because `main` branch protection does not depend on Copper Turnstile.
  3. Optionally revoke/uninstall the GitHub App or delete `COPPER_TURNSTILE_APP_PRIVATE_KEY` / `MERGE_QUEUE_TOKEN`.

---

## 10. Exact owner configuration steps (one-time, after review & merge)

Do **not** perform these steps until Independent Review approves and Aaron merges the Copper Turnstile PR:

1. **Create GitHub Environment `merge-queue-approval`** (Repository Settings → Environments → New environment):
   - Enable **Required reviewers** and add `ContraPhilosophy`.
   - Under **Deployment branches and tags**, select **Selected branches and tags** and add **`main`** only.
2. **Create and install a repository-scoped GitHub App (preferred)** (GitHub Developer Settings → GitHub Apps → New GitHub App):
   - Name: e.g. `Bibleberry Copper Turnstile` (Webhook: unchecked / inactive).
   - Repository permissions: **Contents: Read and write**, **Pull requests: Read and write**, **Variables: Read and write**, **Checks: Read-only**, **Commit statuses: Read-only**, **Actions: Read-only**, and optionally **Administration: Read-only**.
   - Install the App on **Only select repositories → `Bibleberry/Bibleberry`**.
   - Generate a private key (`.pem`) and copy the App's **Client ID**.
   - In `Bibleberry/Bibleberry` Settings → Secrets and variables → Actions:
     - **Variables tab:** create `COPPER_TURNSTILE_APP_CLIENT_ID` = `<App Client ID>`.
     - **Secrets tab:** create `COPPER_TURNSTILE_APP_PRIVATE_KEY` = `<PEM contents>`.
   - *(Fallback alternative if deferring App creation: create a fine-grained PAT scoped only to `Bibleberry/Bibleberry` with the same minimum permissions and store it as repository secret `MERGE_QUEUE_TOKEN`.)*
3. **Verify `main` branch protection remains intact** (Settings → Branches → `main`):
   - Confirm Require merge queue stays **off**, Require status checks to pass + **Require branches to be up to date** (`strict: true`) stay **on**, required checks include `Build reader application` and `Verify Sanity Studio` (plus any Claude Says [#367](https://github.com/Bibleberry/Bibleberry/issues/367) checks Aaron elects to require), Require conversation resolution stays **on**, and Do not allow bypassing (`enforce_admins`) stays **on**.

---

## 11. Proposed separately authorized live acceptance rehearsal

**Do not use real feature PRs for acceptance testing.** After merge and owner configuration, Aaron may separately authorize a bounded live rehearsal using **two trivial non-feature canary PRs** (for example, adding two disjoint comment/timestamp lines to a scratch rehearsal section in a docs file, Ready for review, passing ordinary CI):

1. **Rehearsal 1 — Zero-write dry-run:** Run `action: dry-run` with `CANARY_1@SHA_1,CANARY_2@SHA_2`. Verify `PASS` table, zero writes to `MERGE_QUEUE_BATCH_STATE`, zero branch updates, zero merges.
2. **Rehearsal 2 — Current direct merge + behind automatic update + §2C HOLD:** Run `action: start` with `CANARY_1@SHA_1,CANARY_2@SHA_2` and approve `merge-queue-approval`. Verify:
   - `CANARY_1` merges directly via `squash` **without** triggering a new CI cycle, recording its accepted `mergeCommitSha`.
   - `CANARY_2` (now behind `main`) receives an automatic `update-branch` commit from the GitHub App identity, **automatically triggering ordinary PR CI** on `CANARY_2`.
   - Provenance verification succeeds and records `integrationUpdates`.
   - After ordinary PR CI passes on `CANARY_2`, Copper Turnstile transitions to **`status: held`** (does NOT merge `CANARY_2` under default §2C policy).
3. **Rehearsal 3 — Status, cancellation, and idle zero-runner check:** Run `action: status` (confirming read-only output with completed merge #1 and held PR #2), then `action: abort` (confirming clean transition to `aborted` reporting completed merge #1), and confirm the next 15-minute `schedule` tick allocates zero runner execution when idle.
4. **Cleanup:** Close or merge `CANARY_2` normally under Aaron's direction and confirm normal single-PR manual merging remains unaffected.

---

## 12. Historical context (superseded native-queue preparation)

- Native merge queue CI preparation (`merge_group` triggers in `ci.yml`, `collections-browser.yml`, `native-android.yml`, and `scripts/ci/check-scope.mjs`) was introduced in [#195](https://github.com/Bibleberry/Bibleberry/issues/195) and proven in [#201](https://github.com/Bibleberry/Bibleberry/pull/201) ([proof record](merge-queue-activation-proof-2026-11-17.md)).
- Draft-PR waiting-room CI suppression was later removed on public hosted runners by Silver Badger ([#239](https://github.com/Bibleberry/Bibleberry/issues/239); see [draft-pr-hosted-ci.md](draft-pr-hosted-ci.md)).
- PR [#203](https://github.com/Bibleberry/Bibleberry/pull/203) introduced the initial v1 native-queue batch coordinator; Velvet Meteor ([#243](https://github.com/Bibleberry/Bibleberry/issues/243)) audited live operations after the owner shifted to protected direct PR merging. Those `merge_group` subscriptions in `ci.yml`, `collections-browser.yml`, and `native-android.yml` remain intentionally untouched by this PR pending separate cleanup authorization under [#243](https://github.com/Bibleberry/Bibleberry/issues/243) and coordination with Claude Says ([#367](https://github.com/Bibleberry/Bibleberry/issues/367)).

This runbook does not authorize merging feature PRs, changing repository settings, creating credentials, or activating an integration-only policy without Aaron's explicit approval.
