# Bibleberry — Product & Application Development Roadmap

> **ONE CANONICAL IMPLEMENTATION ROADMAP — owner-approved direction, November 9, 2026**  
> **Last planning reconciliation:** November 9, 2026; engineering verification checkpoint: November 8 R05 Stage 3C accepted  
> **Status:** Prioritized cross-system build order and dependency plan; **not** a blanket authorization to implement, deploy, publish, change accounts, or merge a PR  
> **Owner:** Aaron Waid (product, engineering scope, infrastructure and merge/release decisions); Alexis Waid (substantive theological teaching and appropriate editorial review)  
> **Next recommended scoped assignment:** **R08A-0 — Monthly Publication, Series Identity, and Release Contract Design**, a design/contract deliverable rather than a broad code change. Aaron separately authorizes its execution.

## 0. How to use this roadmap — one source of implementation order

**This file is the single authoritative sequencing and dependency roadmap for Bibleberry.** There is no parallel active CMS build roadmap or reader-experience build roadmap. Amend **this file** by an approved PR when priorities change; use Git history and dated records for earlier sequencing. Older Issue bodies, reports, archived roadmaps and chat handoffs do not independently establish a competing queue of work.

Different documents have different authority:

| Question | Authoritative document or evidence |
| --- | --- |
| What reader behavior has been approved? | [November 8 approved reader experience](2026-11-08-approved-reader-experience-and-month-screen.md) and subsequent explicit Aaron decisions |
| What editorial content, CMS workflows, and models are planned? | [November 9 CMS content and publishing architecture](../architecture/content-management-and-publishing.md), including its 80-decision register |
| **Which work comes first, and what depends on what?** | **This roadmap alone** |
| What is implemented, deployed, or independently verified? | [Current Project Status](../project/current-status.md), current GitHub commits, accepted Issue/PR evidence and relevant service checks |
| What may an AI agent actually modify? | [AI Development Protocol](../ai-development-protocol.md) plus an **explicitly authorized, scoped** assignment Issue and branch/PR |

The CMS architecture document retains its original **Phase A–G** planning discussion as historical design rationale; that sequence is **not a second executable roadmap**. Its approved editorial requirements remain applicable. The November 8 reader document governs its domain when older texts conflict. This roadmap controls implementation order, **not** substantive theology or a unilateral reduction of approved product behavior.

Existing **R01–R21** workstream IDs and **R08A** are retained below for continuity. A phase is a dependency grouping, **not** a giant PR, a fixed release promise, or a ban on sensible parallel tracks. A proposed stage may be split into multiple narrowly scoped assignments. Scope any early beta or feature deferral explicitly with Aaron; phase placement alone does not authorize omissions.

## 1. Product operating model and non-negotiable boundaries

Bibleberry is a free, ministry-first biblical formation app for **installed iOS and Android**, with hosted web supplementary. Alexis's substantial teaching and editorial integrity lead; reader participation and collectible systems serve that teaching, never dictate its length, format, topic or pace.

- **Editors operate ordinary publishing without code changes.** Aaron and Alexis prepare, review, preview, schedule and publish monthly Challenges, introductions, finished Scripture Cards, News, Special Experiences, instructional content and resources through Sanity. A genuinely new interaction type may need engineering.
- **Exactly two allowed Sanity Growth datasets:** `production` (actual editorial content) and `staging` (private synthetic development/testing). The former `berrymark-development` dataset was deliberately removed; **do not recreate it** or add any third dataset without a new explicit budget/architecture decision. Existing BerryMark write protections must be adapted intentionally, not casually disabled.
- **Clear authority split:** BerryMark prepares supported teaching and metadata; Sanity is authoritative for editorial content and approval after import; the private **Cloudflare gateway/backend** authorizes preview, embargo, withdrawal and release; the app renders reader content; the separate reader participation/account system stores personal state. No private reader records belong in Sanity.
- **Controlled publication:** Sanity-published is not the same as reader-released. Future Challenge manuscripts and hidden monthly discovery answer keys must not leak through APIs, client bundles, assets, search or cache. A sanitized future-title/preview feed is distinct from a released-teaching feed.
- **Reader-local calendar dates:** approved monthly release is tied to the reader's local date with server-authoritative trust rules. Existing R05 gateway checks fixed UTC `releaseAt`; timezone/travel/offline behavior is a **new contract**, not an accomplished implementation. Do not trust a changeable device clock or arbitrary caller-supplied offset as access authority.
- **Permanent participation:** distinct Challenge completions, saved Scripture, earned-card identities and credible earned dates remain independent of transient UI and editable CMS documents. `Finish` (not viewing the last screen) records Challenge completion; idempotent awards must survive account merges and historical reading.
- **Accessibility and device reach:** preserve meaningful text for finished graphic cards, robust navigation and large text, and low-end Android performance. Do not shorten Alexis's material to satisfy card or screen limits.
- **Change control:** separate narrowly scoped branches and PRs, review/tests, explicit Aaron merge/deploy approvals; no unrelated service mutations or production content writes.

