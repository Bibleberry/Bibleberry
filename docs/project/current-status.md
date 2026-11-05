# Bibleberry — Current Project Status

**Last reconciled:** November 5, 2026  
**Status:** Living, cross-repository handoff and project-state summary  
**Primary repository:** [ContraPhilosophy/Bibleberry](https://github.com/ContraPhilosophy/Bibleberry)  
**Companion repository:** [ContraPhilosophy/BerryMark](https://github.com/ContraPhilosophy/BerryMark)  
**Product roadmap:** [Product & Application Development Roadmap](../product/application-development-roadmap.md)  
**Initial preserved snapshot:** [November 5, 2026 baseline](status-history/2026-11-05.md)  
**Related planning:** [Bibleberry #34](https://github.com/ContraPhilosophy/Bibleberry/issues/34), [engineering maturity #20](https://github.com/ContraPhilosophy/Bibleberry/issues/20)

> **Read this at the start of a new AI session**, then verify anything relevant against the **current** GitHub branches, Issues, PRs and source code before making decisions or assignments. This is a maintained summary, **not an automatic reflection of GitHub**. It must not be mistaken for proof that tests, access controls, deployments or approvals have occurred. Last reconciled means the date of the documented review, not continuous monitoring.

## 1. Start here: what this project is and who decides

Bibleberry is the working name of a free, mobile-first Christian biblical-formation application built around Alexis Waid's substantive teaching. **The teaching determines the experience:** preserve source manuscripts, theological reasoning, full prayers, optional deeper study and flexible presentation; never shorten teaching just to fit cards, screen-count limits or a fixed template. Every dated daily experience is a **Challenge** regardless of format. The intended seven experience types are not yet one finalized technical contract.

- **Aaron Waid:** product scope, engineering, infrastructure, PR acceptance, merges and releases.
- **Alexis Waid:** theological/editorial authority and relevant ministry-facing visual decisions. Technical/developer-authored test content can be explicitly approved by Aaron; record actual reviewer and review timestamp truthfully. Do not represent Aaron's developer-test approval as Alexis's theological review.
- **ChatGPT:** product/engineering coordination, architectural synthesis, GitHub audit and scoped agent handoffs.
- **Coding/review agents:** Kimi, Google Antigravity, Copilot and other chosen assistants are replaceable implementation/review resources, not the source of product authority. Gemini is also available for research and comparison.

**Standing rule:** Read [AI Development Protocol](../ai-development-protocol.md) and the relevant Issue. Plan → separate scoped branch → test → PR → independent review → Aaron accepts/merges. Changes affecting Alexis's domain require her review. A documentation roadmap or this status document does **not** authorize implementation.

## 2. Exact GitHub baseline and work in flight

**Accepted protected `main` as checked November 5:**

| Repository | Checked `main` commit | Evidence |
| --- | --- | --- |
| Bibleberry | `a0a7758ce0d10175ad7fc5c573035456c8218136` | [Commit](https://github.com/ContraPhilosophy/Bibleberry/commit/a0a7758ce0d10175ad7fc5c573035456c8218136) |
| BerryMark | `bc1862b5d1ffd487e9f90725f495157a59070ca4` | [Commit](https://github.com/ContraPhilosophy/BerryMark/commit/bc1862b5d1ffd487e9f90725f495157a59070ca4) |

These are **dated reference points**, not SHA pins that future agents should continue developing against if `main` advances.

**Open work seen on November 5:**
- [Bibleberry PR #35](https://github.com/ContraPhilosophy/Bibleberry/pull/35) on `docs/34-product-application-roadmap`: documentation-only roadmap and status/handoff proposal. **Open, not merged**; its files are not yet on `main`. See [Issue #34](https://github.com/ContraPhilosophy/Bibleberry/issues/34).
- Bibleberry had **no other open PRs** at this check. BerryMark had **no open PRs**.
- Existing `fix/15-eslint-ci-baseline` branch is present; the Nov 5 handoff describes it as identical to accepted main after Kimi could not push the fix. Do not assume code changes landed; recheck branch before any agent resumes.
- BerryMark's `feat/04e-c-controlled-draft-create` branch still exists after [PR #11 merged](https://github.com/ContraPhilosophy/BerryMark/pull/11); [BerryMark Issue #9](https://github.com/ContraPhilosophy/BerryMark/issues/9) remained open. Its administrative cleanup is not a reason to redo the importer.

## 3. Functional implementation: verified, partial or not started

### Bibleberry reader and Developer Studio

- **Normal reader:** React 19 / TypeScript / Vite. `src/App.tsx` serves Today, Foundations, Archive, More, reader appearance, local history/last-opened resume, selected media and existing formation views. **The normal Today/Archive Challenge path still uses local hardcoded teaching/formation fixtures**; it does not yet run the CMS-backed interactive Challenge player.
- **Interactive Challenge Lab:** Under **More → Developer Studio → Interactive Challenge Lab** in development/testing builds, four hardcoded Alexis-derived teaching adaptations (Nov 1: 5 screens; Nov 2: 7; Nov 3: 8; Nov 5: 8). Features include screen navigation, completion, saves, optional studies, Scripture references, prayer and one configured memorization practice.
- **Separate Sanity CMS Lab:** Live Published Sanity versus Development Fixture Preview, runtime validation and rendering of nine Content Block concepts, separate saved references/completion and honest error/empty states. The **CMS Lab Scripture library currently does not provide general memorization practice**, even though other demo components include a phrase-reveal tool.
- **Existing format experiments:** Guided discipline, worksheet and printable PDF, memorization and Foundations resources exist in `src/components/FormationViews.tsx` and fixture data. The ultimate seven dated Challenge experiences require taxonomy and production integration decisions.
- **Deliberate local-state isolation:** ordinary reader `bibleberry-prototype-v1`, local interactive Lab `bibleberry-interactive-challenge-lab-v1`, CMS Lab `bibleberry-sanity-challenge-lab-v1`. Do not simply combine these stores. **No implemented cross-device user sync** is confirmed.
- **Developer gate:** local dev or explicit `VITE_ENABLE_DEVELOPER_STUDIO=true` test build. Public-style `npm run build` must exclude developer tools, fixtures and Lab JS chunks, not merely hide links.

### Sanity CMS: important November 3 verified milestone

[Issue #25](https://github.com/ContraPhilosophy/Bibleberry/issues/25) is **partly implemented and partly open**, and its newest comments are essential reading:

1. **B1 merged:** PR #27 read-only published-perspective adapter, typed/validated mapping and focused tests. Aaron ran 29 adapter tests after merge; 29 passed.
2. **B2 merged:** PR #28 added CMS rendering inside Developer Studio, two explicit source modes, Portable Text, CB1–CB9 and isolated local state.
3. **B3 core live proof PASSED on November 3:** Aaron added exact Sanity CORS origin `http://localhost:3000` with credentials disabled. An initial real browser query correctly returned an empty published list. He then manually published a deliberately harmless **Bibleberry CMS Integration Test** Challenge in the **public `production` dataset**, under series **Bibleberry Development Tests**, with reference-only **Psalm 23:1** and a one-screen **Hello from Sanity** teaching. After correcting missing `editorialEligibility.reviewedAt`, the **real local Firefox CMS Lab rendered it**. He then edited and republished the **same document**; the added sentence appeared in the reader **without an application rebuild**. This is an unmocked publish → read → edit → republish → read demonstration, **not just a hypothetical future task**.
4. **Still open:** B3's core local demonstration does not mean the CMS player is in the **ordinary reader** or the public release pipeline. There is no established private-dataset/Worker **server-enforced future release embargo**, and protected Cloudflare Lab-origin/device integration has not been fully verified. A scoped **editorial approval label/validation correction** is also needed: the Studio's “Adaptation reviewed by Alexis” wording should not require a false attribution where Aaron actually reviewed a developer-authored test. No correction has been committed simply by documenting the decision.

**Sanity administration:** project `80016lrq`, schema/Studio in Bibleberry `studio/`. Already deployed Studio: [bibleberry-editor.sanity.studio](https://bibleberry-editor.sanity.studio/). `studio/sanity.config.ts` targets **public** dataset `production`. A separate importer development dataset named `berrymark-development` and restricted writer credential have been planned, **but their creation/configuration has not been confirmed**. Do not assume the old November 2 inventory of two total documents is current: the November 3 published test added records. Do not publish embargoed teaching to the public dataset or mistake CORS for access control.

### BerryMark: ready for a controlled live importer acceptance

- Separate repository, Node 20+ experimental manuscript DSL, parser, validations, nine append-only CB content blocks, Sanity Portable Text compiler, stable semantic keys, provenance/fingerprints, offline/online preflight.
- [BerryMark PR #11](https://github.com/ContraPhilosophy/BerryMark/pull/11) **merged November 5**. Controlled importer defaults to **dry run**, and the explicitly authorized, server-side administrative `--apply` path is **create-only** for a development Sanity draft. It rejects production, foreign identity collisions and unsafe revisions; verifies a new draft with readback; unchanged reimport is a no-write no-op. No general update, publish, delete, or one-way synchronization after initial ingest.
- The Nov 5 engineering handoff reports **180 passing importer/repository tests**, but this status reconciliation did **not** execute them again.
- **Important remaining acceptance:** No authenticated actual Sanity **development-dataset write** has been verified. First confirm the dev dataset, restricted token and test series; use synthetic rights-safe, Scripture-reference-only content; run default dry-run → exactly one explicitly approved `--apply` → inspect draft and provenance → repeat and prove zero writes.
- **Editorial follow-on:** Adapt Nov 3 then Nov 5 without losing Alexis's original arguments or prayers. Nov 5's cyclical connected sequence has a `returnCaption` contract question; resolve through editorial/contract review, not invented wording. Nov 2's sample has an existing competing slug/ID in Sanity and is not a shortcut around duplicate protection.
- See [controlled draft apply contract](https://github.com/ContraPhilosophy/BerryMark/blob/main/docs/controlled-draft-apply.md) and [BerryMark README](https://github.com/ContraPhilosophy/BerryMark/blob/main/README.md).

### Testing, hosting and release

- **CI on current Bibleberry main:** Reader build; CMS adapter/BerryMark preview test job; Sanity schema tests/typecheck/build. **Lint is not yet an enforced required CI step**. [Issue #15](https://github.com/ContraPhilosophy/Bibleberry/issues/15) covers historical reader ESLint errors and the narrow lint/CI fix. Reproduce actual findings before coding.
- **Reader behavior regression:** [Issue #26](https://github.com/ContraPhilosophy/Bibleberry/issues/26) is scoped and approved; no complete repeatable CI browser smoke suite yet.
- **Protected Cloudflare Lab:** [bibleberry-lab.aw-e44.workers.dev](https://bibleberry-lab.aw-e44.workers.dev) is an internal authenticated testing host; Cloudflare PR previews and some access protections demonstrated; permanent `wrangler.jsonc` merged via PR #24. [Issue #21](https://github.com/ContraPhilosophy/Bibleberry/issues/21) remains open for selected unauthorized-identity, older-URL, device/asset and rollback checks.
- **Reader accounts:** Supabase is the *working architectural direction* for optional Google/Apple/email-code accounts and cloud progress; no approved/verified live reader auth/sync integration. See [account architecture](../architecture/user-accounts-and-sync.md).
- **Publishing operations:** target ~30 days of approved teaching queued, desired minimum ~14 days; Sanity publication **is not** reader release. Private Sanity and server-authoritative Cloudflare Worker gating are recommendations to evaluate before actual advance releases.
- **Release channel:** January 1, 2027 is a planning target, not a reason to bypass readiness. Web/PWA/native packaging, public production and rollback/backup rehearsals remain scope decisions.

## 4. Decisions and issues: status at this handoff

| Item | Actual disposition / next gate |
| --- | --- |
| [#15 — lint and CI](https://github.com/ContraPhilosophy/Bibleberry/issues/15) | Scope approved; implementation not delivered. Good contained **Antigravity pilot** once local Git and permissions are verified. |
| [#20 — engineering maturity](https://github.com/ContraPhilosophy/Bibleberry/issues/20) | Open parent engineering roadmap; preserve as separate from the product-wide roadmap. |
| [#21 — Cloudflare](https://github.com/ContraPhilosophy/Bibleberry/issues/21) | Important deployment/access proof exists; final acceptance/rollback and device checks remain. |
| [#22 — Hub / personal area / What's New](https://github.com/ContraPhilosophy/Bibleberry/issues/22) | Product design backlog; **not approved for implementation**. Polished coordinated mockups and Alexis's review needed. “My Journey” is a provisional name; include Archive/Foundations in exploration planning. |
| [#25 — Sanity Milestone B](https://github.com/ContraPhilosophy/Bibleberry/issues/25) | B1/B2 merged; Nov 3 real B3 publication-and-revision proof PASSED in local CMS Lab. Open editorial-review schema correction and remaining explicitly scoped reader/security checks. |
| [#26 — automated browser smoke suite](https://github.com/ContraPhilosophy/Bibleberry/issues/26) | Scope approved; actual implementation/CI enforcement pending separate kickoff. |
| [#10 — minimatch advisory](https://github.com/ContraPhilosophy/Bibleberry/issues/10) | **MONITOR ONLY / PARKED** by Aaron. Don't reopen absent specific trigger described in Issue. |
| [#34 / PR #35 — project roadmap and living status](https://github.com/ContraPhilosophy/Bibleberry/pull/35) | Documentation proposal for Aaron to review and merge. Do not claim part of accepted main until merged. |
| [BerryMark #9 / PR #11](https://github.com/ContraPhilosophy/BerryMark/issues/9) | Importer implementation merged through PR #11; Issue #9 still open as of Nov 5. Live importer acceptance is a separate next action. |

## 5. Current agent and working-environment handoff

**BigMac:** Aaron's Linux/KDE home machine; canonical Bibleberry checkout **`/home/aaron/Projects/Bibleberry`** (do not accidentally use historical duplicate `/home/aaron/Bibleberry/Bibleberry`). Vite reader has been run at `http://localhost:3000/`; deployed Studio can be accessed directly in a browser without starting the local Studio.

**Antigravity:** Installed on the home computer according to Aaron on Nov 5. No confirmed login, repository/branch workflow or successful write/PR pilot yet. Aaron is mobile-only while traveling, so an Antigravity session is **not available from the current phone**. Intended first exercise is #15 on a dedicated branch, preserving current accepted main and CI.

**Kimi:** Produced much of the early application, B1/B2 work and BerryMark importer. On Nov 4/5 a GitHub plugin write-permission/API 403 problem obstructed further work on #15. Aaron reports roughly 80% of the month's Kimi allowance used. This is an **agent/tool and capacity issue**, not evidence that Bibleberry's code or its branch protections are broken. Do not keep retrying broad GitHub mutations with an agent that lacks permission.

**Copilot:** Available as a bounded independent coding reviewer (including successful review/corrections on BerryMark PR #11), not automatically the primary builder. **Gemini Pro:** Available for research, analysis and alternative engineering perspectives. **ChatGPT:** Coordinates decisions, audits, integration plans, reviewer handoffs and verification; does not substitute AI assertions for merged commits or test results.

**Agent-neutral workflow:** Work is owned by the **repository, branch, Issue and acceptance criteria**, not by one subscription or model. Hand off a single scoped assignment with exact base ref, target files, constraints, checkpointed pushed commits, tests and PR link. If a coding tool fails, another agent can resume from the last confirmed remote branch commit; never assume unpublished sandbox work reached GitHub.

## 6. Recommended near-term sequence (proposals, not assignments)

1. **BerryMark controlled live acceptance:** confirm `berrymark-development` dataset/limited write access; test safe synthetic draft create/readback/no-op; do not publish. Pair with the Nov 3 editorial adaptation and then Nov 5 review.
2. **Next reader integration:** the Sanity CMS source and renderer have already been proven locally with a real test Challenge. Design the **promotion into normal Today/Archive**, reconcile daily Challenge types, and specify reliable, canonical completion/saved Scripture/progress data before implementation. See R03/R04/R07 in the [product roadmap](../product/application-development-roadmap.md).
3. **Reader architecture & mockups:** review Hub, personal exploration destination, What's New and onboarding under #22 before shipping a navigation redesign.
4. **Agent and engineering quality:** validate Antigravity's local Git/PR workflow with a contained #15; independently scope #26 browser regression automation next; finish high-value #21 Lab checks.
5. **Later launch dependencies:** decide/rehearse private-source release gating, cross-device account records, exact launch channel, mobile accessibility, beta and recovery expectations.

## 7. How future chats and agents should use and update this file

**Suggested opening to a new chat:**

> We're continuing Bibleberry AppDev. Read `README.md`, `docs/project/current-status.md`, `docs/product/application-development-roadmap.md`, and `docs/ai-development-protocol.md` in ContraPhilosophy/Bibleberry. Verify the current `main` refs of Bibleberry and BerryMark and relevant open Issues/PRs. Identify what changed since the status timestamp, then discuss the next approved scope before making changes. Do not assume a planned task is complete or authorized.

**Maintenance rules:**
1. **The repository is authoritative:** compare current refs, merged PRs, tests and relevant Issue comments; only then update this *summary*. If evidence contradicts the file, report the discrepancy and fix the dated status through review.
2. **Update after meaningful changes**, not every commit: merged feature, verified external integration, major product decision, material blocker/unblock, environment/agent change that affects handoff, or a new accepted delivery/release milestone. Include what changed, a date, the evidence link and what remains.
3. **One maintainer/editor at a time** for this summary. Prefer small documentation commits in the accepted feature PR when relevant, or a short follow-up docs PR after the merge so the snapshot describes *accepted* reality; don't mark a feature merged merely because its PR is open. Separate BerryMark updates can be reflected in a Bibleberry docs PR. Aaron authorizes merges.
4. **Preserve historical checkpoints:** `docs/project/status-history/2026-11-05.md` is the initial immutable baseline. Don't rewrite snapshots to fit later discoveries; add corrections to the living status with dated evidence and use new snapshots only at meaningful future milestones.
5. **Keep it concise and operational:** current known-good versions, working capabilities, what's blocked, next decisions and links. Detailed assignment logs, troubleshooting, code reviews and approvals belong in their Issues/PRs, not copied wholesale into this file.
6. **Report evidence honestly:** distinguish source read, automated tests run, human screenshots/manual checks, CI, verified remote commits and actual deployments. Keep unverified accounts, credentials and external settings clearly marked unconfirmed. Never paste secrets into GitHub or AI handoffs.
7. **Don't auto-authorize work:** consult the [development protocol](../ai-development-protocol.md) and Aaron's direction. The roadmap is stable direction; this file is the changing snapshot; Issues/PRs are execution and evidence.

**This snapshot was reconciled against repository refs, source files and GitHub issue/PR discussions on November 5, 2026.** No local code tests, new Sanity dataset/token writes, cloud configuration changes, application deployment or app/reader engineering were executed to produce it.
