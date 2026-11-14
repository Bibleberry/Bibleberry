# Required Linux CI migration to Bibleberry self-hosted Ubuntu

## Goal

Allow existing required GitHub Actions checks to run using the registered Linux runner `bibleberry-bigmac` rather than requiring paid hosted Linux minutes for trusted repository-owner PRs. This is a workflow routing migration, not a reduction in coverage.

## Files changed

- `.github/workflows/ci.yml`: four existing jobs retain their names, steps, and triggers.
- `.github/workflows/collections-browser.yml`: the browser job retains its name, steps, and PR trigger.
- `actions/checkout@v4`: `persist-credentials: false` on the five migrated jobs.

## Routing policy

- Push to protected `main`: self-hosted `[self-hosted, Linux, X64, bibleberry-linux]` for the four `ci.yml` jobs.
- PRs authored by `ContraPhilosophy` from branches in `ContraPhilosophy/Bibleberry`: self-hosted for all five Linux jobs.
- Other PRs: remain on GitHub-hosted `ubuntu-24.04` and retain existing required checks. With the current $0 hosted Actions spending cap, these may be blocked; do not treat those as successful validation.

**Security limit:** these workflow expressions are routing policy, not an isolation boundary. A contributor allowed to alter Actions YAML can change their own PR's workflow. A persistent runner can also retain state across jobs. Do not permit untrusted PR code to run on the self-hosted runner. Review contributor permissions, workflow-change approvals and VM rollback/isolation before expanding eligibility. No `pull_request_target` execution is introduced.

## Validation sequence

1. On BigMac run `berryci start linux`. Confirm `bibleberry-bigmac` shows Online/Idle in repository Actions runner settings.
2. Open the migration PR. Confirm the existing required check names continue to appear and their jobs are actually assigned to `bibleberry-bigmac`, not silently skipped.
3. If `actions/setup-node`, `npm ci`, Chromium or OS libraries fail on Ubuntu, remedy the VM environment separately. The current hosted runner image includes software the VM might not.
4. Inspect browser screenshot artifacts and run all five jobs. GitHub may queue them sequentially because a single runner handles one job at a time.
5. Merge **only when** required checks pass under the unchanged branch protection rules. Do not change the $0 spending limit or bypass protection.
6. After merge, verify a push to main runs the existing four `ci.yml` jobs; review whether to migrate Android and iOS in separate PRs.

## Rollback

Revert the two workflow changes in a new PR. Maintain existing job names. Do not re-register either GitHub runner.

## Exclusions

The iMac and Android workflows, runner service configuration, billing, branch protection, product code, scripts, tests, release controls, and PRs #151/#152 are unchanged.
