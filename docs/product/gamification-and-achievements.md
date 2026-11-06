# Bibleberry — Gamification, Achievements & Participation

> **Product vision and decision register, not an implementation specification**
> **Updated:** 2026-11-06
> **Status:** Established principles and November 6 product decisions are recorded below; remaining questions and concepts are explicitly marked.
> **Project:** Bibleberry AppDev | **Target launch:** 2027-01-01
> **Product lead:** Aaron Waid | **Content/ministry authority:** Alexis Waid

## Purpose and vision

Bibleberry is a free, mobile-first Christian formation app built around Alexis Waid's biblical teaching. Each daily teaching experience is a **Challenge**, whatever its format. The structured multi-screen reader, Archive, Scripture library and the monthly/weekly editorial rhythm are the product's foundations.

The participation system should make reading and learning satisfying, recognize accomplishments, and help readers see a lasting personal history. It is **not** a game economy, a spiritual maturity score, or an incentive to consume more content at the expense of attention to the teaching.

**Editorial content comes first.** Alexis's teaching is not shortened, rewritten, themed, or scheduled to satisfy an achievement requirement. Goals can be identified **after** a month's material has been planned.

### Decision authority and labels

- **Adopted principle:** Aaron accepted the research-informed product direction on November 6, 2026.
- **Decided product direction:** Aaron explicitly chose the stated approach; details may still require UX definition and Alexis's ministry-facing approval.
- **Exploratory/open:** Discussed, but **not** an engineering requirement or a finalized design.
- **Historical/superseded:** Preserved for context and rationale, not instructions to implement.

## A. Nine adopted foundational principles (November 6, 2026)

These are the nine areas of substantial agreement across the Gemini Argon report and independent evidence audit, which Aaron explicitly accepted as Bibleberry product principles. Agreement between reports is not by itself scientific proof; research support varies by question.

1. **Personal accomplishment, never competition.** No leaderboards, public reader rankings, spiritual status scores, or content locked behind achievements. Recognize positive participation rather than superiority.
2. **No punitive attendance streaks.** Missed days never wipe earned accomplishments or reset the primary progression system. Archived Challenges can be completed when available; catching up counts normally, without a reward *for* having fallen behind.
3. **Teaching first.** Achievement rules must not dictate Alexis's teaching, prevent access to Scripture, or turn optional content into a compulsory requirement. Screens can be as long or as numerous as the teaching merits.
4. **Keep the Challenge reader focused.** Show useful instructional navigation and screen/section progress, but not achievement counters, badge-chasing prompts, or intrusive celebration in the middle of teaching. A restrained completion acknowledgment belongs after the teaching.
5. **Permanent earned history.** Readers keep earned accomplishments, including the **date an achievement was earned**, and records of which Challenges they have completed. An earned award does not disappear when participation lapses.
6. **Avoid artificial scarcity and fear of missing out.** Do not manufacture permanent shame or collectible gaps around missed dates. Seasonal material may be featured seasonally. Availability of past content and monthly goals is a separate product decision (see open questions).
7. **Meaningful Scripture practice.** App-wide saving of Scripture and honor-system “I learned it!” remain valid. Retrieval practice and spaced review should be part of the memorization direction; precise practice modes and launch depth remain open.
8. **Reader-controlled quiet presentation.** Provide a lightweight Quiet Reading option that hides achievement/milestone prompts and counters while preserving actual completion and award history. It should not hide essential navigation or Scripture tools. Exact UI design and release scope remain to be defined.
9. **Durable, minimal personal records.** Stable Challenge identities, reliable completion tracking, permanent award records and account-based continuity matter. Use only the data needed to support product functions; do not presume a comprehensive interaction log.

## B. Three resolved research conflicts (November 6, 2026)

### B1. Achievement visibility: choose a hybrid Field Notebook

**Decided:** Readers may anticipate selected future achievements, see understandable requirements, and view progress toward them. Symbols are acknowledgments of meaningful participation, not the reason or measure of Christian formation. A blanket grid of every unearned achievement is **not required**, nor is a surprise-only system.

The **Personal Field Notebook** is the working concept for a combined reading history and collection: earned illustrated entries, dated accomplishments, and a restrained number of visible goals. Some monthly commemoratives or discoveries may be revealed only when earned. Exact visual treatment, terminology, number of visible goals and art need further discussion and Alexis's approval.

**Reasoning:** Research on expected rewards and digital gamification does not establish that every visible, self-directed symbolic goal undermines intrinsic motivation. Aaron drew an analogy to milestone sobriety coins: the token recognizes an accomplishment without necessarily causing the underlying commitment.

### B2. Completion: no mandatory timer or sincerity test

**Decided:** No 45–60-second reading minimum, waiting period, or required optional reflection to earn completion. The app cannot infer comprehension, motivation or sincerity from elapsed time; a fast attentive reader must not be penalized.

Opening, starting, resuming, saving and completing a Challenge are different actions. Completion means reaching the defined conclusion of that experience and carrying out any interaction intrinsic to the Challenge format; **optional** deeper studies, prayers and reflections remain optional. Exact completion behavior for each format can be defined later without timer-gating.

