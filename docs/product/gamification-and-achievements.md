# Bibleberry — Gamification, Achievements & Participation

> **Product vision and decision register, not an implementation specification**
> **Updated:** 2026-11-08
> **Status:** November 8 approved product direction. **Read the [Nov 8 authoritative reader-experience and Month Screen decisions](2026-11-08-approved-reader-experience-and-month-screen.md) first.** Earlier sections retained here are superseded wherever they conflict. Documentation, not implementation authorization.
> **Project:** Bibleberry AppDev | **Target launch:** 2027-01-01
> **Product lead:** Aaron Waid | **Content/ministry authority:** Alexis Waid

## Purpose and vision

Bibleberry is a free, mobile-first Christian formation app built around Alexis Waid's biblical teaching. Each daily teaching experience is a **Challenge**, whatever its format. The structured multi-screen reader, **Month Screen**, **Shelf**, **Library**, Scripture library and monthly/weekly editorial rhythm belong to the broader product model.

The participation system should make reading and learning satisfying, recognize accomplishments, and help readers see a lasting personal history. It is **not** a game economy, a spiritual maturity score, or an incentive to consume more content at the expense of attention to the teaching.

**Editorial content comes first.** Alexis's teaching is not shortened, rewritten, themed, or scheduled to satisfy an achievement requirement. Goals can be identified **after** a month's material has been planned.

**Authority override (November 8, 2026):** Aaron explicitly approved the design direction in [November 8 approved reader experience](2026-11-08-approved-reader-experience-and-month-screen.md), including the new Month Screen, Shelf/Library naming, monthly discovery visibility, Challenge Finish and Hub-only announcements, and monthly previews/introductions. That record takes precedence over conflicting November 6–7 wording here, historic Issues, and unmerged plans. Aaron may approve product/card designs; do not impose a separate automatic Alexis sign-off on each product decision. Alexis's source teaching and theological/editorial authority remain protected.

### Decision authority and labels

- **Adopted principle:** Aaron accepted the research-informed product direction on November 6, 2026.
- **Decided product direction:** Aaron explicitly chose the stated approach, including November 8 revisions. Aaron can approve product/creative decisions; maintain Alexis's editorial and theological authority over teaching without inventing an automatic separate layout/card approval gate.
- **Exploratory/open:** Discussed, but **not** an engineering requirement or a finalized design.
- **Historical/superseded:** Preserved for context and rationale, not instructions to implement.

## Decision status at a glance — updated November 8, 2026

**Read the [November 8 authority record](2026-11-08-approved-reader-experience-and-month-screen.md) before reusing any earlier gamification proposal.** The labels below distinguish **settled current product behavior**, **historical/superseded ideas**, and **genuinely open choices**. “Settled” means Aaron selected the product behavior; it does **not** mean the interface is built, Alexis has approved artwork, or an agent has permission to implement it. The detailed current direction appears in Sections A–E and the linked [November 7 working notes](2026-11-07-archive-library-and-continue-working-notes.md). The [November 6 session record](2026-11-06-design-session-record.md) is a *dated history*, not a parallel current specification.

### CURRENT WORKING MODEL — settled product behavior

