# Linux CMS/BerryMark self-hosted CI pilot

## Purpose

Test a real Bibleberry workload on the registered `bibleberry-bigmac` Ubuntu 24.04 VM without changing existing PR/push CI jobs or their required check names.

Workflow: `.github/workflows/ci-linux-cms-pilot.yml`

- Manual `workflow_dispatch` **only**.
- Runs only on `main` (`github.ref == 'refs/heads/main'`); no PR code or feature branch is executed on the persistent self-hosted VM.
- Targets `[self-hosted, Linux, X64, bibleberry-linux]`.
- Uses a read-only GitHub token; checkout does not persist its authentication token.
- Runs the **same CMS adapter and native participation commands** used in the CMS job of `ci.yml`:
  - `npm run test:adapter`
  - `npm run test:native-participation`
- Time limit: 20 minutes. No deployment, secret input, Sanity writes, or production mutations are added.

## Preconditions

1. Start the Linux runner from BigMac: `berryci start linux`.
2. Check GitHub repository **Settings → Actions → Runners**: `bibleberry-bigmac` should be Online / Idle.
3. The workflow file must be on the repository default branch before `workflow_dispatch` can be used. Do **not** bypass required checks or remove branch protection to merge this pilot.
4. Confirm the operator has reviewed the PR and that the repository is in a trusted state.

## Manual verification after approved merge

In GitHub:

1. Go to **Actions → Bibleberry Linux CMS pilot**.
2. Choose **Run workflow** on `main`.
3. Inspect **Pilot CMS adapters and BerryMark on Ubuntu VM**.
4. Confirm Ubuntu/Node environment, `npm ci`, adapter tests, and participation tests all pass.
5. If the job fails, inspect the first failing step and remediate environment requirements separately. Do not alter `ci.yml` or required checks until the workload passes.

Alternative command once GitHub CLI is configured on BigMac:

```bash
gh workflow run ci-linux-cms-pilot.yml --repo ContraPhilosophy/Bibleberry --ref main
```

## Migration boundary

This pilot does **not** replace or satisfy existing required GitHub-hosted checks. The original `ci.yml`, browser, Android, and iOS workflows remain unchanged. Once the pilot passes, migrate workloads incrementally in subsequent PRs and preserve branch-protection requirements. The $0 Actions spending limit remains untouched.

Persistent self-hosted machines are not security isolation: do not add automatic `pull_request` or `pull_request_target` execution for this workflow without a reviewed code-trust and reset strategy.
