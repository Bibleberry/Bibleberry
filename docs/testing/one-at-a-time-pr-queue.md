# One-at-a-time pull request verification

Bibleberry's GitHub Actions checks remain required for merging into protected `main`. The development queue is managed through **Draft** pull requests, not by disabling branch protection or removing test jobs.

## Normal workflow

1. **Development agents open Draft PRs.** Additional commits and updates to `main` can accumulate without scheduling Linux, Android, or iOS build jobs for these draft PRs.
2. **Pick exactly one PR to review.** Leave other PRs in Draft. While the selected PR is still a draft, use GitHub's **Update branch** action if it is behind `main` (or resolve any conflicts).
3. Click **Ready for review** on the selected PR. This `pull_request.ready_for_review` activity starts the usual CI checks. Browser and native checks run only where their existing workflow path filters apply.
4. Wait for GitHub to finish the required checks on the current PR commit, review the changes, and **Squash and merge** only if protection allows it.
5. The existing `push` workflow automatically verifies the new `main` commit. Let that finish, then select the next Draft PR.

## Behavior of the workflow gates

The `pull_request` events `opened`, `reopened`, `synchronize`, `ready_for_review`, and `converted_to_draft` are handled by the four application CI workflows. Every CI job skips execution when `github.event.pull_request.draft` is true. A draft workflow may show *skipped* GitHub checks, but **it does not occupy a runner**. GitHub marks skipped jobs as successful; the PR's Draft state independently prevents merging. Upon **Ready for review**, real checks are scheduled, with their existing job names unchanged.

Updates to a **ready** PR still run tests automatically. If its review must pause, convert it to Draft before pushing additional commits; making it ready again starts a new full verification cycle. Merely opening a non-draft PR also starts tests, so agents must use **Create draft pull request**.

`push` jobs on `main` and manual-only smoke/pilot workflows remain unchanged. External integrations (for example Cloudflare) have separate triggers and are **not controlled** by this GitHub Actions policy. Android and iOS workflows retain their existing path filters and GitHub-hosted labels; this change does not migrate them to self-hosted hardware.

## Existing PRs and branch protection

For an already-open **ready** PR, use **Convert to draft** to put it in the waiting room. When the new policy reaches `main`, update a waiting branch from `main` while it is still Draft so its next workflow run uses the new workflow definitions. Then mark only the selected PR ready.

Do not dismiss or bypass required checks, and do not merge from a prior passing run if the PR has changed. GitHub must show the checks required by the repository's rules as passing on the current PR revision.

## Verification checklist for rollout

- New Draft PR: jobs are skipped, with no runner allocated.
- Update a Draft PR: still no runner allocation.
- Mark Ready for review: required jobs start, with unchanged check names.
- Update a Ready PR: tests run again automatically.
- Convert a Ready PR back to Draft: active PR workflow is superseded by a skipped run.
- Merge a verified Ready PR: `main` push CI runs normally.
