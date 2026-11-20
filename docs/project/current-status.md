# Bibleberry — Current Project Status

> **CURRENT RECONCILIATION CHECKPOINT — November 19, 2026 (Roosting Falcon #260):** The earlier "November 9–10 latest design" and "next R08A-1 coding assignment" statements below are **dated historical handoff material**, not the current implementation queue. See the dated update immediately below, the [single canonical six-phase roadmap](../product/application-development-roadmap.md), [Internal Alpha Readiness](internal-alpha-readiness.md), and [Roosting Falcon's live issue disposition](https://github.com/Bibleberry/Bibleberry/issues/260). Recheck live GitHub before acting. This checkpoint is a documentation-only reconciliation, not hosted-service or release acceptance.

## November 19, 2026 — Roosting Falcon implementation and alpha checkpoint

**Checked Bibleberry `main`:** `21ea10df94671143644ecb86d2b1335dcd9f5bec` at the November 19 evening audit; live refs may advance. **At audit time:** one open PR, [Granite Lantern #259](https://github.com/Bibleberry/Bibleberry/pull/259), 24 open Issues including [Roosting Falcon #260](https://github.com/Bibleberry/Bibleberry/issues/260). The full open-Issue disposition and candidate closures are recorded as a verified read-only comment in #260. **No Issue closures are implied.** The separate BerryMark importer remains a controlled draft tool, not routine production publishing.

**Substantial implemented-on-main delta since November 9:** 
- **Phase 01 / R08A contracts:** consumer compatibility [#68](https://github.com/Bibleberry/Bibleberry/pull/68) merged; the November 9 R08A-1 "next candidate" text is obsolete as a current assignment.
- **Phase 02 / monthly editorial:** `monthlyPublication`, introduction, roster, preview-News and two Studio workspaces [#73](https://github.com/Bibleberry/Bibleberry/pull/73); read-only monthly readiness inspector [#126](https://github.com/Bibleberry/Bibleberry/pull/126). The real recurring editorial month workflow remains to be rehearsed in private staging.
- **Phase 03 / secure monthly reader:** reader-local release gateway [#81](https://github.com/Bibleberry/Bibleberry/pull/81), monthly/preview/News endpoints [#84](https://github.com/Bibleberry/Bibleberry/pull/84), explicit Finish/return providers [#90](https://github.com/Bibleberry/Bibleberry/pull/90), feature-gated Month Screen and introductions [#92](https://github.com/Bibleberry/Bibleberry/pull/92). The earlier **actual R05 private single-Challenge staging acceptance [#63](https://github.com/Bibleberry/Bibleberry/issues/63) still stands**; it is not proof the *new monthly* end-to-end path was exercised against live Sanity.
- **Phase 04 / lasting accomplishments:** guest Finish→Card reconciliation [#107](https://github.com/Bibleberry/Bibleberry/pull/107), earned viewer [#112](https://github.com/Bibleberry/Bibleberry/pull/112), Field Notebook [#127](https://github.com/Bibleberry/Bibleberry/pull/127), sharing [#192](https://github.com/Bibleberry/Bibleberry/pull/192), local private verifier runtime [#234](https://github.com/Bibleberry/Bibleberry/pull/234) and service-role grant hardening [#238](https://github.com/Bibleberry/Bibleberry/pull/238). **Hosted verifier/scheduler and live editorial award flow are not proven**.
- **Phase 05 / coherent reader and accounts:** in-app collections [#147](https://github.com/Bibleberry/Bibleberry/pull/147); Saved Scripture teaching integration [#219](https://github.com/Bibleberry/Bibleberry/pull/219); onboarding replay [#218](https://github.com/Bibleberry/Bibleberry/pull/218); historical Library/Shelf [#231](https://github.com/Bibleberry/Bibleberry/pull/231), Today/Hub Continue [#237](https://github.com/Bibleberry/Bibleberry/pull/237); real-*local* Supabase client cross-device acceptance with simulated devices [#249](https://github.com/Bibleberry/Bibleberry/pull/249); passwordless OTP adapter [#255](https://github.com/Bibleberry/Bibleberry/pull/255). **Global navigation [#22](https://github.com/Bibleberry/Bibleberry/issues/22), genuine OTP delivery, hosted Supabase/account sync, secure native token storage and physical devices remain unverified**.
- **Phase 06 / release and operations:** News [#184](https://github.com/Bibleberry/Bibleberry/pull/184), Studio resources [#181](https://github.com/Bibleberry/Bibleberry/pull/181), signed-off regression/CI improvements and Android APK/iOS unsigned Simulator checks. App-store distribution, real phones, monitoring, backup/restore and release operations remain separate gates.

**Current integration status:** Multiple reader features are wired into ordinary `src/App.tsx` but gated by `VITE_ENABLE_*` flags; acceptance with one deliberately selected configuration and the *same* staged monthly publication is not yet established. See [Internal Alpha Readiness](internal-alpha-readiness.md), which separates the local/automated evidence from full integrated hosted acceptance. A successful merge/CI run does not establish production credentials, editorial content approval, real user sign-in, device qualification or launch readiness.

**Recommended next scope order, subject to owner approval:** (1) reconcile/approve final connected-reader IA and one alpha build config; (2) stage one complete month and demonstrate Studio→gateway→reader→Finish→Card; (3) settle approved manual/BerryMark editorial handoff; (4) decide alpha hosted account scope and prove authentication, private verification and recovery if included; (5) test the chosen alpha channel and operational controls. Maintain the **six existing roadmap phases**; this is a status and qualification view, not a new development sequence.

---

**Last full inventory reconciled:** November 5, 2026  
**Latest scoped checkpoint:** November 9–10, 2026 (Argon R08A-0 Revision 2 read-only design and ChatGPT review; full implementation remains unstarted)  
**Status:** Living, cross-repository handoff and project-state summary  
**Primary repository:** [ContraPhilosophy/Bibleberry](https://github.com/ContraPhilosophy/Bibleberry)  
**Companion repository:** [ContraPhilosophy/BerryMark](https://github.com/ContraPhilosophy/BerryMark)  
**Product roadmap:** [Product & Application Development Roadmap](../product/application-development-roadmap.md)  
**Initial preserved snapshot:** [November 5, 2026 baseline](status-history/2026-11-05.md)  
**Related planning:** [Bibleberry #34](https://github.com/ContraPhilosophy/Bibleberry/issues/34), [engineering maturity #20](https://github.com/ContraPhilosophy/Bibleberry/issues/20)

> **Read this at the start of a new AI session**, then verify anything relevant against the **current** GitHub branches, Issues, PRs and source code before making decisions or assignments. This is a maintained summary, **not an automatic reflection of GitHub**. It must not be mistaken for proof that tests, access controls, deployments or approvals have occurred. Last reconciled means the date of the documented review, not continuous monitoring.

## November 9–10, 2026: R08A-0 architecture completed as a read-only proposal (LATEST DESIGN)

**Technical design:** [R08A-0 Revision 2 — Monthly Publication, Series Identity, and Release Contract Design](../architecture/r08a-0-monthly-publication-release-contract.md), prepared by Gemini Argon from Bibleberry `main` `ebe5b4a89695da5afacd06c8362b01fbaf16d446` and BerryMark `main` `d94d5fa01d7b423650527d00f802ee0356362c6f`. Independent review accepted its overall technical direction, with the clarified reader-local Option 1C release approach and consumer-first compatibility migration. This is a **documentation/design deliverable**, **not** evidence of implemented `monthlyPublication` schemas, release endpoints, Month Screen UI, or a live production content pipeline.

**Source-of-truth relationships:** One `monthlyPublication` per `YYYY-MM` owns all calendar slots; `challengeSeries` is an optional thematic grouping; existing `cms:<SanityBaseId>` participation identity remains stable. Reader-local release uses the gateway's server UTC clock + validated reader-supplied IANA timezone, falling back to `America/New_York`; IP location cross-checking and HMAC continuity are intentionally omitted because preventing early access to approved free teaching is not a substantial threat. Private editorial drafts, unpublished material and account records remain protected by separate existing authorization boundaries.

**Next proposed coding assignment:** **R08A-1 — Consumer Compatibility** (details in §9 of the linked architecture). Scope existing CMS and reader consumers to accept optional `series`, `sequence`, `releaseAt` and explicit `calendarSlot` **before** Sanity schemas or gateway begin omitting legacy fields. Then follow R08A-2..R08A-6 in their documented dependency order under the [single canonical roadmap](../product/application-development-roadmap.md). Each requires separate Aaron authorization, testing, PR review and merge; no code or services have been changed by R08A-0.

**Implementation review checkpoints:** Avoid circular Studio authoring requirements; keep guest-completion progress calculations distinct from authoritative account award records; consistently adjust thematic/full-month criteria when a finalized Challenge is withdrawn, including before roster re-finalization. Private Sanity `production` must be verified before entering any real future manuscript; continue to use only `production` and `staging` datasets.

---

## November 9, 2026: integrated CMS + reader roadmap and accepted staging evidence (LATEST GUIDANCE)

**Roadmap authority:** Aaron approved a **single** integrated six-phase dependency roadmap at [Product & Application Development Roadmap](../product/application-development-roadmap.md). It is the **only active implementation sequence**, superseding the former November 5 P0/P1/P2 ordering and the CMS planning document's historical Phase A–G proposal where they differ. The complete [November 9 CMS Content Management & Publishing Architecture](../architecture/content-management-and-publishing.md) is the supporting editorial specification, retaining 80 planning decisions; the [November 8 approved reader experience](../product/2026-11-08-approved-reader-experience-and-month-screen.md) remains the product-behavior authority for its domain. A plan is not evidence of build completion or authorization to implement.

**Six phase headings:** (01) shared architecture contracts; (02) Monthly Publishing foundation; (03) secure Month Screen including minimal preview News; (04) discoveries, Scripture Cards and permanent collections; (05) complete navigation/Shelf/Library/accounts/onboarding; (06) expanded editorial and notification/event capabilities plus operations. Phases represent dependencies, not giant PRs or an excuse to delay early account/native/security contracts. Legacy R01–R21/R08A identifiers remain in the canonical roadmap for Issue traceability.

**Accepted R05 Stage 3B and 3C, November 8:** [Issue #62](https://github.com/ContraPhilosophy/Bibleberry/issues/62) and [Issue #63](https://github.com/ContraPhilosophy/Bibleberry/issues/63) **passed and closed**. Private synthetic Sanity dataset `staging` → Cloudflare Access-protected `bibleberry-staging` gateway → ordinary released-Challenge reader succeeded. The browser rendered structured teaching and optional study, saved a Challenge and restored the save after refresh, completed explicitly and restored completion after refresh, used the **same-origin** gateway API without observed direct Sanity requests, and rejected embargoed Fixture B with a neutral not-found reader view. Recorded deployed Worker version `e73541b9-c353-404b-8d41-dfdff5ced3bb`, previous rollback target `d25e82ca-9be5-43aa-b60f-858b6429ffe2`. Earlier R05 Stage 3A/3B pending checklists below are dated history, **not active next steps**. The accepted fixture had one Challenge screen; multiple-screen browser navigation in this specific live run was not independently exercised.

**Source refs for accepted checkpoint:** Bibleberry `main` [`343b7523155e0850558ca05a66b117ea41bbfcc8`](https://github.com/ContraPhilosophy/Bibleberry/commit/343b7523155e0850558ca05a66b117ea41bbfcc8) and BerryMark `main` [`d94d5fa01d7b423650527d00f802ee0356362c6f`](https://github.com/ContraPhilosophy/BerryMark/commit/d94d5fa01d7b423650527d00f802ee0356362c6f). These are fixed evidence references, **not predictions of current main after subsequent PRs**. Inspect live GitHub on every new session.

**Sanity economics and actual environment:** Growth is the approved platform; **only** `production` and `staging` are permitted. Aaron confirms the former `berrymark-development` dataset was deliberately **deleted** to make room for `staging`; it must not be recreated or treated as a third environment. The live private `staging` test source and gateway were accepted in #62/#63. Production manuscript privacy, safe production import permissions and full production editorial workflow remain separate to verify/engineer. BerryMark's earlier live draft acceptance remains valid historical test evidence despite the deleted dataset; its importer still requires an approved safe transition for the current topology.

**What is not complete:** The approved Month Screen/calendar/preview API, local-day authorization policy, true monthly roster and Studio workspace, full Hub/Shelf/Library wiring, Scripture Card publishing/earned collection, native persistence/account sync, full News/notification services, event authoring and real cross-device awards. Don't infer their presence from planning or R05 staging success.

**Next recommended scoped assignment:** **R08A-0 — Monthly Publication, Series Identity, and Release Contract Design**. First deliverable: one month/series source-of-truth and migration plan, reader-local calendar policy, safe future-title/preview projections, edge-case tests, and narrow follow-on assignment proposals. This is a **planning/contract** assignment until Aaron separately authorizes engineering. The single canonical implementation order is in the linked roadmap.

**Change-control reminder:** No documentation acceptance alone authorizes CMS writes, backend changes, event launches, new accounts, deployment or PR merge. Follow one scoped Issue/branch/PR and explicit Aaron decision. Old checkpoint sections below remain as dated evidence; **this November 9 section supersedes their stale pending-work claims**.

---

## November 8, 2026: owner-approved reader-experience specification (PRODUCT AUTHORITY)

Aaron explicitly approved the combined November 6–8 product decisions as the **current direction overriding older proposals**. The new canonical reference is [Approved Reader Experience, Month Screen & Field Notebook](../product/2026-11-08-approved-reader-experience-and-month-screen.md), supported by the updated [Gamification & Achievements](../product/gamification-and-achievements.md), [Product Roadmap](../product/application-development-roadmap.md) and [Account Sync](../architecture/user-accounts-and-sync.md) records.

**New required product component: Month Screen.** A calendar for all 30/31 prewritten Challenge titles, completed/available/Coming Soon states, completion ticker, and Monthly Discoveries below (full-month card last). Unearned discoveries show only title/numeric progress with no tap target or card reveal; earned illustrations open full Scripture cards. A Challenge's **Finish** button is the completion action, and return goes to its origin context. Partial progress is silent; **combined earned-card announcements occur only on the next Hub visit**.

**Monthly publishing:** Next-month teaching preview/news begins on the 28th (Feb 27), with introductory screens; the final Welcome-to-Theme appears at month start. Readers who saw preview can skip to Welcome; historical first visits get the intro; a replay link remains on Month Screen. **Shelf** (0–3 historical months, deliberate selections protected) and **Library** replace previous reader-facing names. Guest-to-new/existing-account merges are automatic; Special Experiences remain strictly time-limited with event-specific started-participant grace. Existing art, watermark treatment, exact calendar/mobile UI, and whole-app navigation remain deferred.

**Verification boundary:** This is a **product-documentation decision**, not a claim that Month Screen, auth/sync, Notebook, introductions or award UI have been implemented. The dated engineering inventory below has not been re-audited by this note. Follow scoped Issue → branch → PR → Aaron merge authorization before code changes.

---

## November 7, 2026: engineering reconciliation after R05 Stage 3A merge

**Checked GitHub source of truth:** Bibleberry `main` at [`379d84dc5bcf3895806f0316ff2f029fbd81d17c`](https://github.com/ContraPhilosophy/Bibleberry/commit/379d84dc5bcf3895806f0316ff2f029fbd81d17c); BerryMark `main` at [`d94d5fa01d7b423650527d00f802ee0356362c6f`](https://github.com/ContraPhilosophy/BerryMark/commit/d94d5fa01d7b423650527d00f802ee0356362c6f). **Zero open Bibleberry PRs** at the checkpoint. The older dated engineering inventory below is preserved as historical evidence; where it disagrees, this newer independently verified checkpoint supersedes its *current-state* claims.

### Merged implementation and product records

| Scope | Merged evidence | What was established |
| --- | --- | --- |
| Reader participation A3 | [PR #49](https://github.com/ContraPhilosophy/Bibleberry/pull/49) | Platform-neutral async-capable participation contract and isolated reload pilot; no native persistence or cross-device accounts proven |
| Ordinary Challenge route A4.1 | [PR #50](https://github.com/ContraPhilosophy/Bibleberry/pull/50) | Controlled ordinary-reader CMS Challenge route using the shared player; not full live Today/Archive discovery |
| Secure release gateway core | [PR #52](https://github.com/ContraPhilosophy/Bibleberry/pull/52) | Server-authoritative release authorization, filtered catalog/detail API, reader-safe projection, neutral unreleased/not-found responses |
| Gateway detail reader | [PR #53](https://github.com/ContraPhilosophy/Bibleberry/pull/53) | Gateway-backed Challenge detail provider for the controlled route; server clock governs release |
| Released catalog provider | [PR #54](https://github.com/ContraPhilosophy/Bibleberry/pull/54) | Validated, gateway-only lightweight discovery contract with catalog-to-detail canonical document identity checking; no complete Hub/Archive UI integration |
| Cloudflare staging Worker runtime | [PR #55](https://github.com/ContraPhilosophy/Bibleberry/pull/55) | Worker entry point, static assets routing, separate `wrangler.staging.jsonc`, offline-capable gateway unit tests, genuine build-asset Wrangler dry-run in CI, and guarded deployment/acceptance runbook. **Merged November 7 (Eastern), not deployed** |
| Archive / Library / Field Notebook decisions | [PR #51](https://github.com/ContraPhilosophy/Bibleberry/pull/51) | **Merged November 7**, replacing its earlier draft status. Product documentation only; no Notebook or navigation implementation authorized |

**CI evidence:** For PR #55 head `630b2b51bf46ccdcf9591b69802c20c3c6d7b515`, [GitHub Actions run 42428560058](https://github.com/ContraPhilosophy/Bibleberry/actions/runs/42428560058) completed successfully with all four jobs green: Studio; reader build/lint/Playwright smoke; CMS adapters; and release gateway. The reader build job includes **`npm run check:staging` after building actual `dist/` assets**, not inside routine unit tests. This was verified on the PR head before merge, not independently rerun against the merge commit or deployed Cloudflare runtime.

### What is implemented versus what is still unproven

- **Implemented on `main`:** secure gateway logic, Worker runtime and staging configuration, controlled CMS-backed ordinary Challenge detail route, validated released-catalog data provider, and platform-neutral participation foundation.
- **Not yet integrated as a full ordinary discovery experience:** Today/Archive navigation still needs separately scoped wiring to the released catalog. The catalog provider is not equivalent to a complete published-content Hub or Archive experience.
- **Not yet externally demonstrated:** authorized private Sanity → deployed Access-protected staging Worker → time-gated ordinary reader → durable participation, end to end. Existing November 3 Sanity-to-CMS-Lab publication/edit proof remains valid but is a different, earlier test.
- **Sanity Growth decision (Aaron, November 7):** **Sanity Growth is the approved target platform.** The project is currently using its Growth trial, and Aaron intends to purchase paid Growth. **Do not revisit whether to use Growth, redesign for Free-tier limitations, or block engineering work pending purchase.** Subscription payment itself remains Aaron's account action. Dataset inventory/visibility, Viewer token, Cloudflare Access policy and `bibleberry-staging` deployment remain externally unverified. Keep the existing Lab isolated.
- **Do not assume** native iOS/Android persistence, signed-in synchronization, a final seven-format Challenge taxonomy, approved Notebook artwork, or complete production-ready Today/Archive integration.
- **BerryMark:** controlled draft importer [PR #11](https://github.com/ContraPhilosophy/BerryMark/pull/11) is merged; actual authenticated draft write/readback/unchanged-no-op acceptance in a confirmed development dataset remains unverified.

### Next decision gate: R05 Stage 3B, separate authorization required

1. **Proceed on the committed Growth architecture.** The current Growth trial is the working environment; paid Growth is Aaron's chosen continuation. Verify **dataset inventory/visibility and existing Studio/consumer dependencies** to choose a private source: a separate `staging` dataset versus converting existing `production` to private. Stage 3A config provisionally targets `staging`; its existence is unconfirmed. Earlier findings showed `production` was public, but are dated. Do not reopen the Growth purchase decision.
2. **Inspect live Cloudflare configuration** and decide the exact staging hostname, Access self-hosted application and identity policies. CORS is not access control. Any service token must be explicitly allowed by a Service Auth policy if used for automated verification.
3. **Only after Aaron approves the relevant account-level changes:** establish a private content source using the Growth capability, least-privilege Sanity Viewer token, protected separate staging Worker and synthetic/reference-only test records. Do not modify the existing `bibleberry-lab` service or commit credentials. Do not publish confidential future manuscripts until source privacy and continued paid Growth access are actually in effect; this is an operational content-protection gate, not a request to reconsider Growth.
4. **Run staged positive and negative checks:** anonymous Access denial; authenticated static assets and reader; released versus future/unreviewed/nonexistent catalog/detail responses; direct-Sanity source opacity; device-clock independence; no-store behavior; canonical participation identity; failure and rollback.
5. **After staging proof:** separately scope live released-catalog discovery in the ordinary Today/Archive and the full manuscript → editorial → release → reader → participation vertical slice. Do not treat product backlog or product-record merges as coding approval.

---

## November 7, 2026: Field Notebook product-document reconciliation (not an engineering build claim)

The latest Bibleberry **Field Notebook product behaviors** were clarified in [merged PR #51](https://github.com/ContraPhilosophy/Bibleberry/pull/51). Consult the [canonical current/historical/open decision-status map on main](../product/gamification-and-achievements.md#decision-status-at-a-glance--november-7-2026), plus the [November 7 Archive/Hub working notes](../product/2026-11-07-archive-library-and-continue-working-notes.md).

Current direction: historical active Archive capacity is **zero to three months plus current month**; Library Challenges can earn awards without Archive activation; monthly thematic and full-month rewards are **substantive Scripture collectible cards**, not certificates; lifetime completion is **one evolving Notebook status**, not accumulated badges. The year/month Notebook and All Earned Cards grouping are decided. Notification persistence, New indicators, optional announcements, and ordinary finalized-month corrections are also decided. **Some Archive rotation/Hub Continue rules and Alexis's visual review remain open.**

**Authority warning:** The [November 6 decision record](../product/2026-11-06-design-session-record.md), [November 6 A3 handoff](handoffs/2026-11-06-a3-mobile-first.md) and original [Issue #22](https://github.com/ContraPhilosophy/Bibleberry/issues/22) contain accurate *as-of-then* ideas, some superseded. Do not use their older achievements/field-notebook passages to override the November 7 current model. **PR #51 has now merged as product documentation**; its merger does not authorize implementation. This addendum does not re-audit or change the engineering baseline dated below.

## November 6, 2026: end-of-day A3 and native-app-first checkpoint

**Verified GitHub at this scoped check:** Bibleberry main `f2461e4edfdfeff62e2a0578489428b0f8f33a4f`; BerryMark main `d94d5fa01d7b423650527d00f802ee0356362c6f`; **zero open Bibleberry PRs**. A3 branch `feat/46-reader-participation-state` existed at the same SHA as main, so no A3 implementation was yet confirmed remotely. Later branch/PR activity must be rechecked. Bibleberry [A1 PR #42](https://github.com/ContraPhilosophy/Bibleberry/pull/42), [A2 PR #45](https://github.com/ContraPhilosophy/Bibleberry/pull/45), and product docs [#43](https://github.com/ContraPhilosophy/Bibleberry/pull/43)/[#47](https://github.com/ContraPhilosophy/Bibleberry/pull/47) were merged.

**Product clarification from Aaron:** Bibleberry is planned primarily for **installed iOS and Android use**; the hosted web option is supplementary. React/Vite does not imply browser-only delivery. A3 [Issue #46](https://github.com/ContraPhilosophy/Bibleberry/issues/46) now records a platform-neutral, async-capable participation store: browser localStorage is a **web/development adapter**, not an assumed native storage solution. Final native packaging/driver and account synchronization remain separate future decisions. Argon's revised architecture was accepted in principle and a Phase 2 implementation authorization message was prepared; no pushed A3 code or CI evidence existed at this check. Do not confuse that approval with completed implementation.

**Next session:** Start with the [November 6 handoff](handoffs/2026-11-06-a3-mobile-first.md), verify Issue #46, its feature branch and any PR, then review actual pushed code/tests when available. Keep A3 separate from Hub design [#22](https://github.com/ContraPhilosophy/Bibleberry/issues/22), CMS reader integration [#25](https://github.com/ContraPhilosophy/Bibleberry/issues/25), and the later native release-channel decision (R20). The older November 5 inventory below remains dated historical evidence, not a newly re-audited full project inventory.

## November 6, 2026: product-design addendum (not an engineering-status reconciliation)

**Important for new chats and agents:** The engineering inventory and commit/PR snapshots **below** were reviewed as of November 5 and have **not** been re-audited solely by recording this design addendum. Verify live GitHub before treating any work as merged, open, tested or deployed.

A separate November 6 conversation **resolved all five gamification research divergences**, accepted **Biblical Discovery** in place of dedicated weekly WEBP memorization, and refined the Hub, Field Notebook, Special Experiences, and intentional WEBP translation direction. Those changes are preserved in:

- **[Gamification and Achievements](../product/gamification-and-achievements.md):** the November 6 position at the time, **later refined by November 7**. For current behavior see the new decision-status map above; former permanent lifetime badge / generic monthly commemorative concepts are not current design.
- **[Biblical Discovery and Scripture](../product/biblical-discovery-and-scripture.md):** WEBP as a deliberate primary in-app translation, flexible Sunday Biblical Discovery, Argon's 12 candidate approaches, translation-independent reader-owned-Bible explorations as optional concepts, and possible self-directed memorization guidance without an integrated launch memorization engine.
- **[November 6 Design Session](../product/2026-11-06-design-session-record.md):** durable chronology, research inputs, decisions, exact remaining questions and distinctions between approved direction and exploratory ideas.

**Do not assume the historical Sunday memorization pilot has been replaced in code.** Its fixture/tool remains a development prototype unless and until separately scoped implementation is approved. Alexis's ministry-facing review and final Field Notebook artwork are pending. These documents are **product decision records, not implementation authorization**.

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
