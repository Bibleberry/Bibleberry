# Bibleberry: public-repository and hosted-CI cutover

**Status: pending operator verification.** This document is a cutover checklist, not proof that the repository is public or that the data-security checks passed.

## Why

Public GitHub repositories get free **standard** GitHub-hosted runners. This migration removes dependency on home computers during pull-request verification while retaining established job names and scope-based test execution.

## Prepared in this branch

- `.github/workflows/ci.yml`: four existing CI jobs use `ubuntu-24.04` instead of persistent self-hosted runners.
- `.github/workflows/collections-browser.yml`: existing browser job uses `ubuntu-24.04`.
- `.github/workflows/native-android.yml`: existing APK build uses `ubuntu-24.04`; no VM-specific SDK path.
- `.github/workflows/native-ios.yml`: continues on GitHub-hosted `macos-26`; unchanged.
- Removed three obsolete manual-only self-hosted runner workflows.
- `.gitignore`: excludes local Cloudflare secrets (`.dev.vars*`) and native signing assets. Ignore rules **do not remove files already committed to Git history**.

**Retain:** current job names and required checks, read-only `GITHUB_TOKEN` permissions, draft PR gate, cancellation of superseded PR checks, and content-specific test scope.

## Before changing GitHub visibility (manual operator tasks)

1. **History scan.** On a trusted machine with a complete local clone of this repository, install [Gitleaks](https://github.com/gitleaks/gitleaks), then run:
   ```bash
   git fetch --all --tags
   gitleaks git --redact --log-opts="--all" .
   ```
   Investigate every possible real credential. Do not paste unredacted scanner findings into a public PR. If a genuine credential was committed, revoke/rotate it **before** making the repository public. Also inspect existing Actions logs and artifacts, past PR discussions, and commit descriptions for secrets; the Git history scan does not cover those.
2. **Sanity.** In [Sanity Manage](https://www.sanity.io/manage), inspect the Bibleberry project **Datasets** and verify both `production` and `staging` have **private** visibility. Confirm the project is on an active plan that supports private datasets, not an expiring trial. Unauthenticated requests to a private Sanity dataset can return HTTP 200 with empty results; that response is not proof that the dataset is public or that everything is safe. Verify roles/tokens are least-privilege (read-only token for the Release Gateway; no write tokens in client or source). Sanity CDN asset URLs can still be accessible even for private datasets: avoid uploading files intended to remain confidential as ordinary assets.
3. **Cloudflare.** In Cloudflare **Workers & Pages → Bibleberry Worker → Settings → Variables and Secrets**, confirm `SANITY_READ_TOKEN` is configured as a **Secret**, not a plaintext variable. Review any other deployed secrets and ensure no secret value appears in `wrangler*.jsonc`, Vite `VITE_*` variables, tracked code, or publicly accessible bundles. Verify production and staging deployments point at their intended datasets. Review gateway release/date filtering.
4. **Self-hosted runners.** In [Bibleberry Actions runner settings](https://github.com/Bibleberry/Bibleberry/settings/actions/runners), **remove** every persistent self-hosted runner registered to this repository, including the BigMac Linux VM and iMac runner. Shut down their services as well. Do this **before** making the repository public. The branch removes old workflow references, but the currently deployed `main` workflows still reference these runners until this PR is merged.
5. **Repository controls.** In GitHub **Settings → Actions → General**, use minimal `GITHUB_TOKEN` permissions and require approval for untrusted forked PR workflows. In **Settings → Branches/Rules**, verify that the `main` protections and required checks stay in place after visibility change (public conversion disables push rulesets). Do not grant fork workflows deployment secrets.

## Cutover order

1. Review history/logs, Sanity visibility, Cloudflare secrets, and runner inventory.
2. **Remove self-hosted runner registrations.**
3. Under GitHub **Settings → General → Danger Zone → Change repository visibility**, switch **Bibleberry** from private to public (account-owner action). This makes all commit history, existing PRs, and Actions logs visible; making it private again will not retract copies or public forks.
4. Mark the migration PR **Ready for review** to initiate GitHub-hosted CI on its proposed workflow configuration. If CI stalls, confirm it is not requesting self-hosted runners.
5. Review checks and merge through the normal protected-branch process. Verify a `push` to `main` executes on hosted runners and required status-check names are unchanged.
6. Under **Settings → Advanced Security**, enable secret scanning, push protection, dependency graph, Dependabot alerts, and available code scanning. Revisit Actions permissions and artifact visibility.
7. Confirm public standard runner usage is not drawing down paid CI budget. Keep the existing small private-compute budget guardrail until billing is understood.

## Boundaries

This branch **does not** modify Sanity records, dataset visibility, Cloudflare settings, Supabase accounts, secrets, app content, or repository visibility. The GitHub connector cannot independently inspect the administrative Sanity, Cloudflare, runner, billing, or branch-protection settings. Those require the account owner to inspect them directly.

**BerryMark is a separate private repository.** Its parser CI already uses hosted Ubuntu. Make a distinct visibility decision for BerryMark after its own history review.
