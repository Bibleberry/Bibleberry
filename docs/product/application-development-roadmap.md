# Bibleberry — Product & Application Development Roadmap

**Established:** November 5, 2026  
**Status:** Product-wide planning and architectural reference; NOT an implementation authorization or an approved launch-feature contract  
**Technical/product decision-maker:** Aaron Waid  
**Theological/editorial and relevant visual authority:** Alexis Waid  
**Tracking Issue:** [#34 — Product & Application Development Roadmap](https://github.com/ContraPhilosophy/Bibleberry/issues/34)  
**Companion:** [#20 — Engineering Maturity Roadmap](https://github.com/ContraPhilosophy/Bibleberry/issues/20)  
**Planning target:** January 1, 2027, subject to approved release scope and demonstrated readiness  
**Baseline:** Bibleberry `main` at `a0a7758ce0d10175ad7fc5c573035456c8218136`; BerryMark `main` at `bc1862b5d1ffd487e9f90725f495157a59070ca4`.

> **How to use this document:** It preserves the November 5 product/engineering audit and proposes sequencing across the application. It explains each work area in both development terminology and everyday language. It does **not** replace existing Issue specifications, confer approval on open design questions, or authorize an agent to build all listed features. Before taking up an item, check current code, newer merged PRs, the relevant Issue, and Aaron's explicit assignment. Keep this file as a durable map; track execution and evidence through scoped Issues, PRs and the existing GitHub Project.
>
> **November 8 governing approval:** [Approved Reader Experience, Month Screen & Field Notebook](2026-11-08-approved-reader-experience-and-month-screen.md) is **Aaron's current authoritative product direction**, overriding older proposals and this roadmap where they conflict. **The Month Screen is a required new product component**, described below at R08A; preview/welcome, Shelf/Library, discovery and Hub-announcement behavior are approved. This update does not establish completed implementation or authorize unscheduled engineering work.
>
> **November 7 historical Field Notebook clarification:** Refer to the [current/historical/open decision-status map](gamification-and-achievements.md#decision-status-at-a-glance--november-7-2026). The [November 6 discussion](2026-11-06-design-session-record.md) and original [Issue #22](https://github.com/ContraPhilosophy/Bibleberry/issues/22) are historical inputs where they conflict with the latest model; do not infer current requirements from earlier lifetime badge, generic monthly commemorative, or release-date-sequence proposals.

## 1. Product vision and governing boundaries

Bibleberry is the working name for a mobile-first Christian biblical-formation application led by Alexis Waid's substantive biblical teaching. It should deliver carefully authored, flexible **Challenges**, not simply present daily devotional text in a conventional reader. The broader ministry includes Realigned; Spiritually Hungry is the business entity.

**Installed-app-first channel decision (Aaron, November 6):** The primary intended experience is an **installed iOS/Android app**, with a hosted web version available as an additional channel. React/TypeScript/Vite is the shared UI implementation, not a browser-first product promise. Choose the eventual native packaging and persistence technology deliberately; A3 participation storage must remain platform-neutral and async-capable. See [Issue #46](https://github.com/ContraPhilosophy/Bibleberry/issues/46) and [the November 6 handoff](../project/handoffs/2026-11-06-a3-mobile-first.md).

**Device reach is a product requirement.** Bibleberry must provide a reliable, readable and responsive core experience on inexpensive and older Android phones, including under constrained CPU, memory and network conditions. A high-end iPhone or development laptop is not the acceptance baseline. Design for low-end devices from the beginning, then verify on representative hardware before launch. This cross-cutting decision was approved by Aaron on November 5, 2026; see [R21 / Issue #37](https://github.com/ContraPhilosophy/Bibleberry/issues/37).

**The teaching determines the experience.** The reader, its component registry and its CMS must accommodate the argument Alexis needs to communicate. Do not impose arbitrary lesson length, a fixed number of screens, a mandatory generic devotional template, or limits that force theological content to be shortened. Preserve original manuscripts apart from adaptations, uphold recognizable teaching voice and prayers, and do not invent editorial approvals or theological conclusions.

Every dated daily experience is called a **Challenge**, even when the experience differs from multi-screen biblical teaching. A familiar **seven-day weekly rhythm** can use several formats; do **not** infer that exactly seven distinct technical experience types are approved. **Biblical Discovery** is the selected direction for the previously prototyped Sunday verbatim memorization slot. The final taxonomy and authoring contracts remain open. See [Biblical Discovery and Scripture](biblical-discovery-and-scripture.md).

For an individual Challenge, opening, saving, resuming and completing are distinct reader actions. Optional reflections, deeper study and companion links remain optional. Scripture found anywhere in the app should ultimately be savable into **My Scripture**; that collection is separate from saved Challenges. **WEBP** is the intentionally chosen free-to-use primary in-app Scripture translation; an About explanation is planned. Translation-rights constraints still govern provided passage text and future practice tools. Achievements, if implemented, celebrate participation without punitive attendance streaks, competitive rankings or content gates.

**Division of systems:** Bibleberry owns the reader experience, Sanity Studio schemas and CMS-to-reader delivery. **BerryMark** owns the independently versioned manuscript language, compiler, import planning and controlled Sanity draft ingestion. Maintain separate repositories and scoped assignments. Sanity becomes the editing authority after import.

**Division of authority:** Aaron decides engineering, product scope, infrastructure, merges and releases. Alexis decides theological/editorial correctness and ministry-facing adaptations and visual approvals as applicable. An agent, passing CI, an imported draft, and a published Sanity record do not substitute for those decisions.

## 2. Audit baseline: what actually exists

This is a **dated source-level and GitHub-history audit**, not a newly performed live-device, Sanity-authentication or production runtime test.

| Area | Verified implementation or evidence as of November 5 | What remains |
| --- | --- | --- |
| Ordinary reader | Mobile-first React 19/TypeScript/Vite application; Today, Foundations, Archive, More, existing teaching, local preferences, resume/last-opened history, several formation components | Ordinary Today/Archive still select hardcoded entries; the CMS-backed interactive Challenge experience is not yet the normal reader path |
| Interactive Challenge Lab | Four hardcoded teaching Challenges: Nov 1 (5 screens), Nov 2 (7), Nov 3 (8), Nov 5 (8); screen navigation, explicit completion, saves, optional studies, Scripture, prayer | Promote/reuse suitable production components, without exposing developer mode or incorrectly copying Lab-only state |
| Sanity CMS Lab | Published-perspective read adapter, runtime validation, nine Content Block concepts, CMS Challenge rendering, explicit live/fixture sources, dedicated local saved/completion state. **Nov 3 local live proof passed:** Aaron published, edited, republished and re-read a harmless Sanity Challenge without rebuilding the reader | Ordinary reader integration, editorial-approval schema correction, broader device/host verification and release enforcement |
| Formation prototypes | Guided discipline, worksheet/PDF, phrase-reveal memorization, Foundations and resource library | Make distinct formats first-class ordinary daily Challenges and supply consistent progress and content contracts |
| BerryMark | Language, parser, validator, compiler, import planning, content fingerprints, provenance and controlled create-only development draft importer merged in BerryMark PR #11 | Authenticated write/readback acceptance in a confirmed separate development dataset; faithful Nov 3/Nov 5 adaptations |
| Sanity authoring | Studio schemas, import provenance, live Studio deployment previously verified; existing `production` dataset public, Studio points there | Separate test dataset/token existence not confirmed; editorial workflow, schedule and secure future release boundary |
| Cloudflare protected testing | Stable protected Lab and GitHub PR previews have been deployed and tested in part; tracked in #21; `wrangler.jsonc` is in `main` | Finish outstanding Access/asset/real-device/rollback verification; do not confuse the internal Lab with public production |
| Development checks | Reader build, Studio schema/type/build jobs, CMS adapter/preview tests; protected main and PR workflow | Reader ESLint baseline / lint enforcement #15; reproducible automated browser behavior suite #26 |
| Reader account durability | Account/sync architecture document, working Supabase direction | No confirmed reader account service or cross-device synchronization |
| Product navigation | Existing Today/Foundations/Archive/More; extensive exploratory Hub / My Journey / What's New direction in #22 | Polished coordinated mockups, Alexis's visual review, decisions on names/placement/flow and explicit implementation scope |

### The pivotal finding

**The working capability is ahead of its ordinary-reader integration.** The standard app still primarily draws from `src/data/content.ts` and related local fixtures via `src/App.tsx`. The more capable interactive lesson and CMS rendering live behind the developer-only `InteractiveChallengeLab` route. Their reader-state namespaces are deliberately isolated:

- Ordinary prototype: `bibleberry-prototype-v1`.
- Local Interactive Challenge Lab: `bibleberry-interactive-challenge-lab-v1`.
- Sanity CMS Lab: `bibleberry-sanity-challenge-lab-v1`.

**Recommendation:** Evolve the validated CMS-capable Challenge player into an ordinary reader-facing experience; reuse relevant components and behavior rather than transplanting all Developer Studio tooling. Design one authoritative reader-state model and deliberate migration plan. Do not merge existing test stores by accident.

### An important content-model mismatch to resolve

The ordinary formation entry types are `teaching`, `guidedDiscipline`, `worksheet`, `memorization` (`src/data/formation.ts`). The current Sanity Challenge types are `teaching`, `discipline`, `reflection`, `memorization` (`studio/schemaTypes/documents/challenge.ts`). The interactive teaching Lab is organized primarily by screen and Content Block rather than by this daily-type taxonomy. These implementations are compatible foundations, **not yet one agreed contract for seven daily types**. Decide their relationship and plan extensibility without forcing different experiences into one presentation shape.

## 3. Product north star and next demonstrable milestone

A reader should be able to open Bibleberry, start today's substantial Challenge, work naturally through the appropriate teaching or practice experience, optionally explore deeper material, save any eligible Scripture reference, complete deliberately, close the application, return and continue exploring. Personal progress should eventually follow an opted-in account across devices.

The **next major product milestone** is an **end-to-end vertical slice**:

1. Preserve an original teaching manuscript separately.
2. Adapt it faithfully into BerryMark; validate and compile it.
3. Run import preflight and create exactly one unpublished Sanity draft in an authorized development environment.
4. Inspect the document and provenance; conduct actual editorial review in Sanity, with Alexis's authority respected.
5. Separately authorize safe test publication and reader release through the chosen delivery path.
6. Open the Challenge **in the normal Bibleberry reader**, not only inside Developer Studio; verify screens, blocks, prayers, optional content and Scripture behavior.
7. Save, navigate, resume and complete; reopen and verify the intended stable progress record.
8. Confirm that a new daily Challenge can arrive through editorial operations without editing the React application for that teaching.

Begin the data-path test with a **synthetic, rights-safe, reference-only** Challenge. November 3, *Pray Continually*, and November 5, *God's Will for Our Lives*, are strong subsequent fidelity cases, subject to source comparison and Alexis's review. November 2 is a reference fixture but has an existing Sanity slug/identity collision; don't force-import it.

**This milestone is not already achieved.** Individual layers are working; the missing work is their actual integration and operational verification.

## 4. Prioritized product-development backlog

The following twenty-one work areas describe **capabilities and dependencies**, not twenty-one preauthorized implementation PRs. Priorities are directional. Distinct scoped Issues may cover a portion of an area, and some work can proceed in parallel.

### P0 — Connect the manuscript to the actual reader

#### R01. BerryMark → Sanity draft import acceptance
- **Engineering term:** Authenticated importer integration / end-to-end ingestion test.
- **In everyday language:** Submit a prepared teaching file and prove Sanity receives an intact, unpublished draft.
- **Current state:** BerryMark create-only importer implemented and merged; live development-dataset write is not yet confirmed. Development dataset and restricted token require verification.
- **Deliverable / evidence:** Safe synthetic import; correct draft identity, blocks and provenance; readback matches; second unchanged import is a verified **zero-write no-op**; no publication. Afterward review Nov 3 and Nov 5 adaptations against original manuscripts, hardcoded prototypes and actual Sanity documents.
- **Dependencies:** Authorized development dataset and scoped credential; safe fixture. **Owner repository:** BerryMark for importer; Bibleberry for schema/Studio.

#### R02. Live Sanity-to-reader integration
- **Engineering term:** CMS read-path integration and acceptance testing.
- **In everyday language:** Make a safe change in Sanity and observe the correct change in Bibleberry, without recoding that day's teaching.
- **Current state:** Read adapter and CMS Lab renderer are merged. **B3's core unmocked local browser proof passed November 3:** a harmless, Aaron-approved test Challenge was published to the public Sanity `production` dataset, rendered in the CMS Lab, edited, republished and reloaded without rebuilding. Sanity CORS for `http://localhost:3000` was configured with credentials disabled. This does **not** prove ordinary-reader integration or release security.
- **Deliverable / evidence:** **Core local proof complete.** Remaining scope: clarify truthful Aaron-or-Alexis editorial approval attribution in Studio, verify any desired protected host/device behavior, and promote validated CMS Challenges into ordinary Today/Archive through a separate approved implementation. Preserve live/fixture isolation and honest errors.
- **Dependencies:** Safe Sanity content path and authorized test configuration. See [#25](https://github.com/ContraPhilosophy/Bibleberry/issues/25).

#### R03. Production Challenge player integration
- **Engineering term:** Component extraction, reader-route integration and state wiring.
- **In everyday language:** Move the interactive teaching experience from the test lab into the application people actually use.
- **Current state:** Both local and CMS Challenge players work in developer-only routes. Normal Today/Archive still use older hardcoded teaching paths.
- **Deliverable / evidence:** Ordinary Today and Archive open the approved CMS-backed player; readers navigate screens, revisit optional studies, save references, resume and explicitly complete. No developer controls in normal bundles and no behavior regressions. Reuse existing renderer and visual components rather than duplicating them.
- **Dependencies:** R02; align stable Challenge identity and R07 state rules before persisting user progress. Preserve Alexis's teaching and the existing look pending visual review.

#### R04. Unified Challenge content contract
- **Engineering term:** Domain-model reconciliation / schema evolution.
- **In everyday language:** Teaching, prayer disciplines, worksheets and memorization should all count as daily Challenges while allowing each to work differently.
- **Current state:** Four ordinary formation types, four Sanity types and nine within-teaching CB codes are present; the intended seven experience types are not yet one finalized technical model.
- **Deliverable / evidence:** Document agreed daily-type taxonomy, shared metadata and identity, per-type presentation/interaction requirements and CMS/BerryMark support plan. Add formats incrementally; avoid arbitrary screen or word limits.
- **Dependencies:** Product and editorial decisions; R03/R10; schema changes coordinated across repositories. **Do not rename or recycle BerryMark's CB1–CB9 registry codes.**

#### R05. Secure server-enforced scheduled release
- **Engineering term:** Content-delivery authorization and release-time enforcement.
- **In everyday language:** Keep roughly a month of finished teaching ready while readers receive each Challenge only on its intended date.
- **Current state:** Direct published-perspective Sanity query is reader-side, public dataset based and **not a secure embargo mechanism**. Private Sanity dataset plus server-side Cloudflare Worker is a proposed direction, not an approved implemented pipeline.
- **Deliverable / evidence:** Approved source-of-truth for scheduled availability, server-side access control, tested timezone/release edge cases and safe missing-content behavior. Preserve distinct states: validated → import eligible → Sanity draft → editorially approved → Sanity published → reader released.
- **Dependencies:** Paid/private dataset decisions, release architecture, R02 and R03. Operational target: ~30 days queued; desired minimum ~14 days, with below 14 an editorial warning rather than an app blockade. See [#25](https://github.com/ContraPhilosophy/Bibleberry/issues/25).

### P1 — Build the intended ordinary-reader experience

#### R06. Hub and information architecture
- **Engineering term:** Information architecture (IA), UX flows and navigation architecture.
- **In everyday language:** Decide what opening Bibleberry feels like and make starting or resuming a Challenge immediately obvious.
- **Current state:** [#22](https://github.com/ContraPhilosophy/Bibleberry/issues/22) preserves earlier exploratory direction, **not approved mockups**. The November 6 decision clarifies **Hub = discovery**, where readers can find current Challenges, Latest from Bibleberry and useful videos/formation resources. The **Challenge reader**, not the Hub, is the focused distraction-free learning environment.
- **Deliverable / evidence:** Coordinated polished mobile mockups; deliberate global navigation and new/returning reader behavior; no loss of Archive or Foundations. Provide a persistent **Field Notebook** entry in the Hub that may display a temporary **“New Discoveries”** overlay when a newly earned item awaits viewing, cleared by opening the Notebook; no permanent progress dashboard on the Hub. Content discovery should be tasteful and ministry/resource-focused, not personal promotion. Exact layout, other personal-area naming and Alexis's visual approval remain open.
- **Dependencies:** Aaron's product decisions and Alexis's visual review before implementation.

#### R07. Unified reader progress and saved-state model
- **Engineering term:** Unified reader state, durable completion records and stable-identity migration.
- **In everyday language:** The app consistently knows what you opened, saved, started, completed and where you left off.
- **Current state:** Separate, intentionally isolated local prototype, interactive Lab and CMS Lab state; the ordinary Journey is largely an activity-open history.
- **Deliverable / evidence:** One authoritative record model for position, distinct completed Challenge IDs, saved Challenges, saved Scripture and last-opened history; test distinct actions and repeat visits; explicit safe transition from development stores rather than casual namespace merging. Store technical timestamps only where justified for safety or an approved feature, not a comprehensive behavioral diary.
- **Dependencies:** R03 content identities; design in coordination with R13 future cloud records.

#### R08. Personal exploration area and collections
- **Engineering term:** My Journey/library IA and aggregated reader views.
- **In everyday language:** A place to explore saved Scripture, completed Challenges, Foundations, Archive, spiritual disciplines and the reader's personal history; the **Field Notebook** holds progress and earned collectibles.
- **Current state:** Parts already exist, but across separate views and Lab collections; the current Journey page is a limited browser activity log.
- **Deliverable / evidence:** Clear destinations and accessible empty states using **authoritative** data; no invented progress counts or shadow achievement stores. Keep achievement details *inside* the Field Notebook: one evolving lifetime participation status (not a ladder of collectible lifetime badges), substantive Scripture discovery and full-month cards, and an earned-only Special Experiences category hidden before the first event card. The **Month Screen**, not the earned-card gallery, shows monthly discovery **titles and numeric progress** from participation; unearned artwork, text and qualifying Challenge locations stay hidden. Earned illustrated badge taps open the card. The full-month completion goal sits last. The label “My Journey” for the broader personal area remains provisional; **Shelf** and **Library** are approved labels. Overall global navigation remains deferred.
- **Dependencies:** R06, R07, R09, R10; some achievement views later depend on R14.

#### R08A. Month Screen, Monthly Discoveries and monthly welcome (NEW approved product component; [Issue #61](https://github.com/ContraPhilosophy/Bibleberry/issues/61))
- **Engineering term:** Publication-month route and calendar UI; released/embargoed Challenge metadata; progress aggregation, discovery presentation and per-month introduction state.
- **In everyday language:** A month has one familiar screen, current or historical, with a **calendar** of what is finished, available or coming soon, plus progress toward cards below.
- **Current state:** **New product requirement approved by Aaron November 8; not yet built or evidenced by existing prototypes.** See the [authoritative spec](2026-11-08-approved-reader-experience-and-month-screen.md).
- **Deliverable / evidence:** Calendar-based Month Screen with **all 30/31 Challenge titles visible in advance**, safely gated unreleased content, completion count, Monthly Discoveries **below** the calendar, and **full-month reward last**. Unearned discovery = title/progress only, untappable; earned = illustrated badge opening the full Scripture card. Challenge **Finish** returns to its origin and updates the month ticker silently; pending card announcements wait for Hub. The same screen is accessible for historical months from Shelf or Library.
- **Monthly introduction:** On the preceding **28th / February 27**, publish a preview as a ministry news item, with the teaching introduction but no discovery goals and no future Challenge content. Its final **Welcome to [Theme]** screen is available only after month start. Readers who saw the preview can **Skip to Welcome**; first-time historical-month visitors see the intro once. Include a permanent replay link on Month Screen.
- **Deferred UX:** Traditional grid vs roomier week layout, exact introduction page count, card/badge artwork and global tab navigation. These are **not** reasons to replace the calendar requirement with a list.
- **Dependencies:** R03–R05 content/release authority, R06 information architecture, R07 completion state, R11 editorial news, R14 collectible definitions, R21 low-end Android/a11y testing. Technical work needs its own approved scope.

#### R09. App-wide Scripture saving and optional future memorization guidance
- **Engineering term:** Reference-based personal Scripture collection and translation-aware metadata; optionally guided practices later.
- **In everyday language:** Save a Scripture reference from anywhere, find it later, and, if later approved, use Bibleberry to learn how to memorize it in your **own preferred Bible**.
- **Current state:** Labs support reference saving and a test-only WEBP phrase-reveal memorization prototype; the CMS Scripture library does **not** have general memorization practice. The November 6 product decision **does not approve a full memorization app or a weekly WEBP memorization Challenge for launch**.
- **Deliverable / evidence:** Consistent Save/Add to My Scripture controls, stable/deduplicated references, provenance/translation labels where helpful, rights-aware reference-only display, and durable account-bound storage when R13 is implemented. An optional self-directed **“Memorize with Your Bible”** walkthrough and “I learned it!” state are **open scope decisions**, not automatic deliverables. Preserve existing prototypes unless a separate change is approved.
- **Dependencies:** R07, source rights rules, R13 for durable accounts; [Biblical Discovery and Scripture](biblical-discovery-and-scripture.md).

#### R10. First-class formation experience types, including Biblical Discovery
- **Engineering term:** Multi-format Challenge rendering / shared scheduling contract.
- **In everyday language:** Guided discipline, journal/worksheet and **Biblical Discovery** should be viable daily Challenges alongside substantive teaching. The Discovery format replaces the weekly memorization slot in the current product direction.
- **Current state:** Guided Sabbath practice, journal/PDF and a **memorization** tool are functional **development prototypes** outside the CMS-backed ordinary reader workflow. The Sunday Discovery direction is a **new product decision**, not already-built code or an approved production schema.
- **Deliverable / evidence:** Integrate **approved** daily formats into schedule, Archive, completion and content authoring while preserving their natural UX. Discovery may use curated canonical connections, historical lenses, literary architecture, monthly synthesis or an optional reader-in-own-Bible theme trail, only where editorially appropriate; **no fixed four-week rotation** or mandatory external Bible. Preserve source manuscripts and make companion PDF/reflection optional. New specific blocks need separate approval and validation.
- **Dependencies:** R04 content contract, R03 player routing, R07 progress; Alexis's editorial review; [Biblical Discovery and Scripture](biblical-discovery-and-scripture.md).

#### R11. What's New and ministry feed
- **Engineering term:** Editorial content feed, announcements and read-state model.
- **In everyday language:** Readers can discover Alexis's messages, Realigned episodes, resources, new teaching and other ministry updates without a cluttered social feed.
- **Current state:** Hardcoded announcement data; What's New is a design direction, not an implemented CMS feed.
- **Deliverable / evidence:** Editorially manageable entries, verified links, meaningful unread/read acknowledgments and accurate badges. The **upcoming month's preview** is an approved recurring ministry news event on the 28th (Feb 27); see R08A. In-app “3 new” is an unread-item count, **not** a Challenge-progress metric.
- **Dependencies:** R06 IA and editorial feed decision; R13 if cross-device read state is needed.

#### R12. Deep linking and replayable guided onboarding
- **Engineering term:** Routing, deep-link contracts and accessible feature-tour UX.
- **In everyday language:** A shared Challenge link opens the correct place; new users can learn what the app does, and revisit the tutorial later.
- **Current state:** Limited hash-based teaching/entry routes and introductory onboarding exist; the spotlight tour in #22 is exploratory.
- **Deliverable / evidence:** Durable CMS Challenge and relevant destination links, safe unavailable-content fallback, direct notification destinations when eventually supported, and a skip/replay-capable first-run tour aligned to *actually shipped* destinations.
- **Dependencies:** R06/R03/R08, channel and accessibility decisions.

### P2 — Preserve meaningful reader participation over time

#### R13. Optional accounts and cross-device synchronization
- **Engineering term:** Authentication, persistent user data, account authorization and synchronization.
- **In everyday language:** Change phones and find saved Scriptures, completed Challenges and personal accomplishments waiting after sign-in.
- **Current state:** Supabase is the documented working direction, not a functioning integrated account system.
- **Deliverable / evidence:** Optional Google/Apple/email-code sign-in, account-bound records and **automatic guest-to-new-account transfer and guest-device-to-existing-account merge**, preserving distinct completions, saved Scripture, earned cards/dates and resume state. Existing account **Shelf** wins conflicts; never delete underlying guest accomplishments. Per-user authorization, recovery and delete/export/privacy behavior; test two-device, duplicate-award and conflict paths. Public reading should not require an account.
- **Dependencies:** R07 record identities; approved launch scope and [accounts architecture](../architecture/user-accounts-and-sync.md).

#### R14. Nonpunitive achievements and participation history
- **Engineering term:** Achievement eligibility over durable completion records and dated awards (no full event-sourcing requirement).
- **In everyday language:** Readers can see goals, make progress and keep a lasting collection of what they have accomplished.
- **Current state:** November 8 authoritatively refined the Field Notebook and established the **Month Screen** as its companion discovery/progress experience (R08A). Card earning, lifetime status, Library credit, historical access, Finish semantics and **Hub-only** notifications are approved product rules. This is **not implemented or an engineering assignment**; design and technical contracts remain open. Read the [canonical decision-status map](gamification-and-achievements.md#decision-status-at-a-glance--november-7-2026).
- **Deliverable / evidence:** A personally illustrated Field Notebook with a single evolving lifetime participation status derived from **distinct completed Challenges**; permanent substantive Scripture cards for thematic discoveries **and** finalized full-month completion; monthly publication-year browsing and grouped **earned-only** All Earned Cards. The **Month Screen** hosts visible title/progress-only unearned discovery goals and the full-month goal at bottom. Cards reveal artwork only after Finish-based earning; earned illustrations open full cards. Announcements queue exclusively for Hub arrival, combined once; separate Hub New Discoveries and per-card New marker semantics persist. **Special Experiences** remains hidden until the first event card; actual events are not authorized. No timer gates, punitive streaks, content gates, leaderboards or holiness scores. Specific visual assets and engineering contracts still require review.
- **Dependencies:** R07 reliable distinct-completion records, R13 for enduring cross-device collections, monthly editorial definitions and Alexis's design review. Optional actual-day encouragement and *specific Special Event production* are **not** automatically approved engineering scope. See [gamification design record](gamification-and-achievements.md).

#### R15. Actual reminder and notification delivery
- **Engineering term:** Notification permission, scheduling, delivery and target routing.
- **In everyday language:** A daily reminder really arrives, if a reader wants it, and takes them to the relevant Challenge.
- **Current state:** The reader presently saves a reminder preference locally and explicitly does **not** schedule a notification.
- **Deliverable / evidence:** Opt-in permission and delivery behavior appropriate to selected web/native channel, time-zone correctness, direct links, preference controls and device tests.
- **Dependencies:** R12 routing and R20 platform selection; not automatically part of the initial release.

### P0/P1 parallel enabling engineering work

#### R16. ESLint baseline and CI enforcement
- **Engineering term:** Static analysis and required CI lint gate.
- **In everyday language:** Catch common coding mistakes automatically before accepting a change.
- **Current state:** [#15](https://github.com/ContraPhilosophy/Bibleberry/issues/15) approved scope; interrupted Kimi assignment left a branch identical to main; historical 10 errors/1 warning must be re-measured.
- **Deliverable / evidence:** Focused lint corrections, no broad suppressions, passing checks, lint step enforced in required CI and reviewed PR. Appropriate first contained Google Antigravity assignment when Aaron has access to BigMac.

#### R17. Automated reader regression suite
- **Engineering term:** Deterministic browser integration/smoke tests in CI.
- **In everyday language:** Detect when a change breaks navigation, progress, memorization or the separation of test and public builds.
- **Current state:** CMS adapter/schema checks exist; full reader browser behavior automation is not checked into CI.
- **Deliverable / evidence:** Reproducible tests for ordinary navigation, Lab completion/resume, Scripture save/practice, state isolation, and public-build exclusion; actual CI failure on a deliberately broken assertion; maintain manual device checks.
- **Dependencies:** [#26](https://github.com/ContraPhilosophy/Bibleberry/issues/26) scoped and approved, separate implementation kickoff; coordinate CI changes with #15.

#### R18. Protected test hosting and deploy/rollback verification
- **Engineering term:** Preview environments, access controls and deployment operations.
- **In everyday language:** Open a safe live version on a phone, inspect a proposed change, and return to a known-good version when needed.
- **Current state:** [#21](https://github.com/ContraPhilosophy/Bibleberry/issues/21) has already proven a protected stable Cloudflare Lab, PR preview deployments and selected Access/browser checks. **Do not describe it as not started.**
- **Deliverable / evidence:** Remaining denied-user/direct-asset/old-deployment checks as applicable, real-device Lab inspection, reliable preview freshness, repeatable rollback and documentation. Existing website DNS is out of scope.

#### R19. Mobile usability and accessibility verification
- **Engineering term:** Responsive UX QA, keyboard/assistive technology and device acceptance.
- **In everyday language:** Bibleberry should feel comfortable to read and navigate on actual phones, with enlarged text and accessibility tools.
- **Current state:** Responsive and one-off browser assertions previously reported; real iOS/Android and native screen-reader validation not established by those checks.
- **Deliverable / evidence:** Target-device test matrix, actual iPhone/Android/browser testing as supported, VoiceOver/TalkBack or equivalent, focus and keyboard checks, text scaling, long teaching layouts and network failure states.
- **Dependencies:** R03/R06 integrated reader, R17 repeatable regression foundation, and R21 measurable low-end device/performance acceptance.

#### R20. Release engineering and operations
- **Engineering term:** Release-channel decision, production CI/CD, observability, privacy and incident recovery.
- **In everyday language:** Decide how people get Bibleberry, how updates go out, what happens when something fails, and how it is restored.
- **Current state:** Internal Cloudflare Lab and a release runbook **plan** exist. The primary intended delivery is now explicitly **installed iOS/Android**, with hosted web supplementary; the final native packaging technology, store distribution, production rollback rehearsal and initial channel timing remain undecided.
- **Deliverable / evidence:** **Bring the native runtime/packaging choice forward** (e.g. evaluate Capacitor without presuming it has been selected); define iOS/Android signing, store distribution, deep links, native storage integration, app lifecycle and notifications as applicable; then approve hosted-web scope, production deployment/domain, error monitoring, account backup/restore when shipped, incident ownership, privacy, controlled beta and go/no-go evidence.
- **Dependencies:** Approved launch scope, R05 release policy, R13 if account-backed durability is promised, R18/R19 checks **and R21 low-end Android acceptance**. See [release readiness and rollback](../release/release-readiness-and-rollback.md).

#### R21. Low-end Android performance and inclusive delivery
- **Engineering term:** Production performance budgets, constrained-device profiling, network resilience and launch performance acceptance.
- **In everyday language:** Bibleberry's Scripture and substantial daily teaching must run smoothly enough to read, navigate and resume on an inexpensive or older Android phone, not only on flagship devices.
- **Priority and decision:** **P0 launch-quality requirement, approved by Aaron November 5, 2026.** Applies to UX architecture and implementation now, with measured acceptance required before public launch. This is a required outcome, not automatic authorization for broad refactoring or a new framework.
- **Current state:** Mobile-first presentation exists, but no agreed low-end Android device matrix, real-device performance baseline or approved production performance budget has been demonstrated. Do not infer acceptable low-end performance from BigMac or a green CI run.
- **Deliverable / evidence:** Choose representative budget/older Android hardware (including a roughly 2 GB RAM-class device where feasible), confirm browser/OS versions, and supplement real-device checks with CPU and slow-network throttling. Profile a clean production build: initial content readability, transferred and executed JavaScript/CSS, images/fonts, long-Challenge scrolling, navigation, resume/state behavior, input responsiveness, memory constraints where measurable, and slow/interrupted-network recovery. Propose measurable performance thresholds based on those results for Aaron's approval; record pass/fail evidence and any exceptions. Add stable automated budgets where useful but retain actual low-end device testing as a launch gate.
- **Design constraint:** Optimize code splitting, content/media delivery, rendering and optional effects **without shortening Alexis's manuscripts, prayers or substantial teaching**. Keep developer-only tooling outside public builds. Account for large text, reduced motion and accessible controls on constrained hardware.
- **Dependencies:** R03 reader integration, R06 Hub/UX decisions, R17 automated testing, R19 mobile/accessibility QA and R20 release readiness. **Track:** [#37 — low-end Android performance](https://github.com/ContraPhilosophy/Bibleberry/issues/37). Final benchmarks and acceptance criteria require explicit review; no benchmarks or device passes are yet claimed.

## 5. Three coordinated delivery tracks

These tracks can advance together without assigning multiple agents to the same branch.

| Track | Work to concentrate on | Meaningful checkpoint |
| --- | --- | --- |
| **A. Manuscript to reader** | R01 → R02 → R03, with R04/R07 contract work and later R05 release enforcement | A safe, editorially reviewed Challenge arrives in the normal reader from Sanity; readers navigate, save and complete without a code change for the teaching |
| **B. Reader product experience** | R06 mockups and decisions; R08/R09/R10/R11/R12 integration plan | Approved Hub/exploration architecture and production-ready paths for existing teaching, collections and formation experiments |
| **C. Engineering reliability** | R16 #15; R17 #26; R18 #21; R19 mobile/accessibility; **R21 low-end Android performance**; R20 release | Cleaner required CI, repeatable browser tests, trustworthy protected previews and measured budget-device launch acceptance |

R13–R15 become schedulable as their dependencies and approved launch scope are clearer. R05 must be completed before relying on advance publication of actual unreleased approved content. Preserve the distinction between a **safe public CMS demo** and a **production embargo-protected reader feed**.

### Suggested near-term order

1. Verify Sanity's separate development dataset and credential setup, then run the synthetic BerryMark create-only draft acceptance (R01).
2. Treat **November 3's safe live CMS Lab read/render-and-revision proof as completed** (R02 core); finish separately scoped #25 editorial-review labeling and any remaining host/device checks, without repeating that demonstrated milestone.
3. Design the minimal promotion path for the CMS Challenge player, stable identities and progress (R03/R07), then implement in **separately scoped, reviewable PRs**.
4. In parallel, review polished Hub / personal-exploration / What's New mockups under #22 (R06) and determine how existing feature destinations fit.
5. Use Antigravity for scoped #15 lint/CI work (R16), and later implement #26 reader smoke automation (R17).
6. Validate a full vertical slice with synthetic content, then move to Nov 3 / Nov 5 content fidelity and the appropriate human editorial approval.
7. Make and verify the server-side scheduled-release and account/release-channel decisions before the actual features that depend on them.

Do **not** combine BerryMark importer acceptance, lint remediation, Hub redesign and production publishing into one PR.

## 6. Key dependencies and decisions that must stay explicit

**Editorial:** Original manuscript is retained untouched; adaptation is compared for full argument, structure, prayers, Scripture and links. Imported drafts are not approved; publish/release each have independent authorization. Do not fabricate a November 5 cycle `returnCaption` merely to satisfy schema validation; resolve the underlying editorial/contract choice explicitly.

**UI and product:** The Field Notebook should draw on **Alexis's actual illustrated Bible-study notebooks** (screenshots shared November 6), not a generic botanical moodboard; final artwork and comprehensive Hub layout still require her approval. Hub = discovery of Bibleberry resources, Field Notebook = achievements and progress, Challenge reader = focused learning. The working name of the broader personal exploration area remains open. Time-limited Special Experiences are approved **in principle** but no individual event is production-committed.

**State:** Opening, saving, completing, learning Scripture and earning an achievement are distinct events. Avoid deriving permanent identity from display titles or array positions. Do not accidentally mix local Lab fixtures with authentic published content or user accounts.

**Rights:** **WEBP remains Bibleberry's positively chosen free-use primary in-app Scripture translation**; an About explanation is planned. A Scripture reference with no cleared quotation is valid; never invent a quoted passage, pretend practice is configured or turn optional references into mandatory content. Interactive multi-translation memorization is deferred, and guiding someone to use their own Bible must not become a mandatory outside-app step.

**Security/release:** A public Sanity document is queryable independently of browser display logic. CORS is not an authorization control and client-side date filtering is not a secure embargo. Do not put future unreleased confidential content into a publicly readable dataset. Do not copy import write tokens into reader code.

**Content types:** CB1–CB9 in BerryMark are content **blocks within a Challenge**, not the product's seven daily Challenge **experience categories**. Keep these concepts separate.

**Approvals:** Planning priority is not a scope approval. Every engineering assignment should have a bounded Issue, branch, acceptance criteria, tests, PR and Aaron's merge authorization. Alexis's editorial and relevant visual approval remains separate.

## 7. Source-of-truth links for future chats and engineering agents

- **Current reader:** [`src/App.tsx`](../../src/App.tsx); [`src/components/FormationViews.tsx`](../../src/components/FormationViews.tsx); [`src/data/formation.ts`](../../src/data/formation.ts).
- **Interactive Lab:** [`src/components/InteractiveChallengeLab.tsx`](../../src/components/InteractiveChallengeLab.tsx); [`src/data/interactiveChallenges.ts`](../../src/data/interactiveChallenges.ts); [handoff](../../INTERACTIVE_CHALLENGE_LAB_HANDOFF.md).
- **CMS reader:** [`src/cms/sanity/`](../../src/cms/sanity/); [Sanity schema](../../studio/schemaTypes/documents/challenge.ts).
- **AI development workflow:** [protocol](../ai-development-protocol.md), [workflow](../development-workflow.md).
- **Product decisions:** [current Field Notebook decision-status map](gamification-and-achievements.md#decision-status-at-a-glance--november-7-2026), [Nov 7 Archive/Hub working notes](2026-11-07-archive-library-and-continue-working-notes.md), [Biblical Discovery and Scripture](biblical-discovery-and-scripture.md), [accounts/sync](../architecture/user-accounts-and-sync.md). **Older sources for chronology, not conflicting current requirements:** [#22 Hub/personal area/What's New](https://github.com/ContraPhilosophy/Bibleberry/issues/22) and [Nov 6 decision history](2026-11-06-design-session-record.md).
- **Execution and verification:** [#15 lint](https://github.com/ContraPhilosophy/Bibleberry/issues/15), [#20 engineering maturity](https://github.com/ContraPhilosophy/Bibleberry/issues/20), [#21 Cloudflare testing](https://github.com/ContraPhilosophy/Bibleberry/issues/21), [#25 CMS integration](https://github.com/ContraPhilosophy/Bibleberry/issues/25), [#26 browser regression](https://github.com/ContraPhilosophy/Bibleberry/issues/26), [manual regression checklist](../testing/regression-smoke-checklist.md).
- **Separate repository:** [BerryMark](https://github.com/ContraPhilosophy/BerryMark), including language specification, import planner, controlled draft importer, and merged [PR #11](https://github.com/ContraPhilosophy/BerryMark/pull/11).

## 8. Maintenance and interpretation

This roadmap is deliberately more stable than a sprint board. **Don't rewrite it after every PR.** For actual status, inspect the current code and linked Issues/PRs. Review at substantive feature milestones or roughly monthly; update the dated audit notes and major decisions when architecture or priorities genuinely change.

Use the existing GitHub Project for Backlog → Ready → In Progress → Review → Done. Create narrower Issues only as a piece of work receives a scope and implementation kickoff. The presence of an item here never means it is approved, built, tested, merged or deployed.

**Overall direction:** Bibleberry has already demonstrated much of the interactive experience in its development environment. The most valuable next product work is integrating the **content pipeline, CMS player and reader state** into one coherent, editorially manageable application, while designing its welcoming front door and keeping engineering checks reliable.
