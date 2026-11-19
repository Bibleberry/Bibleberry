# Hosted CI on Draft Pull Requests (Silver Badger)

**Related Issue:** [#239](https://github.com/Bibleberry/Bibleberry/issues/239) (`Silver Badger`)  
**Supersedes:** Historical Draft-PR waiting-room test suppression in [one-at-a-time-pr-queue.md](one-at-a-time-pr-queue.md)  
**Policy tests:** [`tests/ci/draft-pr-ci-policy.test.ts`](../../tests/ci/draft-pr-ci-policy.test.ts), [`tests/ci/merge-queue-config.test.ts`](../../tests/ci/merge-queue-config.test.ts), [`tests/ci/check-scope.test.ts`](../../tests/ci/check-scope.test.ts)

## Purpose

Now that Bibleberry is a public repository running on standard ephemeral GitHub-hosted runners (`ubuntu-24.04`, `macos-26`), Draft pull requests no longer suppress CI jobs in a waiting room. Running relevant hosted checks on Draft PRs provides early engineering feedback on every push while preserving strict separation between automated checks and human merge authorization.

## Active Workflow Policy

- **No Draft-PR job suppression:** Job-level `github.event.pull_request.draft` guards are removed from:
  - `.github/workflows/ci.yml` (`Bibleberry CI`: `Build reader application`, `Verify CMS adapters and BerryMark preview`, `Verify Release Gateway core`, `Verify Sanity Studio`)
  - `.github/workflows/collections-browser.yml` (`Collections Browser Tests`: `Saved Scripture and Field Notebook (Chromium)`)
  - `.github/workflows/native-android.yml` (`Native Android debug build`: `Native Android debug APK`)
  - `.github/workflows/native-ios.yml` already had no Draft guard and remains unchanged.
- **PR event triggers:** `ci.yml`, `collections-browser.yml`, and `native-android.yml` run on `pull_request` types `[opened, reopened, synchronize, ready_for_review]` targeting `main`. `converted_to_draft` is removed so converting a PR to Draft does not spawn redundant duplicate runs.
- **Legitimate change-scope skips retained:**
  - `ci.yml` and `collections-browser.yml` continue to evaluate changed files via `scripts/ci/check-scope.mjs`. When a Draft PR modifies only irrelevant files (such as documentation-only edits), jobs still fast-skip heavy build/test steps and succeed cleanly.
  - Skip steps explicitly log `Change-scope skip (irrelevant files; not Draft PR suppression): ...` alongside `[ci-scope] Reason: No files matching target "..." were modified...`, making irrelevant-file skips unmistakable from historical Draft suppression.
  - `native-android.yml` retains its existing `pull_request.paths` filters while keeping `merge_group` unfiltered.
- **Required checks, merge queue, and concurrency preserved:**
  - Branch-protection required check names (`Build reader application`, `Verify Sanity Studio`) are unchanged.
  - `merge_group` (`types: [checks_requested]`, `branches: [main]`) continues to force unconditional full integration verification.
  - Per-PR concurrency isolation (`${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}`) and PR-only cancellation (`cancel-in-progress: ${{ github.event_name == 'pull_request' }}`) remain intact so pushes to a Draft PR cancel superseded runs without affecting sibling PRs or `merge_group` / `main` runs.

## Separation of CI Results from Review and Merge Authorization

- **Draft PRs remain ineligible for merge or queue entry.** Passing CI on a Draft PR is engineering evidence, not code approval or merge authorization.
- GitHub prevents merging Draft PRs, and the batch coordinator (`scripts/ci/merge-queue-batch-lib.ts`) explicitly rejects Draft PRs during preflight.
- Independent code review, Ready-for-review promotion, merge-queue entry, and merge remain separate stages controlled by Aaron.

## Security and Fork Pull Requests

- All PR verification workflows retain least-privilege `permissions: contents: read`, full 40-character SHA-pinned Actions, `persist-credentials: false` on every `actions/checkout`, standard ephemeral hosted runners, and zero repository secrets or `pull_request_target` triggers.
- **Fork PRs from external contributors:** Under GitHub's public-repository Actions policy (`all_external_contributors`, documented in [github-actions-security.md](../operations/github-actions-security.md)), workflows for forked Draft or Ready PRs from outside collaborators wait for explicit maintainer approval before running. That delay is an intentional security control and must never be bypassed by switching to `pull_request_target` or weakening approval rules.