- **Teaching environments:** Current month is separate from the focused **Shelf** with **zero to three** historical months and complete historical **Library**. Explicitly selected/protected Shelf months are never automatically evicted. Qualified just-ended months can take an empty slot or replace the oldest auto-admitted month. **Month Screen** is a new first-class calendar with completion and Monthly Discoveries for current and historic months. See the November 8 authority record.
- **Award eligibility:** Distinct Challenge completions count wherever the reader studies, **including directly in the Library**. Library gamification presentation is hidden while reading, not disabled. No attendance penalties, competitive metrics, or universal reading timer.
- **Field Notebook:** Permanent **earned-card** collection by publication year/month and **All Earned Cards**. **Monthly Discoveries are visible in the Month Screen once a reader begins the month**, without a first-earned-card prerequisite. Unearned goals show **title and numeric progress only**, no art or tap target; earned badges open their full Scripture cards directly from Month Screen. Monthly completion reward is last. Special Experiences appear only when earned.
- **Collectibles:** Both thematic discovery completion **and completion of an entire finalized month's eligible Challenges** earn permanent, dated, substantive illustrated **Scripture cards**. The full-month reward is the month's final card, not a certificate. Cards belong to the *publication month* even if earned much later; the actual earned date is preserved.
- **Lifetime participation:** One evolving status derived from **distinct completed Challenges** replaces prior statuses. Lifetime milestone badges do not accumulate. No obligatory next-tier progress bar or separate lifetime-awards page.
- **New awards and Finish:** The final teaching button says **Finish**; only tapping Finish completes the Challenge (not simply reaching the last screen). The reader returns to the **origin context**. Partial discovery progress updates silently on Month Screen. Newly earned cards are announced as **one combined notice on the next Hub visit only**, including after closing and reopening the app. Optional opt-out suppresses presentation but not earning; re-enable produces one combined catch-up. Hub **New Discoveries** clears when Notebook opens; individual card **New** clears when that card opens.
- **Monthly finalization:** Once a month's eligible Challenge set is finalized, ordinary editorial typo/reference corrections do not change its requirements, reset completion or revoke earned cards. Future unpublished Challenges prevent premature full-month awards.
- **Special Experiences:** Optional time-limited, **not archived for retrospective participation**. Starting during the event window qualifies for an **event-specific grace period** (one-day example: no later than noon the next local day). No new starts after cutoff, no missed-event placeholders. Permanent earned-only dated cards. No particular event approved/scheduled.

### HISTORICAL / SUPERSEDED — preserved as decision history, not requirements

- Large gray/locked walls of all possible achievements, or conversely a surprise-only collection.
- Permanent collectible badges for each lifetime threshold, old tier ladders, seals that accumulate for every lifetime level, and visible lifetime goal progress bars.
- Generic monthly completion certificates or summary-only monthly cards; thematic mini-collections with no permanent card.
- The old **7/14/30/60/90/120 consecutive publication-date ladder** as the core participation system; punitive attendance streaks, rewards for missing days, or mandatory dwell timers.
- Unlimited active historical Archive months, or automatically retaining months simply because they are the most recent/unfinished.
- Full append-only event sourcing as a requirement, or mandatory integrated weekly memorization as the launch plan.
- November 6's unanswered questions about *whether* thematic discoveries give cards or *whether* the Library can award them. Those were resolved November 7.

Historical discussions, older Issue bodies, dated handoffs, and research reports may accurately describe **what was proposed at that time**. Their old prescriptions do not override the current model. See the [repository audit](2026-11-07-gamification-repository-audit.md) for locations and remaining external references.

### OPEN / NOT YET APPROVED — do not silently choose in engineering

- **Shelf/Hub engineering:** Reader-selected/protected Shelf months are never auto-evicted; a qualifying just-ended month replaces only the oldest auto-admitted month if full. Precise equal-age ties, re-add semantics, first-post-rollover visit detection, focus/resume edge cases and technical Hub **Continue** routing still need a deterministic implementation specification.
- **Visual/editorial:** Exact illustrated card and badge designs, calendar layout, lifetime-status naming/placement and mobile treatments await design and **Aaron's product approval**. Alexis's real notebooks are the aesthetic source and her teaching remains editorially protected; product design does not require an independent Alexis sign-off for every card.
- **Presentation preferences:** The earned-card *announcement opt-out* is decided; no separate broad Quiet Reading mode is required. Exact setting placement, announcement artwork and text remain UX work.
- **Implementation/release:** Idempotent completion/award data contracts, CMS card modeling, sync, technical notification state, per-format completion contracts, testing and launch scope. These are implementation specifications and approvals, not a reason to reopen the settled product model.
- **Optional future features:** Specific Special Experiences and exploratory real-calendar-day surprise encouragement are not production commitments.

**Implementation gate:** Neither this register nor the November 7 notes authorizes code, artwork, CMS changes or a launch commitment. Scope work through the normal Issue/PR and Aaron/Alexis review process.

## A. Nine adopted foundational principles (November 6, 2026)

These are the nine areas of substantial agreement across the Gemini Argon report and independent evidence audit, which Aaron explicitly accepted as Bibleberry product principles. Agreement between reports is not by itself scientific proof; research support varies by question.

