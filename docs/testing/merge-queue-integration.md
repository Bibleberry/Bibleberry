# Bibleberry protected direct-merge batch coordinator runbook (Copper Turnstile)

**Status:** Coordinator adapted to protected direct PR merging with default-branch credential isolation, reliable `workflow_run` CI wakeup, fail-closed Independent Review verification, and owner-approved bounded §2C `integration-only` batch advancement (PR [#376](https://github.com/Bibleberry/Bibleberry/pull/376); tracking [#202](https://github.com/Bibleberry/Bibleberry/issues/202)). Live activation and acceptance rehearsal require Independent Review and separate owner authorization.  
**Owner:** Aaron Waid (`ContraPhilosophy`).  
**Tracking:** [#202](https://github.com/Bibleberry/Bibleberry/issues/202) (Copper Turnstile), [#243](https://github.com/Bibleberry/Bibleberry/issues/243) (Velvet Meteor — preserved as the independent settings and operational audit record), [#367](https://github.com/Bibleberry/Bibleberry/issues/367) / PR [#375](https://github.com/Bibleberry/Bibleberry/pull/375) (Claude Says — accepted CI coverage and `.nvmrc` Node pinning on `main` `09d7f4c`), [#377](https://github.com/Bibleberry/Bibleberry/issues/377) (Ancient Codex — required-check configuration follow-up for the two new `Bibleberry CI` jobs).

---

## 1. Purpose and governance boundary

Copper Turnstile provides **optional, unattended, single-approval batch coordination over ordinary protected PR merging**. It replaces the earlier mandatory GitHub native merge-queue dependency (`mergeQueue` is disabled on `main`) while preserving the normal individual PR merge experience and [AI Development Protocol §2C](../ai-development-protocol.md#2c-protected-merge-authorization-and-coordination).

- **Simple operator experience:**
  - **One current, approved PR:** Merge normally via GitHub UI (unchanged) — or submit via Copper Turnstile to merge directly without triggering another CI cycle.
  - **Multiple approved PRs:** Authorize the exact ordered `PR_NUMBER@REVIEWED_HEAD_SHA` batch once and leave it unattended. The coordinator merges current PRs directly, automatically updates behind PRs from accepted `main`, wakes up immediately when ordinary GitHub Actions CI finishes, verifies all bounded §2C invariants, and advances until the batch completes — stopping or holding **only** when something genuinely requires human or Independent Review intervention.
- **Fail-closed Independent Review gate & shared-account attestation:** An owner-entered SHA and green CI are **never** substitutes for independent review, and in a public repository an arbitrary non-author GitHub user is **never** a trusted reviewer identity. Every batch entry must be verified by one of two fail-closed paths:
  1. **Owner-attested review comment ID (`PR_NUMBER@REVIEWED_HEAD_SHA#REVIEW_COMMENT_ID`, current shared-account operating model):** Because implementation agents and Independent Review currently post under the shared `ContraPhilosophy` account, account login alone cannot prove departmental independence. **Independent Review prepares the copyable ordered `PR@SHA#REVIEW_COMMENT_ID` list** (e.g., `375@cecc4e035f622f37a35d8463c91c871f978857c2#7230996406`) so Aaron never has to manually hunt for comment IDs; Aaron reviews and pastes the list into the single batch authorization (zero extra clicks). Before uploading the immutable start-run manifest artifact, Copper Turnstile verifies each attested comment against live GitHub PR data (strict top-level 2-line Independent Review format rejecting blockquotes `>`, code fences ```` ``` ````, and mid-prose mentions; matching PR number and exact 40-char SHA; zero superseding blocking dispositions or unresolved threads) and **binds each verified SHA-256 `reviewCommentDigest` directly into the immutable manifest artifact**. Start and every continuation step re-verify the live comment body digest against that immutable manifest digest (defeating both post-authorization edits and mutable-state digest stripping/replacement). *Trust assumption (explicit):* under the shared account, owner selection/attestation of the Independent Review-prepared `#REVIEW_COMMENT_ID` list is what distinguishes genuine Independent Review comments from other posts on the shared account; migrating to a dedicated reviewer account in `authorizedNativeReviewers` removes this shared-account assumption whenever adopted.
  2. **Dedicated authorized native reviewer identity (`authorizedNativeReviewers`):** Native GitHub `APPROVED` reviews are accepted **only** when authored by a distinct identity explicitly listed in `authorizedNativeReviewers` (empty by default in a public repo so random external users are always rejected), distinct from the PR author, and carrying a non-null exact 40-char `commit.oid`.
- **No protection bypass:** Every merge uses GitHub's supported protected PR merge endpoint (`PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge`) with exact `sha` validation and an allowed repository `merge_method`. Before **every** write, the coordinator verifies live `main` branch protection fail-closed (`strict: true`, `enforce_admins: true`, `required_conversation_resolution: true`, no force-push/deletion, no PR bypass allowances, and baseline required checks present).

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

- [`.github/workflows/merge-queue-batch.yml`](../../.github/workflows/merge-queue-batch.yml) — trusted default-branch control plane (`permissions: {}`, default-branch-only triggers and checkouts with `persist-credentials: false`, two `main`-only GitHub Environments isolating runtime credentials from PR branches, `workflow_run: completed` immediate CI wakeup, idle zero-runner variable gating, single-writer FIFO concurrency).
- [`scripts/ci/merge-queue-batch.ts`](../../scripts/ci/merge-queue-batch.ts) — GitHub REST + GraphQL client (including paginated PR Conversation comments, live branch-protection/bypass inspection, and 300-file compare truncation detection) and CLI (`preflight`, `start`, `advance`, `sync`, `checks`, `reconcile`, `status`, `abort`).
- [`scripts/ci/merge-queue-batch-lib.ts`](../../scripts/ci/merge-queue-batch-lib.ts) — input parser, fail-closed Independent Review evaluator, fail-closed branch protection evaluator, strict check classifier, mechanical integration provenance verifier, write-ahead v2 state machine, legacy v1 preservation, and recovery logic.
- [`tests/ci/merge-queue-batch.test.ts`](../../tests/ci/merge-queue-batch.test.ts) — unit, failure-mode, race, review-gate, protection-safety, provenance, recovery, and workflow trust-boundary contract tests.
- [`docs/ai-development-protocol.md`](../ai-development-protocol.md#2c-protected-merge-authorization-and-coordination) — narrowly bounded §2C amendment for owner-authorized mechanical batch integration updates.

### How an unattended multi-PR batch executes

1. **Preflight (`dry-run` or before `start`):** Read-only validation against live `main`, repository merge-method settings, exact-HEAD Independent Review approval, unresolved threads, conflicts, and checks. Zero writes.
2. **Single owner approval (`start`):** `approve-start` runs in `environment: merge-queue-approval` (requiring `ContraPhilosophy` approval in the UI, zero secrets). Once approved, `authorize-and-start` runs in `environment: copper-turnstile-runtime` (`main`-only), verifies `/actions/runs/{run_id}/approvals` fail-closed, verifies live `main` branch protection fail-closed, and begins execution.
3. **Current PR fast path:** If PR #1 is already up to date with `main` (`behindBy === 0`, not `BEHIND`) and all checks, protection, and Independent Review requirements pass on the exact reviewed HEAD, Copper Turnstile persists write-ahead `status: merging` and calls `PUT /pulls/{n}/merge` directly **without** calling `update-branch` or triggering an unnecessary new CI cycle.
4. **Behind PR automatic branch update:** When PR #2 is behind the new `main`, Copper Turnstile persists write-ahead `status: updating` and calls `PUT /pulls/{n}/update-branch` bound to `expected_head_sha` using the `copper-turnstile-runtime` GitHub App installation token (which triggers ordinary GitHub Actions PR CI automatically).
5. **Mechanical integration provenance & immediate CI wakeup:**
   - `pull_request_target: synchronize` wakes up from `main`, verifies that the new commit is strictly a 2-parent merge `[previousAuthorizedHead, acceptedMain]` with non-truncated diffs (<300 files), exact commit count, unaltered PR/main blob hashes, and zero overlapping files (holding immediately if any file overlapped!).
   - Copper Turnstile transitions to `status: awaiting_checks` and exits (zero polling runner minutes).
   - When ordinary CI workflows (`Bibleberry CI`, `Collections Browser Tests`, `Native Android debug build`, `Native iOS simulator build`, `PR Assignment Identity`) complete, **`workflow_run: completed`** wakes up Copper Turnstile immediately from `main` (without consuming workflow artifacts or triggering recursively).
   - Once all fresh checks on the integration commit pass, Copper Turnstile re-verifies owner run approval, live branch protection, and review/thread eligibility, merges PR #2 via protected `PUT /pulls/{n}/merge`, and immediately begins PR #3!
   - The 15-minute `schedule` watchdog remains strictly as an idle-gated recovery fallback for missed events or interrupted API calls.

---

## 4. Required GitHub settings (verified vs UI-only)

### Verified live repository settings (read-only API audit, 2026-11-27, `main` = `b8a3cafb34ef781d2d810c8d861c72f18d5a7f25`)

| Setting | Verified live value | Operational implication |
| --- | --- | --- |
| Repository visibility / default branch | `public` / `main` | Public-repo hosted runners (`ubuntu-24.04`, `macos-26`). |
| Native merge queue (`mergeQueue`) | `null` (disabled) | Ordinary protected direct PR merging is active. |
| `required_status_checks.strict` | `true` | Verified fail-closed before every write. |
| `required_status_checks.contexts` | `Build reader application`, `Verify Sanity Studio` (`app_id: 15368`) | Coordinator unions live branch protection required checks with this floor; once [Ancient Codex #377](https://github.com/Bibleberry/Bibleberry/issues/377) adds `Reader browser suites (Chromium)` and `Build and verify R06 release artifact` (accepted in PR [#375](https://github.com/Bibleberry/Bibleberry/pull/375) under `Bibleberry CI`, where scope-guarded irrelevant diffs conclude `SUCCESS` without deadlocking), Copper Turnstile enforces them automatically. |
| `required_pull_request_reviews` | `required_approving_review_count: 0`, `dismiss_stale_reviews: false`, `require_last_push_approval: false`, no bypass allowances | Because GitHub does not natively enforce approvals when count is `0`, Copper Turnstile enforces fail-closed exact-HEAD Independent Review verification directly against trusted PR Conversation dispositions and non-null-OID native reviews. |
| `required_conversation_resolution` | `true` | Verified fail-closed before every write. |
| `enforce_admins` | `true` | Verified fail-closed before every write. |
| `allow_force_pushes` / `allow_deletions` | `false` / `false` | Verified fail-closed before every write. |
| Repository merge methods | `allow_squash_merge: true`, `allow_merge_commit: true`, `allow_rebase_merge: true`, `delete_branch_on_merge: true` | Coordinator defaults to `squash` and validates the requested method against live repo settings before mutating. |
| Environments | Only `copilot` exists | **`merge-queue-approval` and `copper-turnstile-runtime` are NOT yet created** (owner setup required after review & merge). |
| Actions variables / secrets | `[]` / empty | **No unresolved active legacy batch and no credentials exist yet.** |

### Settings requiring GitHub Settings UI verification

- Installed GitHub Apps and their granted repository permissions (Settings → Integrations → GitHub Apps).
- Organization-level secrets/variables and Actions billing/spending limits (Settings → Billing / Actions).
- Any future branch-protection updates (specifically [Ancient Codex #377](https://github.com/Bibleberry/Bibleberry/issues/377) adding `Reader browser suites (Chromium)` and `Build and verify R06 release artifact` from accepted PR [#375](https://github.com/Bibleberry/Bibleberry/pull/375)).

---

## 5. Trusted credential boundary and execution security

### Why two `main`-only Environments with ZERO repository-level write secrets

Storing a write-capable App private key or PAT as a **repository-level secret** would allow a hostile same-repo PR branch modifying `.github/workflows/*.yml` (triggered by `pull_request` or `push`) to read that secret. Copper Turnstile eliminates this entire class of attack with zero extra infrastructure:

1. **Zero repository-level write secrets:** Never store `COPPER_TURNSTILE_APP_PRIVATE_KEY` (or optional `MERGE_QUEUE_TOKEN`) at the repository level.
2. **Environment 1 — `merge-queue-approval` (Interactive Owner Approval Gate, ZERO secrets):**
   - **Required reviewers:** `ContraPhilosophy`.
   - **Deployment branches and tags:** **Selected branches and tags → `main` only**.
   - **Secrets:** **None.** Used strictly by `approve-start`, `approve-reconcile`, and `approve-abort` to record Aaron's single approval on `github.run_id`.
3. **Environment 2 — `copper-turnstile-runtime` (Unattended Default-Branch Runtime, holds the single App private key):**
   - **Required reviewers:** **None** (so unattended multi-PR advancement requires zero additional human clicks after `approve-start`).
   - **Deployment branches and tags:** **Selected branches and tags → `main` only**.
   - **Secrets:** `COPPER_TURNSTILE_APP_PRIVATE_KEY` (or optional `MERGE_QUEUE_TOKEN` fallback).
4. **Default-branch-only workflow triggers:**
   - `.github/workflows/merge-queue-batch.yml` has **NO ordinary `pull_request` trigger** and **NO `check_suite` trigger**.
   - `pull_request_target`, `workflow_run`, and `schedule` **always** execute workflow YAML from `refs/heads/main` with `github.ref == 'refs/heads/main'`.
   - **Hostile same-repo PR negative path:** Any workflow running on a PR branch (`pull_request`, feature-branch `push`, or non-`main` `workflow_dispatch`) runs on `refs/pull/<n>/merge` or `refs/heads/<feature-branch>`, **never** `refs/heads/main`. GitHub's server-side Environment deployment branch policy **hard-blocks** the job from entering `copper-turnstile-runtime`, so PR-authored workflows can never obtain `COPPER_TURNSTILE_APP_PRIVATE_KEY`.
5. **No untrusted execution or injection:**
   - Top-level `permissions: {}`; every `actions/checkout` pins `ref: ${{ github.event.repository.default_branch }}` with `persist-credentials: false`. Candidate PR code and `workflow_run` artifacts are **never** checked out, downloaded, or executed.
   - All dynamic event values (`EVENT_PR_NUMBER`, `EVENT_PR_MERGED`, `EVENT_WORKFLOW_HEAD_SHA`) pass strictly through `env:` (zero shell interpolation of PR titles, bodies, or branch names).
   - `pull_request_target` and `workflow_run` are treated purely as wakeup signals; the coordinator always re-reads live PR, commits, comments, checks, branch protection, and `/actions/runs/{state.workflowRunId}/approvals` directly from GitHub API!
   - **Immutable run-bound authorization manifest & independent Git chain proof:** During `authorize-and-start`, Copper Turnstile runs `emit-manifest` against live GitHub PR data **before** uploading the immutable run-attached artifact (`copper-turnstile-auth-manifest-<run_id>`), binding `owner`, `repo`, `workflowRunId`, `authorizedBy`, `mergeMethod`, `integrationPolicy`, and exact ordered `entries` **including each verified `reviewCommentId` and its live SHA-256 `reviewCommentDigest`**. Both `start` and every continuation/reconciliation step verify **all four** against GitHub API: (a) workflow run metadata (`path === '.github/workflows/merge-queue-batch.yml'`, `event === 'workflow_dispatch'`, `head_branch === 'main'`, `actor === 'ContraPhilosophy'`), (b) `approve-start` job completion + `merge-queue-approval` approval by `ContraPhilosophy`, (c) byte-for-byte match between persisted `MERGE_QUEUE_BATCH_STATE` (including every `reviewCommentDigest`) and the immutable manifest artifact attached to `state.workflowRunId`, and (d) for any changed PR HEAD (`candidateHeadSha !== immutableEntry.expectedHeadSha`), **independent live Git commit-chain re-proof** (`verifyIntegrationChainFromAuthorizedHead`) walking back from `candidateHeadSha` to immutable `entry.expectedHeadSha` through `1..maxIntegrationUpdatesPerPr` strict 2-parent merges against live accepted `main` (re-verifying parents, ancestry, commit count, non-truncated diffs, blob hashes, and file disjointness directly from Git without trusting `activeHeadSha`, `integrationUpdates[].provenanceVerified`, or `overlappingFiles` in mutable state). Substituting entries, stripping/replacing `reviewCommentDigest`, or forging `activeHeadSha` + `provenanceVerified: true` in `MERGE_QUEUE_BATCH_STATE` (even with a recomputed `stateChecksum` and a valid approved run ID) immediately fails closed. (Note: `stateChecksum` is documented strictly as a consistency checksum, never a cryptographic signature.)
   - Read-only `preflight` and `status` jobs never enter `copper-turnstile-runtime` or access write secrets.
   - Event-driven and watchdog jobs gate on active `vars.MERGE_QUEUE_BATCH_STATE` in job-level `if:` so **zero runners spin up when no batch is active** (resolving [Velvet Meteor #243](https://github.com/Bibleberry/Bibleberry/issues/243)).

### Identity comparison & minimum GitHub App permissions

| Option | Triggers ordinary PR CI after `update-branch`? | Can persist `MERGE_QUEUE_BATCH_STATE`? | Token lifetime & identity | Recommendation |
| --- | --- | --- | --- | --- |
| **Repository-scoped GitHub App installation token** (`COPPER_TURNSTILE_APP_CLIENT_ID` var + `COPPER_TURNSTILE_APP_PRIVATE_KEY` in `copper-turnstile-runtime`) | **Yes** | **Yes** | Short-lived (~1h), auto-revoked post-job, dedicated bot identity, scoped strictly to `Bibleberry/Bibleberry` | **Preferred** |
| **Fine-grained PAT** (`MERGE_QUEUE_TOKEN` in `copper-turnstile-runtime`) | **Yes** | **Yes** | Long-lived until expiry, tied to Aaron's personal user identity | Fallback |
| **Default `GITHUB_TOKEN`** | **No** (suppressed by GitHub Actions) | **No** | Short-lived | **Insufficient** (used only for read-only `preflight` and `/approvals` verification) |

**Minimum GitHub App repository permissions (install on `Only select repositories → Bibleberry/Bibleberry`):**

| Permission | Level | Why required |
| --- | --- | --- |
| **Contents** | Read and write | `PUT /pulls/{n}/update-branch` and `PUT /pulls/{n}/merge`. |
| **Pull requests** | Read and write | `PUT /pulls/{n}/update-branch`, `PUT /pulls/{n}/merge`, PR GraphQL snapshot. |
| **Issues** | Read-only | Reads paginated PR Conversation comments (`/issues/{n}/comments`) for fail-closed Independent Review verification. |
| **Variables** (Actions variables) | Read and write | Persists durable write-ahead batch state in `MERGE_QUEUE_BATCH_STATE`. |
| **Checks** | Read-only | Reads check runs and commit SHAs for verification evidence. |
| **Commit statuses** | Read-only | Reads commit statuses for verification evidence. |
| **Administration** | **Read-only (Required)** | Required to verify live `GET /branches/main/protection` invariants fail-closed before every write (no silent bypass if 403). |
| **Actions** | Read-only | Allows reading workflow run approvals alongside `GITHUB_TOKEN`. |

**Never grant:** `Administration: write`, `Workflows: write`, `Secrets`, `Environments: write`, or organization-wide access.

---

## 6. Independent Review gate and bounded §2C integration-only policy

1. **Exact-HEAD Independent Review gate (fail-closed on submitted `REVIEWED_HEAD_SHA`):**
   - Zero reviews (no authorized native reviewer approval and no owner-attested Independent Review comment) **always fails preflight and merge** — an owner-submitted SHA and green CI are never accepted alone.
   - Native GitHub `APPROVED` reviews are accepted only when authored by an identity explicitly listed in `authorizedNativeReviewers` (empty by default in this public repo so arbitrary non-author external users are always rejected), distinct from the PR author, AND carrying a **non-null exact 40-char `commit.oid`** matching `REVIEWED_HEAD_SHA` (null commit OIDs are rejected).
   - When `required_approving_review_count == 0` (Bibleberry's current shared-account configuration), **Independent Review prepares the copyable ordered `PR@SHA#REVIEW_COMMENT_ID` entries** so Aaron does not manually locate IDs. Copper Turnstile verifies the exact attested comment exists on that PR, strictly matches the top-level 2-line Independent Review format (rejecting quoted, fenced, or mid-prose text) for that exact PR and 40-char `REVIEWED_HEAD_SHA`, matches the SHA-256 `reviewCommentDigest` bound in the immutable start-run manifest across start and every continuation step, and has **no** chronologically newer blocking disposition (`CHANGES REQUESTED`, `HOLD`, `BLOCKED`, `REJECTED`), native `CHANGES_REQUESTED`, or unresolved review conversation.
   - Untrusted external commenters, unattested shared-account comments, edited/stripped digests, stale SHAs, and truncated comment lists fail closed.

2. **Bounded mechanical `integration-only` policy (amended §2C, active default):**
   - Per Aaron's November 27, 2026 Owner Direction and amended [AI Development Protocol §2C](../ai-development-protocol.md#2c-protected-merge-authorization-and-coordination), when Aaron authorizes an ordered batch, that authorization extends to subsequent mechanical `main`-into-PR branch updates **only** when Copper Turnstile independently re-proves all six invariants directly from live GitHub API and the immutable start-run manifest before every write/merge (never trusting mutable `activeHeadSha` or `integrationUpdates[].provenanceVerified` booleans):
     1. Original `REVIEWED_HEAD_SHA` retains verified exact-HEAD independent approval (including immutable `reviewCommentDigest` match) with no superseding blocker.
     2. Every commit in the chain from immutable `REVIEWED_HEAD_SHA` to candidate `H_new` (`1..maxIntegrationUpdatesPerPr` steps) is independently proven from live Git commits to be strictly a 2-parent merge `[previousStepHead, acceptedMainAncestor]` with exact commit count (no rebase, force-push, non-merge commit, or extra PR commits).
     3. Compare diffs for every step in the chain are non-truncated (`< 300` files) and every non-overlapping file blob hash matches accepted `main` and the reviewed PR respectively.
     4. **Zero overlapping files** across every integration step (`PR_files ∩ MAIN_files = ∅`); any overlapping file **immediately HOLDS** for fresh Independent Review even if Git auto-merged cleanly (and even if mutable state was tampered to report empty overlapping files).
     5. All applicable fresh ordinary PR CI checks pass on `H_new` (no failed, missing, skipped-only, canceled, stale, or pending checks).
     6. Effective branch protection and review/conversation rules remain verified fail-closed before every write.
   - Optional `hold-on-update` policy remains available via CLI (`--integration-policy hold-on-update`) if an operator ever wants to pause after each branch update.

---

## 7. Operator usage (dry-run, start, status, cancel, reconcile)

All actions live under **Actions → Copper Turnstile Batch Coordinator → Run workflow** (always select branch `main`).

1. **Dry-run preflight (read-only, zero writes, no approval or runtime credentials required):**
   - Select `action: dry-run`, paste the ordered `entries: <PR>@<40_CHAR_SHA>#<REVIEW_COMMENT_ID>,...` prepared by Independent Review, and select `merge_method` (default `squash`).
2. **Authorize and run an unattended batch (`action: start`):**
   - Select `action: start`, paste the ordered `entries` prepared by Independent Review (with `#<REVIEW_COMMENT_ID>` under the shared-account model — Aaron does not manually hunt for comment IDs), and choose `merge_method`.
   - `preflight` runs read-only first; approve the **single** `merge-queue-approval` prompt in the workflow UI.
   - `authorize-and-start` validates live PR comments and captures each verified `reviewCommentDigest` into the immutable run-bound authorization manifest artifact (`copper-turnstile-auth-manifest-<run_id>`) **before** upload, then verifies that exact manifest on start and every continuation step.
   - Walk away: Copper Turnstile merges current PRs directly, updates behind PRs, wakes up immediately on `workflow_run: completed` as ordinary CI finishes, independently re-proves the full Git integration chain from each immutable `REVIEWED_HEAD_SHA` + manifest digest binding + fresh CI + live protection, and advances automatically through the batch.
3. **Inspect status (`action: status`):**
   - Read-only (zero secrets); prints batch status, verified Independent Review evidence, integration updates, last verification verdict, completed merges with accepted `mergeCommitSha`s, and next action.
4. **Cancel / abort (`action: abort`):**
   - Owner-gated (`ContraPhilosophy` + `merge-queue-approval`). Works during any stage (`running`, `updating`, `awaiting_checks`, `merging`, `held`, or unresolved legacy `v1`), stops all subsequent mutations, and reports all already-completed merges and their accepted `main` SHAs.
5. **Recover / reconcile (`action: reconcile`):**
   - Owner-gated manual recovery (plus automatic idle-gated 15-minute `schedule` watchdog recovery fallback).

---

## 8. Failure disposition and recovery

| Condition | Coordinator behavior | Operator next step |
| --- | --- | --- |
| Zero reviews, `CHANGES REQUESTED`/`HOLD` comment, untrusted commenter, null-OID/stale/self native review, or unresolved thread | Fails preflight / stops immediately (fail-closed). | Obtain Independent Review at exact HEAD and resolve conversations. |
| Inaccessible (`403`) or unsafe `main` branch protection (e.g., `strict=false`, `enforce_admins=false`, bypass allowances) | Fails closed before any writes (`start`, `update-branch`, `merge`). | Verify App `Administration: Read-only` and restore strict `main` protection. |
| Behind PR has merge conflict (`422`), truncated diff (`>= 300` files), extra commits, non-merge/rewritten history, or blob tampering | Transitions to `stopped` with exact provenance error. | Resolve conflict or investigate unexpected commits; obtain fresh Independent Review. |
| Overlapping file modified by both `main` and PR | Immediately transitions to `held` (does not auto-merge even if Git auto-merged cleanly). | Independent Review inspects overlapping integration commit before merge. |
| Failed, missing, skipped-only, canceled, or stale check on candidate HEAD | Transitions to `stopped` with exact check classification. | Repair failing/canceled/stale CI and re-review if source changes. |
| Ordinary PR CI exceeds timeout (`90m` default) | Transitions to `stopped` with `verdict: timed_out`. | Inspect Actions runners and restart/reconcile once healthy. |
| Concurrent manual merge advances `main` | Rechecks `main`; handles `409 Base branch was modified` cleanly via bounded behind-branch update (up to `maxIntegrationUpdatesPerPr = 2`, then `held`). | Unattended if within cap and disjoint; inspect if `held`. |
| Active PR closed without merge or merged externally outside coordinator's `merging` step | Transitions to `stopped`; never mistakes closure or unverified external merge for batch completion. | Inspect accepted `main` and submit remaining PRs if desired. |
| Interrupted network/5xx response during `update-branch` or `merge` | Preserves write-ahead `updating`/`merging` state; `reconcile` verifies live GitHub state without duplicate mutations. | Let 15-min watchdog run or trigger manual `reconcile`. |
| Persisted `stateChecksum` mismatch or live `/approvals` re-verification failure | Transitions to `stopped` immediately before any mutation. | Inspect `MERGE_QUEUE_BATCH_STATE` and run history; start a fresh authorized batch. |

---

## 9. Migration and rollback (from legacy native-queue coordinator)

- **Verified live state (2026-11-27):** `MERGE_QUEUE_BATCH_STATE` does not currently exist (`variables: []`), so **zero active legacy `v1` batches exist**.
- **Safety guarantee if a legacy `v1` batch ever exists:** `v2` detects `version: 1` state and never discards an unresolved active legacy batch (`enqueuing`/`running`); `start` refuses to overwrite it, `reconcile` inspects it safely without calling `enqueuePullRequest`, and `abort` safely dequeues via `dequeuePullRequest` if still `isInMergeQueue`.
- **Rollback procedure:** Run `action: status` (and `action: abort` if active/held), disable the workflow or revert the PR, and optionally remove environment secrets. Normal manual protected PR merging continues completely uninterrupted.

---

## 10. Exact owner configuration steps (one-time, after Independent Review & merge)

Do **not** perform these steps until Independent Review approves and Aaron merges PR #376:

1. **Create Environment `merge-queue-approval`** (Repository Settings → Environments → New environment):
   - Enable **Required reviewers** and add `ContraPhilosophy`.
   - Set **Deployment branches and tags** → **Selected branches and tags** → add **`main`** only.
   - Add **NO secrets** to this environment.
2. **Create Environment `copper-turnstile-runtime`** (Repository Settings → Environments → New environment):
   - Leave **Required reviewers** **unchecked** (enables unattended automatic advancement after `approve-start`).
   - Set **Deployment branches and tags** → **Selected branches and tags** → add **`main`** only.
3. **Create and install the repository-scoped GitHub App** (GitHub Developer Settings → GitHub Apps → New GitHub App):
   - Name: e.g. `Bibleberry Copper Turnstile` (Webhook: unchecked / inactive).
   - Repository permissions: **Contents: Read and write**, **Pull requests: Read and write**, **Issues: Read-only**, **Variables: Read and write**, **Checks: Read-only**, **Commit statuses: Read-only**, **Administration: Read-only**, **Actions: Read-only**.
   - Install on **Only select repositories → `Bibleberry/Bibleberry`**.
   - Generate a private key (`.pem`) and copy the App's **Client ID**.
   - Store `COPPER_TURNSTILE_APP_CLIENT_ID` as a repository Actions variable (`Settings → Secrets and variables → Actions → Variables`).
   - Store `COPPER_TURNSTILE_APP_PRIVATE_KEY` **ONLY** as an **Environment secret inside `copper-turnstile-runtime`** (NEVER as a repository-level secret!).
   - *(Fallback if deferring App creation: store fine-grained PAT `MERGE_QUEUE_TOKEN` ONLY inside `copper-turnstile-runtime`, never as a repository secret.)*
4. **Verify `main` branch protection** (Settings → Branches → `main`):
   - Confirm Require merge queue is **off**, `strict: true`, `enforce_admins: true`, `required_conversation_resolution: true`, no force-push/deletion, no PR bypass allowances, and required checks include `Build reader application` and `Verify Sanity Studio` (plus `Reader browser suites (Chromium)` and `Build and verify R06 release artifact` once separately authorized under [Ancient Codex #377](https://github.com/Bibleberry/Bibleberry/issues/377)).

---

## 11. Proposed separately authorized live acceptance rehearsal

**Do not use real feature PRs for acceptance testing.** After merge and owner setup, Aaron may separately authorize a bounded live rehearsal:

1. **Rehearsal 0 — Hostile same-repo PR credential-boundary proof:** Open a temporary non-feature test PR adding a dummy `pull_request` workflow that requests `environment: copper-turnstile-runtime`. Verify GitHub **rejects** the job server-side (`Branch ... is not allowed to deploy to copper-turnstile-runtime due to environment protection rules`), proving same-repo PRs cannot access `COPPER_TURNSTILE_APP_PRIVATE_KEY`. Close the test PR without merging.
2. **Rehearsal 1 — Zero-write dry-run & fail-closed review check:** Open two trivial non-feature canary PRs modifying **disjoint** scratch docs files, Ready for review with passing ordinary CI:
   - Run `action: dry-run` **before** posting Independent Review approval -> verify preflight **FAILS CLOSED** (`no verified exact-HEAD Independent Review approval`).
   - Record exact-HEAD Independent Review `Disposition: CODE APPROVED` on both canary PRs -> re-run `action: dry-run` -> verify `PASS` with zero writes.
3. **Rehearsal 2 — Unattended 2-PR batch with immediate `workflow_run` wakeup:** Run `action: start` with `CANARY_1@SHA_1,CANARY_2@SHA_2` and approve `merge-queue-approval` **once**. Verify:
   - `CANARY_1` merges directly via `squash` **without** another CI cycle.
   - `CANARY_2` immediately receives `update-branch` from the GitHub App identity, triggering ordinary PR CI.
   - `workflow_run: completed` wakes up Copper Turnstile promptly upon CI completion (without waiting for the 15-minute watchdog), verifies disjoint provenance + fresh CI + live protection + run approval, and merges `CANARY_2` automatically to `status: completed`!
4. **Rehearsal 3 — Overlapping-file HOLD proof & idle zero-runner proof:** Verify a canary PR touching a file changed on `main` transitions to `status: held`, cancel cleanly via `action: abort`, and confirm subsequent 15-minute `schedule` ticks allocate zero runners when idle.

---

## 12. Historical context (superseded native-queue preparation)

- Native merge queue CI preparation (`merge_group` triggers in `ci.yml`, `collections-browser.yml`, `native-android.yml`, and `scripts/ci/check-scope.mjs`) was introduced in [#195](https://github.com/Bibleberry/Bibleberry/issues/195) and proven in [#201](https://github.com/Bibleberry/Bibleberry/pull/201) ([proof record](merge-queue-activation-proof-2026-11-17.md)).
- Draft-PR waiting-room CI suppression was later removed by Silver Badger ([#239](https://github.com/Bibleberry/Bibleberry/issues/239); see [draft-pr-hosted-ci.md](draft-pr-hosted-ci.md)).
- PR [#203](https://github.com/Bibleberry/Bibleberry/pull/203) introduced the initial v1 native-queue batch coordinator; Velvet Meteor ([#243](https://github.com/Bibleberry/Bibleberry/issues/243)) audited live operations after the owner shifted to protected direct PR merging. Legacy `merge_group` triggers in `ci.yml`, `collections-browser.yml`, and `native-android.yml` remain intentionally untouched by PR #376 pending separate cleanup authorization under [#243](https://github.com/Bibleberry/Bibleberry/issues/243) and coordination with Claude Says ([#367](https://github.com/Bibleberry/Bibleberry/issues/367)).

This runbook does not authorize merging feature PRs, changing repository settings, creating credentials, or running a live batch without Aaron's explicit approval.