**Reasoning:** Bibleberry provides substantive teaching and trusts readers to engage; it does not police spiritual sincerity to prevent hypothetical badge misuse.

### B3. Persistence: choose the simpler durable-record approach

**Decided:** Track important accomplishments rather than maintaining a comprehensive diary of user interactions. The minimal model must preserve distinct completed Challenge IDs, saved Scripture and memorization state, and earned achievement IDs with **earned dates**. Signed-in records should survive device changes; guest records may be local to one device.

A simple relational/record-based approach using the existing Supabase working direction is preferred. **Full event sourcing, a complete append-only behavioral ledger, and sophisticated offline-first replication are not product requirements.** Technical timestamps or deduplication fields may be used if needed for safe syncing, but granular activity histories are not product goals.

**Reasoning:** No concrete reader benefit has been identified for recreating a minute-by-minute history. Do not spend implementation resources storing detail without a defined use.

See [User Accounts & Sync](../architecture/user-accounts-and-sync.md) for the separate working architecture and its unresolved technical questions.

## C. Participation model: decided direction, not final catalogue

### C1. Lifetime Challenge completion is the primary enduring progression

**Decided:** The principal cumulative progression is the total number of **distinct Challenges completed**, irrespective of the order or dates on which they were read. Completing the same Challenge again should not inflate the lifetime total. Selected lifetime milestones can have visible progress and permanent collectibles.

Thresholds (for example, 10, 25, 50, 100), exact names, tiers, and artwork remain **unapproved examples**, not a finalized catalogue. A completion total alone may be insufficiently interesting; the monthly system below provides variety.

### C2. Monthly completion commemoratives

**Decided in concept:** Bibleberry's editorial planning naturally works in months as well as weeks, as it has in Forevergreen. Completing **all Challenges belonging to a given month's published set** should earn that month's commemorative recognition or collectible, representing the month in the reader's personal history.

The monthly reward is not intended as a permanently gray missing slot in a collection before it is earned. Its precise artwork, reveal, naming and publication/availability rules are not decided. Earned collectibles remain earned.

**Open implementation semantics:** Define a month's eligible Challenge set, what happens if publication schedules change, whether missed/unpublished dates count, how late additions are handled, and how long monthly goals remain earnable while their content is accessible. Do not invent these rules in code.

### C3. Content-derived monthly mini-collections

**Decided in concept:** After Alexis's material for the month is planned, editors may notice recurring Scripture topics, images or themes and offer playful small monthly goals tied **only** to those existing Challenges. Examples discussed: two Challenges involving lions, four about Psalms, or several about parables. The content need not be specially produced to meet a goal.

The reader might see **“Lions in Scripture — 1 of 2”** during that month. This gives anticipation, novelty, and a reason to notice connections across the teaching. Completing the entire month's eligible Challenge set would also complete any mini-collections drawn exclusively from it.

**Still open:** Whether each mini-collection gives a permanent collectible, a temporary completion mark, or both; how monthly goals appear after the calendar month; whether all are known beforehand; exact art, naming and editorial workload. A visible **progress teaser** does not require a permanent gray unearned reward slot.

### C4. Real-day consistency: optional spontaneous encouragement, not a core streak

**Working concept, not yet a committed feature:** If a reader happens to participate on seven or fourteen *actual consecutive calendar days*, the app might display a small surprise acknowledgment. This is different from completing seven Challenges with consecutive **publication** dates later from the Archive.

If pursued, the acknowledgment is **not** an ongoing streak obligation, a permanent missing collectible, a warning, or the foundation of lifetime progress. There should be no streak-maintenance pressure. Recognition triggers, whether it ships, and any minimum date-only tracking needed remain open.

### C5. Archive and earned-history boundaries

Users may revisit and complete archived Challenges when they are available. Retrospective completion counts toward distinct lifetime totals and content-derived mini-collections if the relevant goal is still available. **Do not assume all historical months or monthly goals remain available forever:** the content availability model and eligibility window still require a decision. Never take away an accomplishment already earned.

## D. Memorization and the other open research divergences

The research compared five less-conflicting areas; the first now has a decided primary direction while the others still require refinement.

| Area | Current product direction | Still open |
| --- | --- | --- |
| **1. Progress hierarchy** | **Decided:** Lifetime unique Challenge totals lead; content-derived monthly mini-collections and full-month commemoratives add variety. Publication-date sequences are not the primary game. | Exact milestones, monthly visibility/availability and whether to show any other sequence achievements. |
| **2. Scripture memorization scope** | **Adopted principle:** Scripture can be saved from anywhere; the weekly memorization Challenge is distinct from the personal library. Honor-system known/learned declarations remain available. Retrieval and spacing are useful. | One simple recall mode vs multiple modes at launch; “Planted / Growing / Rooted” vocabulary; practice scheduling and accomplishment criteria. No exams or practice-count farming. |
| **3. Home Hub progress emphasis** | Show useful personal orientation without making the Hub a gamification dashboard; keep in-reader achievements unobtrusive. | How much to show of counts, reading history, active monthly progress, or Field Notebook teasers. |
| **4. Seasonal experiences** | Avoid artificial FOMO and permanent missing-achievement gaps; highlight seasonal teaching when timely. | Optional scheduled experiences, dated participation marks and content availability. Special Events are not approved. |
| **5. Field Notebook presentation** | **Partly decided:** Hybrid of earned personal history and selected visible goals; surprise monthly commemoratives are possible. | Final graphics, navigation, categories, placement, which goals are pre-visible, how mini-collections are marked, and Alexis's aesthetic approval. |

