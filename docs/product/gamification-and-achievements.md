# Bibleberry — Gamification, Achievements & Participation

> **Product vision and decision register, not an implementation specification**
> **Updated:** 2026-11-06
> **Status:** All five research divergences now discussed, with decided principles, chosen visual directions and unresolved implementation details explicitly separated.
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
7. **Scripture saving and future memorization guidance.** App-wide saving of Scripture references remains important. Biblical Discovery replaces weekly memorization in the launch direction; integrated memorization is deferred. An optional honor-system learned declaration and personal-Bible guidance remain possible, but are not automatically launch scope. See [Biblical Discovery and Scripture](biblical-discovery-and-scripture.md).
8. **Reader-controlled quiet presentation.** Provide a lightweight Quiet Reading option that hides achievement/milestone prompts and counters while preserving actual completion and award history. It should not hide essential navigation or Scripture tools. Exact UI design and release scope remain to be defined.
9. **Durable, minimal personal records.** Stable Challenge identities, reliable completion tracking, permanent award records and account-based continuity matter. Use only the data needed to support product functions; do not presume a comprehensive interaction log.

## B. Three resolved research conflicts (November 6, 2026)

### B1. Achievement visibility: choose a hybrid Field Notebook

**Decided:** Readers may anticipate selected future achievements, see understandable requirements, and view progress toward them. Symbols are acknowledgments of meaningful participation, not the reason or measure of Christian formation. A blanket grid of every unearned achievement is **not required**, nor is a surprise-only system.

The **Personal Field Notebook** is the working concept for a combined reading history and collection: earned illustrated entries, dated accomplishments, and a restrained number of visible goals. Some monthly commemoratives or discoveries may be revealed only when earned. **Actual examples of Alexis's hand-illustrated Bible-study notebooks**, shared during the November 6 conversation, now anchor the chosen *visual direction*; exact artwork, terminology, number of visible goals and final layout still require Alexis's approval. See §E.

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

## D. The five research divergences: November 6 outcomes

The five smaller disagreements have now all been **discussed**. One led to a materially changed feature plan, and many design/launch details remain deliberately open. See the [November 6 session record](2026-11-06-design-session-record.md) for the chronological discussion.

| Area | Outcome / product decision | Open details |
| --- | --- | --- |
| **1. Progress hierarchy** | **Decided:** Total distinct completed Challenges is the primary progression; full-month commemoratives and content-derived mini-collections provide variety. Publication-date chains are not the primary game. | Exact lifetime thresholds, monthly eligibility/availability, mini-collection award rules. |
| **2. Weekly memorization** | **Decided direction:** Replace dedicated weekly WEBP memorization with **Biblical Discovery**, currently envisioned for Sunday. Maintain Scripture saving. Do not launch a full memorization app or impose a fixed four-week Discovery rotation. | Alexis's editorial review, first Discovery interactions, optional self-directed **Memorize with Your Bible** guidance and any learned-state UI. |
| **3. Hub progress presentation** | **Decided:** **Hub is for discovery**, with useful Bibleberry resources/media and a permanent **Field Notebook** destination. Personal achievement progress lives inside the Notebook. A temporary **“New Discoveries”** indicator can overlay its Hub entry when newly earned items await viewing, clearing when the Notebook is opened. **Challenge readers** remain the distraction-free zone. | Final Hub IA, visual design, exact new-item state. |
| **4. Special Experiences** | **Decided principle:** Genuine time-limited special experiences may award permanent dated commemoratives. The **Special Experiences** Notebook category remains entirely **hidden until the reader earns the first such collectible**. No missing gray slots for missed events. | Individual events, eligibility, cadence, publication/scheduling, launch scope. |
| **5. Field Notebook visual identity** | **Chosen direction:** A mature, illustrated personal archive inspired by **Alexis's real Bible-study notebook pages**, not a generic botanical moodboard or a conventional gaming badge grid. | Actual artwork, information design, accessibility and Alexis's review/approval. |

### Hub, Notebook and Challenge reader are distinct experiences

- **Hub:** discovery of available teaching, **Latest from Bibleberry**, videos and formation resources, presented tastefully as useful ministry content rather than personal advertising or an Alexis-face promotional feed. Not an achievement dashboard.
- **Field Notebook:** progress toward selected visible goals, earned monthly discoveries, lifetime recognition and other collected accomplishments. It remains accessible even when there is no new award. The **“New Discoveries”** indicator belongs *on the Notebook Hub entry*, **not** in a separate permanent card.
- **Challenge reader:** teach faithfully and without unrelated badge prompts, counters or interruption. Useful instructional progress stays available. Quiet Reading Mode's exact controls are still open.

### Special Experiences: approved category principle, not an event production assignment