1. **Personal accomplishment, never competition.** No leaderboards, public reader rankings, spiritual status scores, or content locked behind achievements. Recognize positive participation rather than superiority.
2. **No punitive attendance streaks.** Missed days never wipe earned accomplishments or reset the primary progression system. Archived Challenges can be completed when available; catching up counts normally, without a reward *for* having fallen behind.
3. **Teaching first.** Achievement rules must not dictate Alexis's teaching, prevent access to Scripture, or turn optional content into a compulsory requirement. Screens can be as long or as numerous as the teaching merits.
4. **Keep the Challenge reader focused.** Show useful instructional navigation and screen/section progress, but not achievement counters, badge-chasing prompts, or intrusive celebration in the middle of teaching. A restrained completion acknowledgment belongs after the teaching.
5. **Permanent earned history.** Readers keep earned accomplishments, including the **date an achievement was earned**, and records of which Challenges they have completed. An earned award does not disappear when participation lapses.
6. **Avoid artificial scarcity and fear of missing out.** Do not manufacture permanent shame or collectible gaps around missed dates. Seasonal material may be featured seasonally. Availability of past content and monthly goals is a separate product decision (see open questions).
7. **Scripture saving and future memorization guidance.** App-wide saving of Scripture references remains important. Biblical Discovery replaces weekly memorization in the launch direction; integrated memorization is deferred. An optional honor-system learned declaration and personal-Bible guidance remain possible, but are not automatically launch scope. See [Biblical Discovery and Scripture](biblical-discovery-and-scripture.md).
8. **Reader-controlled achievement announcements and quiet presentation.** Earned-card announcements may be disabled, but earning, the Field Notebook, the Hub's New Discoveries indicator and each card's New label remain. Do not infer from earlier research that a separate broad Quiet Reading mode is a product requirement.
9. **Durable, minimal personal records.** Stable Challenge identities, reliable completion tracking, permanent award records and account-based continuity matter. Use only the data needed to support product functions; do not presume a comprehensive interaction log.

## B. Three resolved research conflicts (November 6, 2026)

### B1. Achievement visibility: monthly treasure hunt + permanent earned collection

**Superseded November 8:** The Field Notebook is the permanent record of *earned* cards, not a wall of gray unearned badges. The **Month Screen** displays available thematic discovery **titles and progress from the beginning of participation**, no first-earned-card unlock prerequisite. **Never reveal the qualifying Challenges or future card artwork/text.** Unearned discoveries are not tappable; earned illustrated badges open the complete Scripture card. The larger Notebook collection contains earned cards only. A publication year continues to show all twelve months without treating unstudied months as failures.

The selected aesthetic derives from **Alexis's actual illustrated Bible-study notebooks**. Product designs are approved by Aaron; theological teaching remains under Alexis's editorial authority. The Field Notebook can show earned cards by publication month or in All Earned Cards; see §C and §D.

**Reasoning:** Evidence supports neither universal suppression of visible goals nor a compulsory grid of missing achievements. The hybrid recognizes genuine participation without creating absence-driven pressure.

### B2. Completion: no mandatory timer or sincerity test

**Decided:** No 45–60-second reading minimum, waiting period, or required optional reflection to earn completion. The app cannot infer comprehension, motivation or sincerity from elapsed time; a fast attentive reader must not be penalized.

Opening, starting, resuming, saving and completing a Challenge are different actions. Completion means reaching the defined conclusion of that experience and carrying out any interaction intrinsic to the Challenge format; **optional** deeper studies, prayers and reflections remain optional. Exact completion behavior for each format can be defined later without timer-gating.

**Reasoning:** Bibleberry provides substantive teaching and trusts readers to engage; it does not police spiritual sincerity to prevent hypothetical badge misuse.

### B3. Persistence: choose the simpler durable-record approach

**Decided:** Track important accomplishments rather than maintaining a comprehensive diary of user interactions. The minimal model must preserve distinct completed Challenge IDs, saved Scripture, and earned achievement IDs with **earned dates**. Signed-in records should survive device changes; guest records may be local to one device.

A simple relational/record-based approach using the existing Supabase working direction is preferred. **Full event sourcing, a complete append-only behavioral ledger, and sophisticated offline-first replication are not product requirements.** Technical timestamps or deduplication fields may be used if needed for safe syncing, but granular activity histories are not product goals.

**Reasoning:** No concrete reader benefit has been identified for recreating a minute-by-minute history. Do not spend implementation resources storing detail without a defined use.

See [User Accounts & Sync](../architecture/user-accounts-and-sync.md) for the separate working architecture and its unresolved technical questions.

