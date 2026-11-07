# Bibleberry — Release Readiness, Environments & Rollback

> **Status:** Working release-planning document. It records verified current facts, proposed operational safeguards, and unresolved launch decisions. **Not an approved release specification or authorization to build/deploy.**  
> **Created:** November 1, 2026  
> **Planning target:** January 1, 2027, **subject to readiness**  
> **Technical release authority:** Aaron Waid  
> **Editorial, theological, and ministry-facing visual authority:** Alexis Waid

## 1. Purpose and governing rules

The goal is to launch a trustworthy, accessible, Scripture-grounded formation app without sacrificing the substance of Alexis's teaching, reader privacy, or recoverability simply to hit a date. A release date is a **target, not automatic permission to publish**. Aaron makes the final technical Go/No-Go decision; Alexis approves content, adaptations, and relevant visual decisions. Both approvals are needed where their domains intersect.

Follow [AI Development Protocol](../ai-development-protocol.md), [Development Workflow](../development-workflow.md), and [Regression Smoke-Test Checklist](../testing/regression-smoke-checklist.md). Every implementation needs its own approved scope/Issue, branch, PR, checks, and acceptance. This plan does **not** silently approve proposed features or publishing.

## 2. Verified repository position (November 1, 2026)

| Area | Verified today | Not established by repository inspection |
| --- | --- | --- |
| Reader | React 19 + TypeScript + Vite prototype; content fixtures; Today, Archive, Foundations, Challenges, browser-local reader state | Live production CMS consumption; deployed host/domain; durable account-backed reader records |
| Guided experience | Development-only Interactive Challenge Lab with saved Scripture and completion flows; isolated local state | Production Challenge completion and account synchronization |
| Editorial | Standalone Sanity 6 Studio under `studio/`, connected in config to project `80016lrq`, dataset `production`; November 2 pilot schema/template | Validated CMS-to-reader integration (Milestone B), authenticated editing verified in this inspection, production publishing procedure |
| Verification | GitHub Actions reader build and Studio typecheck/build, protected `main`; manual smoke-check document | Automated browser suite or lint CI gate; real mobile-device or assistive-technology release testing |
| Deployment/mobile | `npm run build` produces the reader bundle; `npm run preview` permits local preview | Selected production host, preview deployment, CI/CD release action, Capacitor/native app packaging, app-store distribution |

**External hosting, account configuration, and app-store work could exist outside this repository; those must be verified directly rather than assumed absent.** The repository README calls the app name provisional. No hosting vendor, publication cadence, native delivery method, or release scope is decided by this document.

## 3. Launch priority register

This is a **planning classification**, not a decision to add or drop features.

### A. Baseline gates for any public release