Aaron explicitly accepted **limited-time experiences** such as a potential **Holy Week 2027**, **Advent Calendar 2026** or **Praying the Hours**. These names are illustrative, not scheduled productions. Their event-specific dated collectibles are **only shown when earned**. A reader who never completes a Special Experience does **not** see that section at all.

Ordinary Challenge completion and retrospective archive access are separate from event participation windows. Both types of earned accomplishments are permanent; event availability may genuinely end. The presence of the **Special Experiences** concept **does not authorize building or launching a specific event**.

### Scripture collection and memorization boundaries

- A reader should be able to **Save Scripture** encountered anywhere in the app, as a reference independent from Saved Challenges.
- The WEBP translation remains the deliberately chosen, freely usable **in-app Bible translation**. Reader-facing explanation in an About page is a decided content direction, with final wording pending.
- **No required Sunday WEBP memorization** and no forced app-based verbatim memorization engine at launch. Optional guided memorization using the reader's **own Bible and preferred translation** is **exploratory** and distinct from ordinary saved references.
- If an honor-system “I learned it!” mark is later offered, it must not depend on quizzes, timers or claiming to verify the user's spiritual effort. Do not treat older prototype memorization fields as automatic production requirements.
- For Sunday concepts and the 12-candidate Argon idea catalogue, see [Biblical Discovery and Scripture](biblical-discovery-and-scripture.md).

## E. Field Notebook aesthetics and ministry review

**Chosen visual direction (November 6):** Aaron supplied two genuine examples of **Alexis's own illustrated Bible-study notebooks**, which readers have watched her make online. That work—not a generic naturalist or botanical moodboard—is the reference for Bibleberry's Field Notebook.

Characteristics to draw from: illustrative biblical motifs and objects, handwritten or hand-labeled annotation energy, meaningful Scripture references, topical visual clustering, visual connections, warmth, and a composed study-page feel. The digital notebook should preserve legibility and accessibility; it need not mimic the density of a photographed paper notebook.

**Collectible + record:** A reader is developing an illustrated archive of participation and discoveries, not merely a shelf of identical badges. Possible treatments include illustrated monthly-themed pages, stamps or seals for lifetime milestones, and event-specific commemorative inserts. These are **design explorations**, not a committed style taxonomy or finished assets.

The two notebook reference images were shared as conversation attachments; **they are not included as image assets in this GitHub documentation update**. Their descriptions and the chosen direction are preserved here; retrieve the actual references from the original conversation before preparing mockups.

**Alexis remains the final authority** for ministry-facing visuals and assets. Her past notebook work establishes an authentic aesthetic precedent; it is **not** proof she has approved any particular app UI, badges or artwork.

## F. Concepts explicitly not approved

- **Consecutive publication-date achievement ladder:** The former 7/14/30/60/90/120 sequence counted Challenge *release dates* and allowed archive catch-up. It remains historical brainstorming, **not** the primary progression model or an approved launch requirement.
- **Specific Special Event production:** The **principle** of time-limited Special Experiences with permanent earned-only collectibles **is approved**. But *Praying the Hours*, an Advent calendar, a Holy Week experience or any other particular event is **not approved or scheduled for launch**. There must be no wall of gray missing rewards.
- **Evolving collectible tiers:** A visually changing achievement with separate historic earned dates was proposed, but remains exploratory.
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
- **Divergence 1:** cumulative distinct Challenges as primary progression, plus monthly completion commemoratives and content-derived mini-collections. Actual-day consistency recognition remains a modest optional concept, not a punitive streak.
- **Divergence 2:** Sunday **Biblical Discovery** replaces the dedicated memorization Challenge in the intended launch lineup; self-directed own-Bible memorization guidance remains exploratory.
- **Divergence 3:** Hub discovery orientation with Field Notebook destination and a temporary **New Discoveries** overlay; progress details inside the Notebook.
- **Divergence 4:** Time-limited **Special Experiences** are acceptable with earned-only, permanently dated event collectibles; the Notebook category is hidden until first earned.
- **Divergence 5:** Alexis's actual illustrated notebook work anchors the chosen aesthetic direction; final artwork still needs Alexis's approval.

## H. Planning and implementation boundary

This file is a **product vision/decision record**, not permission for an AI coding assistant to implement its entire contents. Any engineering work must begin with scoped, approved assignments and repository/codebase review. Changes should go through branches and pull requests for Aaron to review and merge.

Before building achievement mechanics, resolve eligibility details for monthly sets and mini-collections, the meaning of completion across Challenge formats, the exact Hub/Notebook UX and art, and privacy/sync semantics. The placement *principle* is settled; its production UI is not. Preserve existing app prototypes and the separation of Sanity editorial content from private reader records.

**No application changes, artwork approval, Special Event implementation, or production data schema are authorized by this document alone.**