> **Historical November 7 working notes:** [Shelf, Library, Hub Continue and Field Notebook](2026-11-07-archive-library-and-continue-working-notes.md) contain the detailed history and approved Field Notebook refinements. Archive rollover tie-breaking and Hub Continue routing remain provisional; illustrative examples are not a finalized algorithm.

## C. Participation model: decided direction, not final catalogue

### C1. Lifetime completion: one evolving Field Notebook status

**Decided November 7:** The total count of **distinct Challenges completed** advances a **single evolving participation status** in the Field Notebook. It measures completed teaching across current, Archive and Library sources, **not** elapsed membership time or consecutive real-world days. A reread cannot inflate the distinct count.

The updated status **replaces earlier stages**; former stages do not remain as collectible badges. No Lifetime Achievements page, collection of permanent seven-/thirty-/hundred-Challenge badges, or required bar to the next tier. A modest total completed count may be displayed.

Conceptual thresholds previously considered: **7, 30, 100, 200, 365, 730, 1,095** and subsequent increments of 365. These are possible status levels, **not approved titles or a required final tier catalogue**. Final wording and visual heading treatment await editorial/design review.

### C2. Full-month completion earns a substantive Scripture collectible

**Decided November 7:** Completing **every Challenge in a finalized publication month's eligible set** earns **one illustrated Scripture-related card**. It has the same substantive theological character as thematic discovery cards, not a separate certificate, generic monthly summary, or card titled simply “November 2026.”

The card's meaningful biblical subject is derived from Alexis's completed teaching and approved through the Bibleberry product process under Aaron's product authority, with its own illustration in the recognizable notebook visual language. The publication month and unlocking basis can be metadata such as “Earned by completing November 2026,” while the card displays the **actual earned date** separately. An award earned years later from the Library still belongs under its **original publication month**.

The full-month card is the **final monthly reward**: it cannot be earned merely by finishing everything currently released if unpublished Challenges remain. When the month is editorially finalized, its eligible Challenge set is stable. **Ordinary content corrections do not change completion requirements or revoke awards.** Exceptional changes to a finalized month's membership are not a routine scenario and require a separate editorial decision if they arise. Completion in the historical Library earns the same card without Archive activation.

### C3. Thematic discoveries earn permanent Scripture cards

**Decided November 7:** After Alexis plans content, editors may identify naturally recurring biblical images, motifs, narratives or theological connections. This must never dictate what Alexis writes. **Each completed thematic mini-collection awards a permanent illustrated Scripture collectible**, with an actual earned date, meaningful title, Scripture references / selected WEBP text, and a concise substantive explanation based on her teaching.

**Visibility:** **Monthly Discoveries live on the Month Screen**, with titles and numeric progress visible from initial participation. **Do not reveal qualifying Challenge titles, Scripture references or card artwork** until earned. An unearned item is untappable; an earned illustrated badge opens the full card. Completing all of the month's Challenges guarantees all thematic cards. Place the full-month completion goal last. Progress only changes upon **Finish**, not by viewing content.

**Eligibility:** Completions from current teaching, Shelf or Library count identically. Library completion records and awards accrue even though the Library itself shows no gameful prompts or reward progress. Collected cards stay available regardless of whether a month is subsequently put away.

### C4. Real-day consistency: optional spontaneous encouragement, not a core streak

**Working concept, not yet a committed feature:** If a reader happens to participate on seven or fourteen *actual consecutive calendar days*, the app might display a small surprise acknowledgment. This is different from completing seven Challenges with consecutive **publication** dates later from the Archive.

If pursued, the acknowledgment is **not** an ongoing streak obligation, a permanent missing collectible, a warning, or the foundation of lifetime progress. There should be no streak-maintenance pressure. Recognition triggers, whether it ships, and any minimum date-only tracking needed remain open.

### C5. Current teaching, Shelf and Library

The **Hub prioritizes the current publication month**. The **Shelf** is a focused workspace with **zero to three historical months** in addition to the separate current month. At rollover a just-ended month with at least one completed Challenge may enter an open slot or replace the **oldest automatically admitted** month. It must **never evict a reader-selected/protected month**; if all slots are protected, it stays in Library. Putting away preserves all progress/awards. The reader's deliberate active study focus is distinct from incidental Library browsing. Hub offers a single Continue suggestion. Rollover/resume tie handling remains technical specification work.