- **Content integrity:** The release exposes only Alexis-approved editorial/theological material and presentation; no unreviewed optional studies or invented research. Bible translation text must have confirmed in-app use rights, or remain reference-only.
- **Working daily experience:** Approved Challenge formats and archives actually render through the intended release source. Complete the next agreed milestone, **Sanity Milestone B**: a validated CMS-authored Challenge appears correctly in the reader, with controlled publishing, safe error/fallback handling, and no accidental preview/draft leakage.
- **Reliable reader access:** Public teaching is free to access without registration. Challenge navigation, archive, optionality, accessible reading sizes/interaction, and expected retention of reader state for the chosen launch scope work as specified. A guest's on-device progress must not be represented as guaranteed recoverable.
- **Security and privacy:** No exposed write credentials or sensitive drafts, appropriate access boundaries, dependency-risk disposition (track [Issue #10](https://github.com/ContraPhilosophy/Bibleberry/issues/10)), privacy disclosure, and an actionable incident/contact path.
- **Operational readiness:** A chosen, verified publication route; HTTPS; controlled configuration/secrets; logs or monitoring sufficient to detect a broken release; known-good artifact or reproducible build; tested rollback procedure; assigned decision-makers.
- **Verification:** Required CI checks pass, relevant [regression smoke tests](../testing/regression-smoke-checklist.md) have evidence, and representative real-device/assistive-technology checks are completed for the actual supported release channels. Untested items are not reported as passing.

### B. Launch-scope decisions that must be made, not silently deferred

| Decision | Current direction | What must be decided before a release claim |
| --- | --- | --- |
| **Release channel** | **Installed iOS/Android is the primary product direction (Aaron, Nov 6); hosted web supplementary** | Choose native packaging/runtime (not yet selected), confirm actual app-store deployment scope/sequence, signing, testing devices, review lead times, and launch meaning; decide hosted-web scope and coordination |
| **Accounts and durable progress** | Optional registration; Supabase direction; Google, Apple and passwordless email-code login; durable accomplishments tied to accounts | Whether authenticated cross-device saves, Challenge completions, Scripture and achievement history are part of *initial* launch; the required migration, recovery, access-control and UX rules. **Do not remove them from launch scope without Aaron's decision** |
| **Field Notebook / achievement system** | The November 7 **product behavior is substantially settled**: Scripture cards for thematic and complete-month accomplishments, evolving lifetime status, historical Library credit, grouped Notebook and optional combined notifications. **Not implemented or approved for launch.** | Exact initial release scope, assets and Alexis's visual/editorial review, CMS/award contract, sync, tests and phased implementation authorization. Consult [current/historical/open decision status](../product/gamification-and-achievements.md#decision-status-at-a-glance--november-7-2026) |
| **Challenge formats and initial content** | All dated experiences called Challenges; current prototypes cover several formats | Which formats and editorial corpus ship, publishing cadence, content QA and release-time behavior, and Alexis's approvals |
| **Production hosting and CMS environment strategy** | Reader build exists; Sanity Studio references a `production` dataset | Host, domain, access controls, preview strategy, separate draft/test content strategy, backups and responsible operator |

**Milestone B is the next engineering milestone, not evidence that all launch decisions are settled.** Treat any adjustment to the initial product scope as a documented, approved product decision.

### C. Post-launch *candidates* (not promises)

Possible later work includes specific optional time-limited **Special Experiences** (for example, “Praying the Hours”) and full offline-first synchronization. Specific event production is exploratory; the *evolving lifetime participation status* is already current Field Notebook direction, **not** a speculative ladder of collectible badge designs. None of these items is authorized for implementation merely because it appears in this plan. Additional priorities depend on Aaron/Alexis's approval and the selected launch channel.

## 4. Environment boundaries (target operating model; not configured yet)

| Environment | Purpose | Data/content | Allowed actions |
| --- | --- | --- | --- |
| **Local development** | Build components, inspect fixtures, use Developer Studio and Interactive Challenge Lab | Synthetic/test data; isolated browser storage; non-production credentials only when needed | Test freely without publishing to real readers; `npm run dev` exposes developer tools intentionally |
| **Preview / internal testing** | Review a specific PR commit and CMS-rendered experience before acceptance | Separate/nonpublic test content and, if accounts exist, isolated test users + services where feasible; no production write access by default | Show to Aaron/Alexis/testers; verify feature behavior, editorial adaptation, accessibility, and release-like builds |
| **Production** | Publicly accessible, approved reader and published content | Only approved published content; private reader records protected by per-user authorization when implemented | Release from a reviewed commit with logged approval; use ordinary public build **without** `VITE_ENABLE_DEVELOPER_STUDIO` |

Concrete providers and URLs are **TBD**. Do not invent domains or create production deployments merely to satisfy this table. Avoid using the existing Sanity `production` dataset as a sandbox: plan a separate non-production dataset/project or rigorously controlled isolated drafts before CMS integration, with schema and access boundaries reviewed. Sanity public datasets should be treated as potentially publicly queryable; draft/editorial review metadata and private manuscripts must never be exposed to reader clients.

Configure credentials per environment, restrict permissions, avoid putting server-side keys in Vite browser variables or client bundles, and explicitly verify allowed origins. Preview must not accidentally publish, send real notifications, collect personal journal data, or mutate production reader accounts. Use separate test identities and safe fixtures.

## 5. Delivery and rollback procedure (to implement and rehearse)

### Before any deployment
1. Identify the **exact Git commit SHA**, release artifact/version, host/environment, current schema version, content publication state, and responsible operator.
2. Require protected-branch PR review/CI, regression evidence, privacy/security assessment, and Alexis approval for relevant editorial changes. Record Aaron's release authorization separately from PR merge.
3. Capture a **known-good** deployed artifact/host release ID, configuration and dependency versions, together with a health-check path and restoration instructions. For stateful systems, verify backup recency and restore feasibility **before** risky changes.
4. Confirm that the intended release is a **normal public build** with Developer Studio/lab absent from visible routes *and* build output. See the regression checklist.

### Deployment verification
1. Deploy only through the selected, documented process; record timestamp, artifact SHA, environment, and operator.
2. Perform production smoke checks on the deployed artifact: public Today/Archive/Challenge paths, content publication correctness, links/assets, responsiveness, accessibility basics, console/network errors, and applicable sign-in/saved-progress flows.
3. Monitor errors, unusual request failures, publication mismatches, and key reader flows after the release. Maintain a named contact and a clear halt/rollback decision.

### If a release is broken
- **Code-only regression:** Stop additional releases. If hosting supports a known-good artifact/version rollback, restore it under an authorized incident procedure; otherwise prepare a minimal revert/hotfix branch and PR against protected `main`. Record incident, affected version, action, and outcome. Do not bypass branch protection casually.
- **Editorial/content incident:** Identify the affected Sanity document and publication state. Withdraw/correct content using authorized editor access and documented revision/history procedures. Verify what readers and caches actually show. Rolling back app code alone may not roll back remotely published content.
- **Data or schema incident (when accounts exist):** Do **not** assume a code rollback reverses database migrations. Prioritize preserving records, compatible migrations, access isolation, tested backups, and a validated restoration/forward-fix plan. Never overwrite reader accomplishments based on older device data without approved conflict handling.
- After recovery, rerun applicable smoke checks, capture evidence, communicate the incident internally, and open a follow-up Issue for the root cause.

**This is a required future runbook, not proof a host rollback, content revision, database restore, or alerting system has been exercised.** The first real release must demonstrate the procedures on its actual infrastructure.

## 6. Future release-readiness checklist (not tasks to perform today)

### Editorial and publishing
- [ ] Alexis approves the shipping Challenge content, structured adaptations, prayers, visual treatments, and optional studies; unapproved drafts remain unavailable to readers.
- [ ] Scripture translation usage rights and reference-only/memorization behavior verified for shipped content.
- [ ] Sanity-to-reader integration and publication scheduling/ordering validated, including missing content and safe fallback.
- [ ] Archive and completed-content accessibility verified; no artificial mandatory deeper-study gates.

### Reader accounts and private data — **if included in the approved initial scope**
- [ ] Approve account/guest requirements and data model; test Google/Apple/email-code flows on the chosen channels; secure sessions and identity linking.
- [ ] Enforce per-user authorization/RLS and verify cross-user isolation for every private table/API; no server keys in client code.
- [ ] Verify durable completion records, saved Scripture, learned dates, earned dates, deduplication, guest-to-account migration, account recovery, and cross-device conflict behavior.
- [ ] Verify account/data deletion, privacy disclosures, consent boundaries, minimal data collection, and no automatic marketing subscription.
- [ ] Configure production backup retention, access, monitoring and alerts; **perform and document a successful restore rehearsal** before real reader records accumulate.
- [ ] Validate costs and limits for expected monthly active users, database usage, auth email, and file storage.

### Packaging, production, and beta
- [ ] Record whether this is web/PWA and/or app-store launch; verify selected host, HTTPS, domain, supported browsers, caching and update strategy.
- [ ] If native: select packaging/signing strategy, developer accounts, store metadata/privacy forms, compliant authentication and deletion workflows, review lead time, and staged rollout/rollback constraints.
- [ ] Conduct iPhone/Android device testing **for the platforms actually supported**, appropriate screen-reader/keyboard testing, network failure/reconnect tests, and a small controlled beta.
- [ ] Rehearse deployment, wrong-content withdrawal, code rollback, and any required backup/restore procedures. Validate release artifact excludes developer-only code.
- [ ] Record production support/incident ownership, monitoring, version, deployment log, and Go/No-Go outcome.

If a conditional feature is deliberately *not* in the initial release, record Aaron's explicit scope decision and the user-facing consequence; do not falsely report its tests as passed or silently claim future guarantees.

## 7. Go / No-Go record (fill for each candidate release)

| Field | Required record |
| --- | --- |
| Candidate | Version, commit SHA, artifact ID, target channel/environment |
| Scope | Approved release features and explicitly deferred features, with decision links |
| Evidence | CI links, smoke-check IDs/results, real-device/beta results, editorial/Scripture rights approvals |
| Risks | Open vulnerabilities, known limitations, data/privacy issues, accepted exceptions and owners |
| Recovery | Verified prior artifact/content revision, backups if applicable, tested rollback procedure |
| Authority | Aaron's technical Go/No-Go; Alexis's approvals where required; decision date/time |
| Outcome | GO, NO-GO, or HOLD, with reason and follow-up action |

**No-GO** if critical security/privacy, Scripture-rights/editorial approval, core reader function, recoverable data integrity (when promised), or required channel-specific verification is unresolved. January 1 remains a planning objective, **not** a reason to waive launch gates.
