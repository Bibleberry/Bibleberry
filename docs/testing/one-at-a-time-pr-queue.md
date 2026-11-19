# One-at-a-time pull request verification (Linux foundation)

> **Superseded by Issue [#239](https://github.com/Bibleberry/Bibleberry/issues/239) (`Silver Badger`):** Following the public-repository cutover to standard GitHub-hosted runners, the historical Draft-PR waiting-room test suppression documented below was removed. Draft PRs now run scope-filtered read-only hosted CI while remaining Draft and ineligible for merge or queue entry until independent review and explicit owner promotion. See [draft-pr-hosted-ci.md](draft-pr-hosted-ci.md) for current policy.

Bibleberry's required GitHub Actions checks remain part of protected `main`. This phase introduces a **Draft PR waiting room for Linux CI and Collections Browser**, without disabling branch protection or reducing those checks.

**Scope:** Only `.github/workflows/ci.yml` (Reader, CMS/BerryMark, Release Gateway, Studio) and `.github/workflows/collections-browser.yml` are draft-gated in this PR. Android and iOS workflows remain unchanged and can still run on draft PRs when their path filters match. Migrating those builds to Bibleberry self-hosted runners and adding native draft gating will be handled separately. Native GitHub-hosted runs may currently be blocked by GitHub billing.

## Normal Linux review workflow

1. **Development agents open Draft PRs.** Linux and Collections checks skip while the PR is a draft; edits accumulate without scheduling those runners. Native checks and external integrations are not yet part of this waiting room.
2. **Choose one PR for review.** Leave other PRs in Draft. Update the selected branch against `main` while it is still Draft, resolving conflicts if necessary.
3. Click **Ready for review**. The `pull_request.ready_for_review` event triggers the normal Linux and Collections checks.
4. Wait for required checks to finish on the current PR revision. Review changes, and **Squash and merge** only when protection allows it.
5. The existing `push` workflow verifies the new `main` commit. After that, select the next Draft PR.

## Behavior

The two affected workflows handle `opened`, `reopened`, `synchronize`, `ready_for_review`, and `converted_to_draft`. Their jobs skip when `github.event.pull_request.draft` is true. A skipped job uses no runner; GitHub may mark skipped jobs successful, but a Draft PR cannot be merged. **Only real checks from the current Ready PR revision count as verification.**

Updates to a Ready PR run Linux checks again. If review pauses, convert it back to Draft before further commits; making it Ready again starts verification. Agents must explicitly create Draft PRs.

Main-branch `push` jobs, manual-only workflows, native Android/iOS workflows, and external services (including Cloudflare) are unchanged.

## Existing PRs

For already-open Ready PRs, use **Convert to draft** to put them in the waiting room. After this policy is merged, update waiting branches from `main` while still Draft so their workflow definitions include the new policy. Promote just the selected PR to Ready.

## Verification checklist

- New Draft PR: Linux and Collections jobs skip without occupying runners.
- Update a Draft PR: Linux and Collections jobs still skip.
- Ready for review: these jobs execute with unchanged required-check names.
- Update a Ready PR: Linux and Collections checks rerun.
- Merge a verified Ready PR: existing `main` push CI executes normally.
- Android and iOS remain outside this phase; their automation and hosting will be addressed in a separate native-runner PR.