The **Library** holds all older ordinary teaching, including months not on Shelf. Readers may finish Challenges there directly, receiving all distinct lifetime credit and permanent cards. Library catalogue and Challenge reading remain free of gamification intrusions, while the historical **Month Screen** legitimately shows monthly completion and discoveries. **Announcements are deferred until the next Hub visit** regardless of where Challenge completion occurred.

Cards are grouped in the Field Notebook under their **publication year/month**, even when earned later, and display the real date earned. Earned history is permanent, and returning to older teaching does not entail punitive streak resets.

## D. The five research divergences: November 6 outcomes

The five smaller disagreements have now all been **discussed**. One led to a materially changed feature plan, and many design/launch details remain deliberately open. See the [November 6 session record](2026-11-06-design-session-record.md) for the chronological discussion.

| Area | Outcome / product decision | Open details |
| --- | --- | --- |
| **1. Progress hierarchy** | **Refined November 7:** Distinct completions advance one evolving lifetime status; thematic and full-month completion earn permanent Scripture cards. Publication-date chains are not primary. | Status wording, card art and Archive/Hub implementation details. |
| **2. Weekly memorization** | **Decided direction:** Replace dedicated weekly WEBP memorization with **Biblical Discovery**, currently envisioned for Sunday. Maintain Scripture saving. Do not launch a full memorization app or impose a fixed four-week Discovery rotation. | Alexis's editorial review, first Discovery interactions, optional self-directed **Memorize with Your Bible** guidance and any learned-state UI. |
| **3. Hub progress presentation** | **Refined November 7:** Hub retains Field Notebook New Discoveries until the Notebook is opened; each individual earned card stays New until opened. Dismissing an announcement does not clear either. | Visual treatment and broader Quiet Reading UX. |
| **4. Special Experiences** | **Decided principle:** Genuine time-limited special experiences may award permanent dated commemoratives. The **Special Experiences** Notebook category remains entirely **hidden until the reader earns the first such collectible**. No missing gray slots for missed events. | Individual events, eligibility, cadence, publication/scheduling, launch scope. |
| **5. Field Notebook visual identity** | **Chosen direction:** A mature, illustrated personal archive inspired by **Alexis's real Bible-study notebook pages**, not a generic botanical moodboard or a conventional gaming badge grid. | Actual artwork, information design, accessibility and Alexis's review/approval. |

### Hub, Notebook, Library and Challenge reader are distinct experiences

- **Hub:** Latest current published Challenge and Bibleberry resources; may offer one unobtrusive active-Archive Continue entry (routing details remain open). A Field Notebook destination carries the temporary **New Discoveries** indicator.
- **Shelf:** Focused reader-selected active workspace of at most three historical months plus current teaching.
- **Library:** Historical catalogue with ordinary completion and earning but no in-context achievement UI.
- **Month Screen:** Calendar of Challenges with completed/available/Coming Soon status and all month titles; Monthly Discoveries below calendar, full-month goal last. Unearned titles/progress are visible and untappable; earned illustrated badges open full cards. Advance previews show teaching only.
- **Field Notebook, year/month:** Select a publication year and see all twelve months normally with **earned** Scripture cards. Historical Month Screens, not unearned gray Notebook galleries, host unfinished discovery goals.
- **Field Notebook, All Earned Cards:** Separate scrolling gallery grouped into **Monthly Challenges** (thematic and full-month cards) and **Special Experiences** (category hidden until first earned event card). Within each group, show **newest earned first**, not publication-order. The gallery and monthly pages point to the same award records. No complex filters are currently required.
- **Field Notebook lifetime status:** One status that evolves with distinct Challenge completion, not accumulating badges.
- **Challenge reader:** No earned-card announcements, collectible popups, reward counters or unrelated gamification during teaching. The final screen has a prominent **Finish** action; tapping it records completion, saves awards and returns to origin. The **Hub alone** triggers pending combined card announcements.

**Card details:** Each earned Scripture collectible may show a title, Alexis-notebook-inspired illustration, Scripture references, selected **WEBP** text, a substantive short biblical/theological explanation, actual earned date and earning condition. Full-month cards are also genuine Scripture study artifacts, not completion certificates. Example card themes such as Jacob's Well remain illustrative and require editorial verification.

### Special Experiences: approved category principle, not an event production assignment

