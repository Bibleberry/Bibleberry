# Tidal Marlin — R06 private staging preflight

[Issue #334](https://github.com/Bibleberry/Bibleberry/issues/334) commissions build preparation for the existing private web staging Worker. The build and dry-run can be rehearsed on accepted source while [Full M1 #328](https://github.com/Bibleberry/Bibleberry/issues/328) is open. Final qualification requires Aaron’s acceptance of the integrated J1–J7 evidence on one pinned artifact. The [previous R05 staging rehearsal](../architecture/r05-stage3-infrastructure-runbook.md) covered one Challenge and its deployment authorization was spent.

## Build profile

- `src/main.tsx` selects R06 with `VITE_ENABLE_R06_SHELL=true`. R06’s `navigation/routeTable.ts` enables the Month, released Challenge, historical Library, Field Notebook, Saved Scripture and News routes together. The R06 hosts use gateway providers directly. `VITE_ENABLE_RELEASE_GATEWAY_SOURCE=true` selects the gateway at the shared Challenge provider seam. Both gateway-origin variables are empty so the reader sends relative `/api/` requests to the same host.
- The release profile sets Developer Studio, both pilot flags and the native lifecycle probe to `false`. All other Vite flags are unset. This build replaces the legacy App entry and its public-catalog provider with fail-closed modules, removes the DOM inspector, and copies only the reviewed favicon from `public/`. R06 keeps its ordinary application styles and gateway response mappers. The rendered module audit rejects the direct Sanity query code, developer UI and hosted account implementation. The byte audit checks known credential markers, endpoints, and extra files including source maps.
- Account & Progress describes device/browser-local guest progress, data-loss risk, and the absence of hosted sign-in, backup and cross-device sync. Test it on the packaged reader. Authorized media can use the approved asset projection. The existing public font stylesheet is intercepted locally during browser smoke so the test makes no external font request.
- The checked source configuration uses `wrangler.staging.jsonc`, Worker `bibleberry-staging`, host `bibleberry-staging.aw-e44.workers.dev`, project `80016lrq`, and dataset `staging`. It serves `dist` via `ASSETS` and routes `/api/*` through the Worker first. The origin list is a CORS control. Actual Access coverage, Worker routes and bindings, and Sanity permissions require account-side evidence.

## Rebuild and verify

Use the reviewed tooling checkout on Linux x64. Install its locked dependencies with `npm ci` and Chromium with `npx playwright install chromium`. Match the previously recorded Node and npm versions for a byte comparison. The initial rehearsal uses Node 24.22.1 and npm 11.9.0. The repository's `.nvmrc` pins the same Node 24.22.1 for hosted web CI. Its bundled npm may differ, and the manifest records the npm version actually used. The optional last build argument accepts a local npm cache directory. The build extracts the pinned commit to a new directory, installs from its lockfile with lifecycle scripts disabled, then typechecks, builds and runs Wrangler dry-run over that exact `dist` with a fresh home and a restricted environment.

Set `R06_COMMIT` to the full accepted M1 SHA for qualification, or the full source SHA labeled as an interim rehearsal. Set `R06_OUTPUT` to a new local directory with an existing parent. Keep the manifest SHA-256 printed by the build in the review/approval record independently of the artifact folder.

```sh
node scripts/release/r06-preflight.mjs build "$R06_COMMIT" "$R06_OUTPUT"
node scripts/release/r06-preflight.mjs verify "$R06_COMMIT" "$R06_MANIFEST_SHA256" "$R06_OUTPUT"
node scripts/release/r06-verify-staging.mjs smoke "$R06_COMMIT" "$R06_MANIFEST_SHA256" "$R06_OUTPUT"
node --test tests/release/r06-preflight.test.mjs
```

Rebuild into a second, empty destination and compare both manifest and artifact SHA-256 values. Verification stops on missing or additional files, links, byte drift, incorrect flags/configuration, or a mismatched source or external manifest digest. The manifest pins the commit and tree, config/lockfile/tooling digests, effective flags and tool versions, plus the sorted paths, byte counts and SHA-256 of every reader file and the compiled Worker JavaScript. It records the content-based artifact SHA-256 over that inventory. Wrangler’s timestamped README and path-dependent Worker debug map are dry-run diagnostics excluded from the artifact. The dry-run compiles the Worker and reads the asset directory. Cloudflare’s actual published version and routing require separate evidence.

Run the source regression checks below and link their exact commands, results and omissions in the candidate record. The packaged Chromium check uses synthetic 404/503/invalid gateway responses and aborts unexpected browser requests. Existing integration tests cover the broader workflows and the ordinary flag-off reader.

```sh
npm run test:reader-shell
npm run test:gateway
node --experimental-strip-types --test tests/ci/*.test.ts
npx playwright test --config tests/readerShell/playwright.config.ts
npm run lint
npm run build
npm run test:smoke
```

Hosted CI rehearses this build on every relevant PR, merge group and `main` push. The **Build and verify R06 release artifact** job runs `tests/release/r06-preflight.test.mjs`, then `build`, `verify` and `smoke` at the checked-out commit, and writes the manifest and artifact SHA-256 values to its job summary. It never deploys or runs `perimeter`. A merge-group or PR run builds GitHub's integration commit, so its digests describe that commit, not a separately pinned M1 candidate. It does not replace the independently recorded qualification build. ([Claude Says #367](https://github.com/Bibleberry/Bibleberry/issues/367))

General Administration should record the hosted `Bibleberry CI` run, built Git SHA (including merge-queue SHA when applicable), and executed versus skipped steps for **Build reader application**, **Verify Release Gateway core** and other applicable checks. The standard reader job’s build and staging dry-run operate on its ordinary build. Record the dedicated packaged-reader smoke and dry-run separately. For Full M1, tie the accepted G09 J1–J7 evidence to the exact configuration and artifact. Record J8 hosted accounts and native packaging outside this guest-only web scope, and record any manual accessibility gaps and live monthly content proof still pending.

## Deployment preflight

1. **Candidate.** Require accepted Full M1, exact-head technical disposition, applicable hosted checks, the verified artifact manifest, and the owner’s exact SHA, digest, Worker and single-operation approval. Keep interim artifacts out of any deployment handoff.
2. **Live identity and access.** An authorized operator confirms the owning Cloudflare account, the existing Worker, active routes and traffic split, and Access coverage of the hostname, any preview URLs and any alternate routes. Confirm from Sanity account metadata that the dataset is private and the Worker has only the authorized read-only binding. Record sanitized evidence and the operator’s current scoped permissions. Use the existing binding and configuration. Missing visibility, an exposed alias, or any required settings or credential change places the operation on HOLD.
3. **Anonymous checks.** Confirm the Access team hostname independently in Zero Trust. Use a fresh credential-free shell. Below, `R06_ACCESS_TEAM_HOST` is the verified `*.cloudflareaccess.com` team hostname. The checker makes GET requests only, discards bodies, and leaves redirects unfollowed. It requires an HTTPS Access login redirect to that team for the root, every candidate asset path and the API paths. It treats bare 401/403/404, other redirects and transport failures as HOLD because those responses alone cannot establish Access. Set `R06_LIVE_ASSET_PATH` to a hashed JS or CSS asset path from the currently active staging deployment. Identify it through authorized read-only inspection. The checker tests that path as well because candidate assets may be absent on the previous version. Apply the same redirect criterion to any reachable alias.

   ```sh
   node scripts/release/r06-verify-staging.mjs perimeter "$R06_COMMIT" "$R06_MANIFEST_SHA256" "$R06_OUTPUT" "$R06_ACCESS_TEAM_HOST" "$R06_LIVE_ASSET_PATH"
   ```

4. **Recovery baseline.** Before any deployment, capture the current deployment ID, stable known-good version ID and traffic percentages, staging config/binding summary and known-good static fingerprints. Confirm the identified version is restorable with its assets and compatible bindings. With already authorized Cloudflare read access, use the dashboard or the pinned Wrangler `deployments list --config wrangler.staging.jsonc --name bibleberry-staging` and `versions view <version-id> --config wrangler.staging.jsonc --name bibleberry-staging`. Record the known-good smoke paths, responsible operator, rollback authority and recovery evidence in the restricted operational record. Stop if a traffic split or rollback restriction prevents a single known-good restore.
5. **After a separately authorized operation.** Record the deployment and version IDs returned by the operator’s approved action, and confirm the active version and target via read-only inspection. Compare authenticated root and hashed static response bytes to the manifest without recording bodies. Rerun the anonymous probes before authenticated reader smoke. Verify the authorized gateway, unavailable/embargo behavior and truthful guest restrictions in the protected browser. Hand Alpha B/C the version and artifact identity, review links and sanitized status evidence. Real monthly content verification belongs to Alpha B and depends on [#333](https://github.com/Bibleberry/Bibleberry/issues/333).

## Rollback decision and verification

- Stop after any identity/hash mismatch, unexpected Access response, protected smoke failure, or evidence of unauthorized content. Record the failure and affected active version using sanitized metadata, then escalate to Aaron. If the incident appears to involve Access or remote editorial content, route it to the responsible operator. A Worker rollback cannot restore account-side Access settings or reverse Sanity changes.
- If Aaron separately authorizes the exact recovery operation, the named operator restores the previously recorded version with the Cloudflare dashboard or pinned Wrangler `rollback <known-good-version-id> --config wrangler.staging.jsonc --name bibleberry-staging`. Use an explicit version and inspect the target before confirming. If the version or route is ambiguous, stop for an owner decision.
- Verify the restored active version and traffic allocation, anonymous Access coverage for root/static/API and the known-good authenticated smoke and asset fingerprints. Record who acted, when, the before/after IDs and remaining failures. Escalate incomplete recovery without attempting additional service changes.

## Candidate evidence record

| Item | Required evidence |
| --- | --- |
| Source and build | Pinned source SHA/tree, tooling SHA, node/npm versions, build profile, artifact and independently recorded manifest SHA-256, matching rebuild and dry-run log |
| Qualification | Hosted run and built SHA, actual test selections and omissions, G09 matrix and Aaron’s Full M1 decision |
| Perimeter and permissions | Verified account/Worker/project/dataset, Access policy coverage and anon probe results, read-only binding and operator scope evidence |
| Recovery | Prior version/deployment IDs, known-good fingerprints and smoke, rollback feasibility and change authority |
| Outcome | Preparation status, deployment and rollback execution status, or HOLD with blockers and next owner |

Current preparation keeps final M1 qualification, verified live Access, known-good version capture, deployment and overall alpha acceptance on **HOLD** until the corresponding evidence and authority are recorded.
