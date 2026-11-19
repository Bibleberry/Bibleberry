# Bibleberry: GitHub Actions Security Policy

**Related:** Issue #169, PR #168 (`docs/operations/public-repository-ci-cutover.md`)

Because `ContraPhilosophy/Bibleberry` is a public repository running GitHub-hosted CI, every workflow change must treat external Actions, fork pull requests, and `GITHUB_TOKEN` permissions as security boundaries.

## Approved External Actions Allowlist

Only the following external Actions are currently approved for use in `.github/workflows/`:

| Action | Purpose | Maintainer |
| --- | --- | --- |
| `actions/checkout` | Repository checkout (`persist-credentials: false`) | GitHub (`actions/*`) |
| `actions/setup-node` | Node.js runtime and npm cache | GitHub (`actions/*`) |
| `actions/setup-java` | Temurin JDK 21 and Gradle cache (Android) | GitHub (`actions/*`) |
| `actions/upload-artifact` | Test/build failure evidence and debug artifacts | GitHub (`actions/*`) |
| `android-actions/setup-android` | Android SDK command-line tools on hosted Ubuntu | `android-actions` |

Introducing any new third-party Action or reusable workflow requires explicit review of its source repository, permissions footprint, and addition to the GitHub repository allowlist.

## SHA-Pinning Convention

All external `uses:` references in `.github/workflows/*.yml` must be pinned to an **immutable, full-length 40-character commit SHA** with a trailing human-readable version comment:

```yaml
- uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
  with:
    persist-credentials: false
```

Mutable tags (`@v4`, `@main`) are not permitted in active workflows.

## Updating Pinned Actions Safely (Dependabot & Manual)

[`.github/dependabot.yml`](../../.github/dependabot.yml) runs weekly checks on the `github-actions` ecosystem and opens PRs that update pinned commit SHAs while preserving version comments.

Before merging a Dependabot or manual Action update:

1. Verify the new commit SHA resolves to an official release tag in the upstream repository:
   ```bash
   gh api repos/<owner>/<repo>/git/ref/tags/<tag>
   # If .object.type == "tag", dereference the annotated tag to its commit SHA:
   gh api repos/<owner>/<repo>/git/tags/<tag_sha> --jq '.object.sha'
   ```
2. Review the upstream release notes/changelog for breaking input changes, Node/runner requirements, or unexpected permission additions.
3. Confirm all required CI checks pass on the PR before merging.

## Minimum Workflow Permissions & Checkout Hygiene

- Every workflow file must declare top-level `permissions: contents: read` (least privilege). Job-level elevation is prohibited unless explicitly justified and reviewed.
- Every `actions/checkout` step must set `persist-credentials: false` so `GITHUB_TOKEN` is not persisted in local `.git/config`.
- Workflows must run exclusively on ephemeral GitHub-hosted runners (`ubuntu-24.04`, `macos-26`). Persistent self-hosted runners must not be attached to this public repository.
- Never use `pull_request_target` or expose repository/environment secrets to `pull_request` workflows from forks.

## External Contributor Approval Policy

For a public repository, fork pull-request workflows from **all outside collaborators / external contributors** must require maintainer approval before execution. Do not rely on the default "first-time contributors" setting, which allows repeat external accounts to execute CI without review.

## Security Checklist for Future Workflow Changes

- [ ] New or updated `uses:` references are pinned to verified 40-character commit SHAs with `# vX.Y.Z` comments.
- [ ] Only approved Actions (`actions/*`, `android-actions/setup-android`) are used, or the allowlist change is explicitly reviewed.
- [ ] Top-level `permissions: contents: read` is preserved; no unnecessary write scopes.
- [ ] `persist-credentials: false` is set on every `actions/checkout` step.
- [ ] No `pull_request_target`, no secrets passed to untrusted PRs, and no self-hosted runner labels.
- [ ] Required status check names (`Build reader application`, `Verify Sanity Studio`), change-scope filtering, and Draft PR merge/queue ineligibility remain intact (Draft PRs run read-only hosted CI without waiting-room suppression; fork PRs from external contributors still require maintainer approval).

## Repository Settings Reference (GitHub Admin UI)

Under **Settings → Actions → General**:

1. **Actions permissions:** Select **Allow `actions/*`, and select non-`actions`, actions and reusable workflows** and allow `android-actions/setup-android@*` (with **Allow actions created by GitHub** checked).
2. **Require actions to be pinned to a full-length commit SHA:** Enable **only after** this SHA-pinning policy is merged to `main`.
3. **Workflow permissions:** Keep **Read repository contents and packages permissions** (`default_workflow_permissions: read`) and leave **Allow GitHub Actions to create and approve pull requests** unchecked (`false`).
4. **Fork pull request workflows from outside collaborators:** Select **Require approval for all outside collaborators** (`all_external_contributors`).