Aaron explicitly accepted **limited-time experiences** such as a potential **Holy Week 2027**, **Advent Calendar 2026** or **Praying the Hours**. These names are illustrative, not scheduled productions. Their event-specific dated collectibles are **only shown when earned**. A reader who never completes a Special Experience does **not** see that section at all.

Ordinary Challenge completion and retrospective archive access are separate from event participation windows. Both types of earned accomplishments are permanent; event availability may genuinely end. The presence of the **Special Experiences** concept **does not authorize building or launching a specific event**.


### Earned-card announcements and acknowledgment (approved November 7)

- Earned cards are automatically awarded, dated and kept forever, no matter which study space is used and regardless of announcement preferences.
- No awards interrupt the Challenge reader. After **returning to the Hub**, one **combined** earned-card announcement may report several pending cards and link to the Field Notebook. The Month Screen, Shelf and Library do not trigger these announcements.
- If an award is earned but not yet announced when the app closes, **carry that unannounced batch across sessions** and show one combined announcement **upon the next Hub visit**, not in the Shelf, Library, Month Screen or other surfaces. A batch is announced **only once**, even if the announcement is dismissed.
- Dismissing the announcement **does not clear** the Hub **New Discoveries** indicator or the **New** label on an individual card.
- The Hub indicator clears **when the Field Notebook opens**; each card stays **New until that specific card is opened**, regardless of whether the reader uses the month view or All Earned Cards.
- Readers may **turn off earned-achievement announcements**. They cannot switch off the Field Notebook or earning. New Discoveries and card-level New labels still operate with announcements disabled.
- A broader Quiet Reading toggle is not an approved requirement. Exact Hub-announcement styling and implementation semantics remain UX/engineering work.

### Scripture collection and memorization boundaries

- A reader should be able to **Save Scripture** encountered anywhere in the app, as a reference independent from Saved Challenges.
- The WEBP translation remains the deliberately chosen, freely usable **in-app Bible translation**. Reader-facing explanation in an About page is a decided content direction, with final wording pending.
- **No required Sunday WEBP memorization** and no forced app-based verbatim memorization engine at launch. Optional guided memorization using the reader's **own Bible and preferred translation** is **exploratory** and distinct from ordinary saved references.
- If an honor-system “I learned it!” mark is later offered, it must not depend on quizzes, timers or claiming to verify the user's spiritual effort. Do not treat older prototype memorization fields as automatic production requirements.
- For Sunday concepts and the 12-candidate Argon idea catalogue, see [Biblical Discovery and Scripture](biblical-discovery-and-scripture.md).

## E. Field Notebook aesthetics and ministry review

**Chosen visual direction (November 6):** Aaron supplied two genuine examples of **Alexis's own illustrated Bible-study notebooks**, which readers have watched her make online. That work—not a generic naturalist or botanical moodboard—is the reference for Bibleberry's Field Notebook.

Characteristics to draw from: illustrative biblical motifs and objects, handwritten or hand-labeled annotation energy, meaningful Scripture references, topical visual clustering, visual connections, warmth, and a composed study-page feel. The digital notebook should preserve legibility and accessibility; it need not mimic the density of a photographed paper notebook.

**Collectible + record:** A reader is developing an illustrated archive of participation and discoveries, not merely a shelf of identical badges. The chosen product direction uses substantive illustrated Scripture cards, a year/month Field Notebook, a grouped earned-card gallery, an evolving lifetime participation status and earned-only special-event collectibles. Exact layout and visuals await Alexis's review.

The two notebook reference images were shared as conversation attachments; **they are not included as image assets in this GitHub documentation update**. Their descriptions and the chosen direction are preserved here; retrieve the actual references from the original conversation before preparing mockups.

**Aaron holds Bibleberry product and creative approval authority.** Alexis's substantive theological/editorial teaching is the source and cannot be overridden or distorted by AI gamification ideas. Specific visuals remain to be designed; do not make a separate Alexis sign-off an automatic requirement for each card/product layout. Her past notebook work establishes the authentic aesthetic precedent.

## F. Concepts explicitly not approved