## 2. Verified baseline — separate accepted evidence from remaining work

**Checked code baseline:** Bibleberry `main` `343b7523155e0850558ca05a66b117ea41bbfcc8`; BerryMark `main` `d94d5fa01d7b423650527d00f802ee0356362c6f` (November 8 checkpoint). New sessions must verify current refs, branches and PRs.

**Accepted R05 integration evidence:** [R05 Stage 3B #62](https://github.com/ContraPhilosophy/Bibleberry/issues/62) and [Stage 3C #63](https://github.com/ContraPhilosophy/Bibleberry/issues/63) **PASSED and closed November 8**. The private, Cloudflare Access-protected staging Worker served a released synthetic Sanity Challenge through the same-origin gateway to the ordinary, feature-gated Challenge reader; future Fixture B rendered neutral unavailable content; approved comparison/optional study blocks rendered; save and explicit completion survived browser reload. The confirmed deployed version was `e73541b9-c353-404b-8d41-dfdff5ced3bb`. This staging proof **must not be re-scoped as unperformed work**.

Other established foundations include the shared CMS Challenge player, structured Sanity adapters, released-catalog provider, platform-neutral async participation state, nine existing content block codes and BerryMark's **historically successful** authenticated development-dataset importer acceptance. The obsolete BerryMark test dataset is removed; production ingestion and adaptation to `staging` remain separate safe work.

**Not yet demonstrated:** full ordinary Hub/Month/Shelf/Library released-content discovery; first-class monthly editorial organizer; approved future-title preview and reader-local release policy; all seven format contracts; CMS Cards/News/events; earned-card service/Notebook; native persistence and real account sync; complete ministry editorial publishing rehearsal; public launch readiness. Do not mistake a prototype, test fixture or written design for one of these features.

The [Current Project Status](../project/current-status.md) and exact merged Issues/PRs preserve detailed evidence; avoid copying a second constantly drifting inventory into this roadmap.

## 3. Authoritative dependency-based implementation phases

### Phase 01 — Shared architecture contracts: R08A-0

**Objective:** Establish one common content identity, release, participation and visibility model before expanding CMS schemas or constructing calendar APIs.

**First proposed assignment — R08A-0, design/contract only:**
1. Inventory actual `challenge`, `challengeSeries`, BerryMark importer, `production`/`staging` configuration, gateway catalog/detail, and stable completion IDs. No mutations in this assignment.
2. Choose the single **calendar-month roster authority**, provisionally `monthlyPublication` with stable `YYYY-MM` identity; reconcile it explicitly with existing thematic `challengeSeries` and importer series lookups. Do not establish two competing membership sources.
3. Define date-slot identity, Challenge relationship and stable IDs, finalization and later correction/rescheduling impacts without retroactive loss of legitimately earned awards.
4. Specify a server-enforced reader-local release policy (timezone provenance, travel, DST, clock manipulation, first-time readers, guest users, offline cache) and migration from UTC `releaseAt` semantics.
5. Define **two reader-safe disclosure contracts**: approved month preview (preceding 28th / Feb 27: theme, intro subset, future titles and dates) versus active/historical month (calendar, eligible Challenges, visible discovery titles/progress). Future bodies, hidden card art and qualifying Challenge IDs never appear in unauthorized client data.
6. Align reader-specific completion/award IDs and record ownership; explicitly reserve space for signed-in merge rules and account-bound storage without requiring those implementations in this contract assignment.
7. Identify migration tests, rollout strategy, negative embargo cases and narrow subsequent GitHub assignments. Record confirmed actual staging environment/evidence, not unsupported assumptions.

**Acceptance:** One reviewed schema and API contract, source-of-truth/identity diagram, release test matrix, migration/rollout strategy and a list of small implementation PRs. **No implementation** is implied by accepting this design.

**Parallel design:** Account/native identity requirements (R13/R20), seven daily format taxonomy (R04/R10), and Field Notebook visual prototypes can progress without modifying the gateway.

### Phase 02 — Monthly Publishing foundation (Sanity + controlled authoring)

**Objective:** Make a complete month an editable, verifiable editorial unit without forcing content changes through an app rebuild.

**Scope:** Minimal `monthlyPublication` and associated introduction/roster schemas; date slots, uniqueness, stable references, finalized roster; Studio review and scheduling workflow; compatibility with existing `challenge`/`challengeSeries` and CB1–CB9; existing source fidelity and rights checks; controlled BerryMark-to-`staging` test path, plus an intentional safe production draft path or direct Sanity authoring. Add enough editorial validation to detect missing/duplicate dates, wrong relations, unsupported content and false approval attribution. Use **only** the permitted datasets.

**Acceptance:** On private staging, prepare representative 30-, 31-, and February-month fixtures, review assigned Challenges, inspect truthful preview/readiness and finalize the roster without publishing embargoed material to an unauthorized channel. Test an ordinary postapproval typo edit without altering completion identity. A custom polished dashboard can improve later; safe manual Studio workflow is acceptable first.

**Dependencies:** Phase 01 authority, stable identities, privacy and review contracts. BerryMark expansion beyond supported authored teaching is *incremental*, not a launch prerequisite.

### Phase 03 — Secure Month Screen vertical slice (R08A + essential News)

**Objective:** Deliver the first substantial connected reader experience using the approved calendar on current **and historical** months.

**Scope:** Extend the proven R05 gateway with sanitized month/preview projection, current/historical Month Screen calendar states and navigation into the ordinary Challenge reader, origin-aware Finish return, month completion ticker, correctly timed introduction/Welcome/replay, and **only the News schema/feed needed for the recurring next-month preview**. Provide a minimal way to navigate into historical Month Screens; the polished Library/Shelf UX follows later.

**Acceptance:** A reader sees all month Challenge titles and which are completed/available/Coming Soon; cannot access future teaching; Feb 27 and ordinary preceding-28th preview show permitted material without premature Welcome or discovery goals; month start unlocks Welcome and eligible discovery titles; historical-first-time and preview-return intro paths work; finishing returns to origin and updates state silently. Secure negative tests cover direct slug guesses, search/cache/asset leakage, timezone changes, unpublished content and server fallback.

**Dependency warning:** Do **not** wait for an elaborate full News system to support monthly previews, but do not omit the preview-News link from this vertical slice.

### Phase 04 — Discoveries, Scripture Cards and lasting collections

**Objective:** Connect the author's month definitions to permanent, earned-only reader accomplishments.

**Scope:** CMS `scriptureCard` graphic-first model with accessible transcription/search metadata; month-owned `monthlyDiscovery` thematic qualifying rules and finalized-roster full-month rule; server-safe hidden mappings; idempotent award identity and credible earned date; earned thumb/full-card viewer and share-image attribution; Field Notebook year/month and All Earned Cards; distinct combined **Hub-only** card announcements and New markers, with presentation opt-out semantics. Preserve cards earned from historical Library work. The CMS plan additionally defines **permanently earnable tutorial/Foundation cards**, distinct from time-limited Special Experience eligibility; reconcile the earned-only collection grouping and label before user-facing implementation.

**Acceptance:** One Challenge may count toward several discoveries; completing all finalized month Challenges guarantees all thematic plus full-month card; unrewarded art and qualifying locations never leak; duplicate Finish/offline/account merges do not duplicate awards; earned date is preserved; Month Screen updates progress silently; announcements occur **on Hub arrival only**; no new card is revoked by ordinary editorial corrections.

**Dependency:** Phase 01 record contract and Phase 02 finalized roster. Account-sync foundation must be designed concurrently, and genuine multi-device permanence cannot be promised until R13 acceptance.

### Phase 05 — Coherent navigation and personal reading experience

**Objective:** Complete the connected reader environment rather than six independent screens.

**Scope:** Hub teaching-first hierarchy; one unobtrusive Continue suggestion; properly connected current and historical Month Screens; historical **Shelf (0–3)** with protected reader-selected months and limited auto-admission; always-accessible **Library** and origin-aware return; personal Saved Scripture; optional accounts and automatic guest-to-account merges; first-use and replayable onboarding; applicable Foundation content and award presentation. The **Hub** is where combined earned-card announcements surface, never a permanent achievement backlog.

**Acceptance:** Completed old-month Challenges earn identically via Shelf/Library; putting away Shelf months never erases content/progress; a completed or interrupted Challenge resumes appropriately; account merge retains distinct completions, dates, Scripture and existing account's Shelf choices on conflict; no hidden drafts appear on browsing routes; new readers can begin teaching promptly; navigation works accessibly on actual devices.

**Parallelization:** Auth/native storage and account security (R13/R20), stable deep links (R12), and Saved Scripture (R09) should start their contract work earlier than this phase; do not serially postpone prerequisite security or durable-state work merely because complete UX integration is listed here.

### Phase 06 — Expanded editorial systems and operational release

**Objective:** Make the complete ongoing ministry operation sustainable while preserving reader and deployment safety.

**Scope:** Finish standalone News archive, resources/Foundations, Hub editorial slots, ministry pages, in-app notices and searchable reader-eligible content; editorial notification authoring and **separate** audience/preference/permission/delivery/cancel infrastructure; reusable time-limited Special Experience CMS/eligibility/session framework when authorized; Studio monthly readiness/preview ergonomics; monitoring/backup/restore, native app packaging and release qualification.

**Acceptance:** Editors can prepare ordinary new content without code changes; future releases require no daily Sanity mutations; dependent unsent notifications cancel or reschedule safely; withdrawn content is suppressed; backups include Sanity documents **and media** separately from private reader records; accessible graphics and low-end Android remain usable; a full content-to-reader-to-award flow is rehearsed before public release.

**Scope guard:** Specific Special Experience campaigns are **not automatically authorized** by an architecture for events. Full push delivery depends on native channel and explicit launch scope. Production/launch sequencing and any beta omissions require a distinct Aaron decision.

## 4. Cross-phase parallel requirements (not a postponed backlog)

| Track | Required work across phases |
| --- | --- |
| **CMS/editorial** | Independent artwork and theological review; Studio ergonomics and preview; safe import/direct draft choices; monthly publishing rehearsal |
| **R04/R10 formats** | Reconcile all seven Challenge experiences and format-specific Finish semantics; keep optional study truly optional and preserve CB1–CB9 |
| **R07/R13 continuity** | Canonical distinct IDs, async/native storage, guest-account merge, user authorization, earned-date reconciliation and minimal data collection |
| **R16–R18 engineering** | CI/lint/regression, protected staging and rollback, privacy/release negative tests; reuse verified staging, don't start R05 over |
| **R19/R21 devices** | Accessible images, screen readers, real older/budget Android performance, network/interruption recovery |
| **R20 release** | Production permissions, credentials, native iOS/Android choices, deployment/incident runbook, backups and recovery |
| **Editorial communications** | Minimal monthly preview-News **early**; full News/push later after safe content link and reader destination contracts |

## 5. Legacy workstream index — preserved identifiers, not a second priority order

The IDs below retain Issue and documentation traceability; **Phase 01–06 above determines implementation order**. Existing Issues may contain dated, superseded terminology and must be reconciled with current product authority before coding.

| ID | Workstream | Active alignment |
| --- | --- | --- |
| **R01** | BerryMark → Sanity draft import acceptance | Historical dev-dataset live tests accepted; current two-dataset/production pathway Phases 01–02 |
| **R02** | Live Sanity-to-reader integration | Nov 3 local proof; extended by accepted R05 staging evidence; Phases 02–03 |
| **R03** | Ordinary CMS Challenge player integration | Controlled route demonstrated in staging #63; full navigation/discovery Phases 03–05 |
| **R04** | Unified Challenge content contract | Phases 01–02, incremental formats cross-phase |
| **R05** | Server-enforced content release | Secure gateway and staging proof **accepted #62/#63**; new local-day/preview contract Phases 01–03 |
| **R06** | Hub and whole-app information architecture | Phases 03–05 |
| **R07** | Durable distinct reader progress | Foundation exists; phase-spanning state and award integration |
| **R08** | Shelf, Library, Field Notebook and personal collections | Phases 04–05 |
| **R08A** | Month Screen and monthly welcome | R08A-0 first; Phases 01–04 |
| **R09** | App-wide Saved Scripture | Phase 05; contracts earlier |
| **R10** | First-class formats and Biblical Discovery | Contracts Phases 01–02; incremental implementation cross-phase |
| **R11** | Ministry News/What's New | **Minimal preview News Phase 03**; full feed Phase 06 |
| **R12** | Deep links and replayable onboarding | Phases 03 and 05; destinations before push |
| **R13** | Optional accounts and cross-device sync | Early data contract; Phase 05 experience and launch qualification |
| **R14** | Nonpunitive discoveries, cards, permanent awards | Phase 04 and final integration |
| **R15** | Real device reminders/notifications | Phase 06, after platform/permissions and safe destination contracts |
| **R16** | ESLint and CI enforcement | Parallel enabling track |
| **R17** | Automated reader regression | Parallel enabling track, add tests each slice |
| **R18** | Protected environments, access and rollback | Proven staging foundation; parallel operations |
| **R19** | Mobile accessibility/usability validation | Parallel design/testing and launch gate |
| **R20** | Release engineering, native packaging and operations | Start architecture early; production launch gate |
| **R21** | Low-end Android inclusive performance | Parallel measurable baseline and launch gate |

The additional CMS models (monthly publication, graphic-first cards, discoveries, introductions, News, resources, events, tutorials, notices, editorial notifications and ministry pages) are governed by the [November 9 content architecture](../architecture/content-management-and-publishing.md), **not independent competing workstream numbers**.

## 6. The first engineering handoff to prepare after this roadmap is merged

**Candidate assignment:** `R08A-0 — Monthly Publication, Series Identity, and Release Contract Design`  
**Type:** read-only/source review and technical specification; no source edits, migration, schemas or deployment under the initial assignment without a separate authorization.  
**Inputs:** [November 8 approved reader experience](2026-11-08-approved-reader-experience-and-month-screen.md), [November 9 CMS content architecture](../architecture/content-management-and-publishing.md), [R05 gateway architecture](../architecture/r05-release-gateway.md), existing `challenge`/`challengeSeries` schema, BerryMark import contracts, [Issue #61](https://github.com/ContraPhilosophy/Bibleberry/issues/61), and accepted R05 staging evidence [#62](https://github.com/ContraPhilosophy/Bibleberry/issues/62)/[#63](https://github.com/ContraPhilosophy/Bibleberry/issues/63).

**Deliverable:** one proposed month/series/source-of-truth and migration contract; local-day release and future-title security policy; example sanitized API payloads; tests; staged narrow assignment breakdown and acceptance criteria.

**No implicit approval:** Accepting this roadmap and the linked CMS plan is **documentation/product planning authority only**. Aaron assigns individual engineering scopes and approves every merge/deployment.

## 7. Change history and maintenance

- **November 9, 2026:** Aaron selected the integrated **six-phase** reader + CMS dependency order as the project's new guidance; kept the existing roadmap path canonical, incorporated 80 CMS content decisions through a supporting specification, and identified R08A-0 contract work first. Reconciled November 8 Stage 3C staging success so already completed integration is not reissued.
- **November 8, 2026:** The [approved reader-experience specification](2026-11-08-approved-reader-experience-and-month-screen.md) introduced the calendar Month Screen, Shelf/Library terminology, hybrid Monthly Discoveries, Hub-only earned-card announcements and monthly preview/welcome.
- **November 5, 2026:** Initial multi-workstream roadmap and engineering inventory were established. Their old priority grouping and "next milestone" language are now **superseded**, not a parallel plan; Git history preserves the original.

**Maintenance rule:** After an accepted milestone, update [Current Project Status](../project/current-status.md) with dated evidence. Change sequencing only in this canonical roadmap by reviewed PR. Older completed milestones retain their exact dated acceptance in Issues/PRs; don't rewrite history as though they never occurred.