### Scripture library minimum boundaries

- A reader can save a Scripture passage used **anywhere** in the app when licensing and reference availability permit; source and translation rights must be honored.
- Saved Scripture, practice state and the reader's declaration of “I learned it!” are separate from achievement awards.
- A reader who already knows a passage should not be required to perform artificial sessions to mark it learned.
- Practice can use meaningful retrieval with corrective revelation and spaced opportunities; no particular blanking interface is approved merely because research supports retrieval generally.
- Private reflection/journaling storage is not approved by this design record.

## E. Achievement aesthetics and ministry review

Alexis prefers a mature, field-book-inspired application rather than an excessively cute or conventional gaming appearance. Existing evergreen, cream and brown tones provide a starting point.

**Exploratory directions:** botanical/fruit and harvest specimens, stamps/seals, journal records, or a hybrid of restrained illustration and typography. Illustrations could change at advanced tiers, but evolving collectible tiers are not approved. Aaron and Alexis will review visual directions; Alexis is **not** expected to draw the artwork personally. No artwork or final category taxonomy is approved by this document.

## F. Concepts explicitly not approved

- **Consecutive publication-date achievement ladder:** The former 7/14/30/60/90/120 sequence counted Challenge *release dates* and allowed archive catch-up. It remains historical brainstorming, **not** the primary progression model or an approved launch requirement.
- **Special Events / Praying the Hours:** Prior idea: voluntary, time-limited prayer points, perhaps with an earned-date commemorative. This is **future brainstorming only**, not an approved launch feature. Unattained Event rewards should not create a wall of gray missed slots if this concept is revisited.
- **Evolving collectible tiers:** A visually changing achievement with separate historic earned dates was proposed, but remains exploratory.
- **Old Bookmarks/Keys, gated downloads and Greek-lesson prizes:** Historical brainstorming only, not a requirement.
- **Punishing lapse, rewarding missed days, theological exams and competitive rankings:** Explicitly rejected.

## G. Evidence and decision history

### Research inputs considered on November 6, 2026

1. [Gemini Argon — Gamification, Motivation, and Long-Term Engagement in Bibleberry](https://docs.google.com/document/d/1QjFHzThYABDq9a-9Y6XUvs3X0foyByWuBdKdoVrPuHM/edit?usp=drivesdk), commissioned independent research report.
2. **Independent Evidence Audit of Gamification, Motivation, and Long-Term Engagement for Bibleberry**, added to AppDev Project sources. It independently examined key claims but reported that it could not directly read Argon's complete original document in its research runtime. It was **not** a literal citation-by-citation audit.
3. October 30–31 design conversations, now compared with November 6 discussions and the two research syntheses.

**Research strength:** Retrieval practice and distributed practice have comparatively strong empirical support. Findings on symbolic digital achievements, long-term retention, and the exact form of monthly collections are more contextual or inferential. The monthly model is a deliberately chosen **product hypothesis**, not a tested scientific guarantee.

### Historical design record

The October 31 snapshot [remains in Git history](https://github.com/ContraPhilosophy/Bibleberry/blob/35d618e425056997244f0ea6bce5ab795c6af518/docs/product/gamification-and-achievements.md). It records why Aaron initially favored a fully visible gray-locked catalogue, why retrospective release-date chains were proposed as alternatives to punitive streaks, and where botanical and event ideas originated. Its still-useful principles have been carried forward; conflicting proposals have been marked superseded or exploratory in this November 6 revision.

### November 6 decision summary

- **Nine common principles:** explicitly adopted.
- **Conflict 1:** hybrid Field Notebook with anticipated selected achievements, not surprise-only or a mandatory wall of gray awards.
- **Conflict 2:** no mandatory reading-time thresholds or compulsory optional reflections.
- **Conflict 3:** simple durable personal records instead of full event sourcing.
- **Divergence 1:** cumulative distinct Challenges as primary progression, plus monthly completion commemoratives and content-derived mini-collections. Actual-day consistency recognition remains a modest optional concept, not a punitive streak.
- **Other divergences and visual details:** still open as listed above.

## H. Planning and implementation boundary

This file is a **product vision/decision record**, not permission for an AI coding assistant to implement its entire contents. Any engineering work must begin with scoped, approved assignments and repository/codebase review. Changes should go through branches and pull requests for Aaron to review and merge.

Before building achievement mechanics, resolve eligibility details for monthly sets and mini-collections, the meaning of completion across Challenge formats, placement in the Hub/Field Notebook, UX copy, and privacy/sync semantics. Preserve existing app prototypes and the separation of Sanity editorial content from private reader records.

**No application changes, artwork approval, Special Event implementation, or production data schema are authorized by this document alone.**