- **Consecutive publication-date achievement ladder:** The former 7/14/30/60/90/120 sequence counted Challenge *release dates* and allowed archive catch-up. It remains historical brainstorming, **not** the primary progression model or an approved launch requirement.
- **Specific Special Event production:** The **principle** of time-limited Special Experiences with permanent earned-only collectibles **is approved**. But *Praying the Hours*, an Advent calendar, a Holy Week experience or any other particular event is **not approved or scheduled for launch**. There must be no wall of gray missing rewards.
- **Lifetime collectible badge ladder:** Keeping separate seven-, thirty-, hundred- and later milestone cards permanently visible is superseded; the decided direction is one evolving lifetime status. Exact titles and artwork are still open.
- **Old Bookmarks/Keys, gated downloads and Greek-lesson prizes:** Historical brainstorming only, not a requirement.
- **Punishing lapse, rewarding missed days, theological exams and competitive rankings:** Explicitly rejected.

## G. Evidence and decision history

### Research inputs considered on November 6, 2026

1. [Gemini Argon — Gamification, Motivation, and Long-Term Engagement in Bibleberry](https://docs.google.com/document/d/1QjFHzThYABDq9a-9Y6XUvs3X0foyByWuBdKdoVrPuHM/edit?usp=drivesdk), commissioned independent research report.
2. **Independent Evidence Audit of Gamification, Motivation, and Long-Term Engagement for Bibleberry**, added to AppDev Project sources. It independently examined key claims but reported that it could not directly read Argon's complete original document in its research runtime. It was **not** a literal citation-by-citation audit.
3. October 30–31 design conversations, compared with the complete November 6 discussion.
4. **Reimagining Scripture Memorization: Researching Alternative Weekly Biblical Formation Experiences**, Gemini Argon's 41-page research report, shared as the user-uploaded **Bibleberry Weekly Formation Alternatives.docx**. Its candidates and caveats are summarized in [Biblical Discovery and Scripture](biblical-discovery-and-scripture.md).

**Research strength:** Retrieval practice and distributed practice have comparatively strong empirical support. Findings on symbolic digital achievements, long-term retention, and the exact form of monthly collections are more contextual or inferential. The monthly model is a deliberately chosen **product hypothesis**, not a tested scientific guarantee.

### Historical design record

The October 31 snapshot [remains in Git history](https://github.com/ContraPhilosophy/Bibleberry/blob/35d618e425056997244f0ea6bce5ab795c6af518/docs/product/gamification-and-achievements.md). It records why Aaron initially favored a fully visible gray-locked catalogue, why retrospective release-date chains were proposed as alternatives to punitive streaks, and where botanical and event ideas originated. Its still-useful principles have been carried forward; conflicting proposals have been marked superseded or exploratory in this November 6 revision.

### November 6 decision summary

- **Nine common principles:** explicitly adopted.
- **Conflict 1:** hybrid Field Notebook with anticipated selected achievements, not surprise-only or a mandatory wall of gray awards.
- **Conflict 2:** no mandatory reading-time thresholds or compulsory optional reflections.
- **Conflict 3:** simple durable personal records instead of full event sourcing.
- **Divergence 1:** Cumulative distinct Challenges measure one evolving lifetime status; full-month and thematic discoveries award permanent Scripture cards. Actual-day consistency recognition remains optional and is not a punitive streak.
- **Divergence 2:** Sunday **Biblical Discovery** replaces the dedicated memorization Challenge in the intended launch lineup; self-directed own-Bible memorization guidance remains exploratory.
- **Divergence 3:** Hub discovery orientation with Field Notebook destination and a temporary **New Discoveries** overlay; progress details inside the Notebook.
- **Divergence 4:** Time-limited **Special Experiences** are acceptable with earned-only, permanently dated event collectibles; the Notebook category is hidden until first earned.
- **Divergence 5:** Alexis's actual illustrated notebook work anchors the chosen aesthetic direction. Final card artwork/layout remains a deferred product-design task, with Aaron holding product approval authority.

## H. Planning and implementation boundary

This file is a **product vision/decision record**, not permission for an AI coding assistant to implement its entire contents. Any engineering work must begin with scoped, approved assignments and repository/codebase review. Changes should go through branches and pull requests for Aaron to review and merge.

Before building achievement mechanics, specify per-format completion semantics, idempotent award issuance, eligible finalized monthly sets, the exact Hub/Notebook UI and artwork, and privacy/sync semantics. Field Notebook behavior is substantially settled, but Archive/Continue edge cases and production design remain open. Preserve existing app prototypes and the separation of Sanity editorial content from private reader records.

**No application changes, artwork approval, Special Event implementation, or production data schema are authorized by this document alone.**
