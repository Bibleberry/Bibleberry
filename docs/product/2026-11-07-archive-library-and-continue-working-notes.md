# November 7, 2026 — Personal Archive, Past Teaching Library and Continue

> **Status: PROVISIONAL WORKING DESIGN, NOT A FINAL PRODUCT APPROVAL OR IMPLEMENTATION SPECIFICATION**
>
> This note records the direction of Aaron's November 7 product conversation. It preserves examples, reasoning and questions without instructing engineering agents to implement anything. If revised, update the canonical [Gamification and Achievements](gamification-and-achievements.md) register and relevant roadmap/architecture records only after further product decisions.
>
> **No UI, data model, CMS, account, gamification or launch-scope work is authorized by this document.**

## 1. The product philosophy behind the discussion

Bibleberry is a **live, ongoing ministry publishing new biblical teaching daily**, not a curriculum, devotional book or course library to be powered through. The current teaching should remain the primary invitation on the Hub. Historical theological teaching remains valuable, and readers should be free to study it, but the app should not manufacture a backlog of unfinished assignments simply because time passes.

A **first-use onboarding/tutorial experience** was proposed to explain this philosophy, how daily Challenges work, and the distinctions among current teaching, active study and historical material. Its exact scope, required/optional presentation, language and design have not been decided. Do not add an account wall; first app use, not account creation, is the participation reference in the current discussion.

## 2. Three distinct reader spaces: emerging working model

### Current teaching on the Hub

- Prioritize the latest published, current-day Challenge and relevant Bibleberry resources.
- Only **one** optional `Continue` suggestion from the Personal Archive should appear on the Hub; not a list, queue, carousel or reminder catalogue.
- The Hub should not make readers feel obligated to work through older material.
- The Field Notebook remains the permanent earned-accomplishment destination, with the previously decided temporary `New Discoveries` indicator on its Hub entry.

### Personal Archive = active workspace (Aaron's "RAM" analogy)

- A reader-curated working set of **months** the reader is actively interested in studying, not necessarily a complete historical record of every month Bibleberry has ever published.
- **Chosen capacity: zero to three reader-selected historical months, plus the separate current publication month.** Three is a **maximum, not a quota or target**. The reader may choose none, one, two, or three previous months to work on, irrespective of publication order, unfinished status or recency. Bibleberry does **not** fill historical slots with the last three unfinished or most recent months. The current month does not use a historical study slot. This preserves the working-space function and the reader's agency. Aaron explained that three months evoke a *season of life*, recognizing that participation in ministry varies. Readers can exchange or put away older months without losing progress.
- The **current publication month is separate from the three historical active slots**. If the reader first opens Bibleberry on May 20, they can access May 1–20 and all May Challenges as published, even if they do not visit again that month; unpublished Challenges remain unavailable until release. **Newly decided direction:** when a current month ends, it automatically moves to the Personal Archive as a historical active month so readers can easily find and continue what they were just following. This naturally introduces the Archive concept at a meaningful moment. **Refinement: a just-ended month must NOT automatically evict an older month that the reader has been studying more recently.** If a historical slot is free, the just-ended month can enter automatically; if all three slots are occupied, compare the ending month against active months based on qualifying recent engagement. Retain the three months with the most recent meaningful activity; May, for example, may stay in the Library if January–March are being actively studied and May was barely touched. Do not interrupt the reader with a storage-management prompt. All progress and awards remain preserved. Qualifying activity is **explicitly adding a historical month to the active workspace** or **completing a Challenge within a month**; simply opening/closing a Challenge does not qualify. Exactly how to compare a just-ended month with no completions, repeat completions, and ties still needs definition.
- If a reader skips an entire month without using Bibleberry, that month does **not** automatically occupy a historical workspace slot on their return. It remains available in the Past Teaching Library. Historical workspace selection is voluntary.
- Readers can voluntarily **Add to My Personal Archive** a month from the Past Teaching Library at any later time, exposing that month's progress and achievement opportunities.
- Readers can **Put Away** a month from their Personal Archive. It leaves their active working set and stops being a Hub `Continue` candidate. Completion data, saved reading position, earned awards and dated accomplishments are preserved. Re-adding the month restores its prior state.
- It was not decided whether automatically added current months can be put away before the month ends, or how current months should be distinguished visually from historical active months.

### Past Teaching Library = persistent catalogue (Aaron's "hard drive" analogy)

- Contains older published teaching, including months a reader missed or never experienced during their original publication.
- Readers can open and complete Challenges directly from the Library without first adding the month to their Personal Archive.
- **Gamification is hidden in the Library experience**: no visible monthly achievement goals, reward counters, unlock reveals or pressure to collect historical months.
- Completed Challenges are nevertheless **recorded normally** there. The reader's action of completing a Challenge counts as completion whether the Challenge was opened from current teaching, Personal Archive or Library.
- If a reader later adds that month to their Personal Archive, prior completed Challenges and progress are visible and count immediately toward the month's available goals. Completing the same Challenge twice does not increment lifetime distinct-completion counts.
- Library study itself should not generate Hub suggestions for a month that is *not* in the Personal Archive, under this emerging workspace model.

### Field Notebook = permanent record of earned recognition

- Preserves the actual accomplishments, including earned dates, without being a duplicate of the Library or an overwhelming backlog dashboard.
- **Lifetime milestones count distinct completed Challenges from all three study surfaces**, including the Library, even though the Library hides gameful UI. This is the latest direction reached after explicitly reconsidering whether Library completions should count.
- Monthly commemoratives and content-derived collections remain part of the established direction. The relationship between silent Library completions, automatic background award issuance, an explicit Archive add action, and *when an award's earned date is assigned* is **not settled**. Do not invent those semantics in code.
- Putting away a month never destroys an already earned award.

## 3. Hub "Continue" — proposed deterministic behavior

**Working principle:** The Hub gives **one** unobtrusive, useful way to resume active studies in the Personal Archive. It does not serve as a task list or expose every gap.

The conversation supplied the following *illustrative* routing behavior:

1. **Resume open, unfinished work.** If the relevant last-opened Challenge in the active Personal Archive is unfinished, resume it at the saved position.
2. **Otherwise move forward across published Challenges in active Archive months.** From the last completed/active position, offer the next chronological **uncompleted** Challenge. Skip all already-completed entries, including those completed out of sequence.
3. **At the end of one month, continue into later active months.** If February is complete and March 1–8 are complete, offer **March 9**.
4. **At the present-day frontier, loop backward.** When nothing remains unfinished *after the current progression point through today's published content*, find the **most recent still-incomplete month** in the active Personal Archive, and offer that month's **earliest uncompleted Challenge**. Do not force users to clear the oldest month first.
5. **Excluded months.** Months put away or only browsed in the Past Teaching Library are not Hub `Continue` candidates. Unpublished future Challenges cannot be suggested.
6. **No unfinished Archive work.** An empty, fully completed or otherwise ineligible Archive would not need a `Continue` suggestion. Exact fallback presentation is open.

### Examples explicitly discussed

| Personal Archive state / last activity | Single Hub suggestion |
| --- | --- |
| January, February and March have unfinished material. Last completed is Feb 10; Feb 11 is unfinished. | Feb 11 |
| Feb 11 completed, Feb 12–17 already complete, Feb 18 unfinished. | Feb 18, skipping completed Feb 12–17 |
| February now complete; March 1–8 complete; March 9 unfinished. | March 9, even if January still contains earlier gaps |
| March now complete, all published content through the current date is caught up, January still has gaps. | Earliest incomplete January Challenge (for example Jan 6); this is the wraparound case |
| A reader opens an active-Archive Challenge but does not finish it. | Resume that unfinished Challenge rather than skip it |

**Open edge cases:** How to select among multiple partially opened Challenges; whether opening another eligible month moves the routing anchor immediately; exact ordering when multiple incomplete months exist behind the frontier; what happens at the transition to a newly published current month; how removing/re-adding an Archive month changes the routing anchor; and precise semantics if the current day's primary Challenge overlaps with `Continue`. Do not silently declare an algorithm final from examples alone.

## 4. November 7 refinements explicitly chosen

### Three historical study slots plus the current month

Aaron reconsidered the earlier unlimited-month idea and **explicitly chose a maximum of three reader-selected active historical months, in addition to the separate current publication month**. There is **no minimum**: zero, one, two or three historical months are all valid. The user chooses which months to activate; neither completion gaps nor publication recency should automatically fill the slots. This is a product-direction decision, not merely a candidate capacity. Newly finished current months can be **automatically admitted where a slot is available**, or when they outrank a less recently studied month if full; the calendar change alone does not override someone's active work. Readers can still put months away and have fewer than three.

The *season-of-life* rationale matters: the Archive should accommodate periods when someone participates more deeply or less deeply without accumulating an overwhelming backlog. Limiting active historical studies does not limit access to teaching in the Library. `Put Away` preserves progress and awards.

**Clarified month-end behavior:** The immediately preceding publication month should become readily findable as soon as the new month begins. If the reader has space among their three historical active slots, it can enter the Personal Archive automatically; the transition can also serve as contextual education about the Archive. **Important refinement when full:** Do **not** force the just-ended month into the Archive if doing so would evict another month the reader has been more recently and intentionally working on. Compare the just-ended month with the three active historical months; keep the three with the most recent qualifying activity, leaving the just-ended month in the Library if it does not merit a slot. Aaron's example was readers deliberately working backward through old months to catch up: a mere calendar change must not undo their chosen workspace. No interruptive storage-management chore (Aaron compared it to a Stardew Valley storage chest). *Least recently worked on* refers to meaningful reader activity, not publication chronology. **Qualifying activity is (a) explicitly adding a month to the active workspace or (b) completing a Challenge in that month.** Aaron clarified that choosing a month can represent a genuine future study plan, such as setting it aside for a plane trip next month; an untouched but newly added month should therefore not be treated as having no activity. **Opening or closing a Challenge without completion does not update rotation recency.** This differs from the Hub Continue feature, which can resume an opened-but-unfinished Challenge. Adding a month affects workspace recency but is **not itself a Challenge completion or an earned achievement**. Further clarify whether re-adding a month refreshes recency (plausible under explicit add), how automatic rollover establishes initial recency, repeat-completion effects, and equal recency before implementation. Final naming is deferred; *Archive*, *Library* and *workspace* are conceptual working labels, not approved reader-facing product names.

### Achievement notification placement

Aaron explicitly confirmed that the **entire Challenge reading session remains distraction-free**: no achievement announcements, collectible unlock reveals, reward counters or unrelated gamification interruptions while someone is engaged in teaching.

An achievement may be recorded when earned, but its **in-app notification is deferred until outside the Challenge reader**. The reader may first encounter it after returning to the Hub. The notification can inform them of the earned award and offer a way to visit the Field Notebook.

Exact visual treatment, aggregation of multiple simultaneous awards, dismissal behavior and interaction with Quiet Reading Mode are still open. This does **not** authorize engineering to implement a notification system.

## 5. Relationship to existing November 6 decisions

This **working model does not repeal** the previously adopted decisions that:
- every Challenge is substantive biblical teaching, and content is not distorted by gamification;
- lifetime progression counts **distinct** completed Challenges once;
- archived study remains possible, without punitive streaks or time-gated sincerity checks;
- achievements stay permanently earned and dated;
- the Hub prioritizes discovery/current teaching, and the Field Notebook contains achievement detail;
- the Challenge reader stays focused and avoids intrusive rewards;
- minimal durable completion data should be the foundation, rather than speculative event sourcing.

The earlier open question of historical-month eligibility is being reframed: **available** Library material is distinct from months **actively brought into** the Personal Archive. This is exploratory product behavior, not yet a settled eligibility contract.

## 6. Questions before product approval and engineering

1. **Membership and availability:** Precise first-use/month activation behavior, including anonymous guests, device loss and returning after inactivity. **Month-end placement is automatic where there's capacity; when full, reader engagement has precedence over calendar recency.** A just-ended month can remain in the Library rather than displace a more recently studied historical month. Qualifying activity is **explicit month addition or Challenge completion**, not merely opening/closing. Re-additions, low/no-activity month comparisons, repeat completions and ties need final definitions.
2. **Completion versus award eligibility:** Do achievements for a historically completed month get *awarded* while studying silently in Library, or only upon adding the month? What date should each award keep? Ensure no loss or rewriting of genuine earned history.
3. **Progress preservation:** Define `Put Away` as a visibility/workspace operation rather than deletion. Clarify if removing a month affects only Hub suggestions or other views as well.
4. **Continue selector:** Confirm a deterministic ordering/recency rule for ties, cross-month gaps, the frontier and manual navigation.
5. **Onboarding:** Explain that Bibleberry is a **live ministry**, the current teaching is primary, older teaching is accessible, and the Personal Archive is a focused workspace. Use the first month-end transition as an opportunity for a contextual introduction to the Archive, because the reader is likely to seek the material they were just following. UX and wording require separate review.
6. **Award notifications:** Define post-reader notice timing (possibly on the Hub), multiple awards, dismissal and Quiet Reading Mode, without interrupting Challenge reading.
7. **Scope/timing:** Decide what can ship at launch and what should be deferred; validate against A3 durable participation identity/persistence without prematurely expanding A3's authorized engineering scope.

## 7. November 7 Field Notebook collectible card directions

> **Product direction agreed in conversation, not an approved implementation spec or artwork package.** Alexis remains the editorial/theological and visual approval authority.

### Permanent thematic discovery collectibles

- **Every completed content-derived monthly mini-collection should earn a permanent collectible.** This is an explicit choice, replacing earlier uncertainty about whether mini-collections merely showed progress or yielded a lasting object.
- In the Notebook, a collectible can have a concise, visually appealing collection-level presentation: illustration, title, source month and earned date.
- Tapping it opens a more substantial **collectible card screen** with its image, key Scripture references, relevant verse text displayed in Bibleberry's **WEBP** translation, and a **short explanatory teaching note**.
- The explanation should go beyond word-matching. It can show the theological, narrative, symbolic or semiotic relationships that Alexis draws across the passages. A discussed illustrative card topic was **"Jacob's Well"**, connecting the Jacob traditions to Jesus' encounter with the Samaritan woman in John 4. **Exact historical/OT references and wording still require editorial verification**; no final claim or published copy has been approved.
- This is a miniature study artifact rather than a badge with a decorative tooltip. It remains concise and should be composed from Alexis's actual teaching, never requiring her to produce a separate curriculum to satisfy an award.

### Monthly full-completion commemorative card

- Aaron explicitly chose **a substantive monthly summary card (Option B)** rather than a mostly decorative record.
- A monthly commemorative can open to a card showing its art, month and theme, earned date, **key passages**, and a **short account of what that month's teaching emphasized**.
- This is distinct from the more narrowly focused **thematic discovery card**: the monthly card recalls the entire month or teaching season, whereas a discovery card explains a specific motif or connection.
- Suggested language such as "memory stone" was an analogy in discussion, not approved reader-facing terminology.

### Consistent Bibleberry illustration language (reaffirmed)

Aaron reaffirmed that the choice is **not** between distinct monthly artwork and a cohesive collection. **All collectible artwork should share an overarching, recognizable Bibleberry visual style**, with Alexis's actual illustrated Bible-study notebooks as the primary stylistic guidance. Individual subjects, symbols, card images and monthly themes can differ while remaining part of the same artistic family. Do not invent an alternate generic botanical style or require each month to repeat the same image. Specific compositions, templates, palette refinements and the finished artwork remain subject to Alexis's ministry-facing visual approval.

### Monthly illustration requirement and editorial flexibility

**Decided:** Every full-month completion commemorative will have a distinct illustration within Bibleberry's established Alexis-notebook-inspired visual language. **The actual illustrated subject is not decided in advance**; it depends on the biblical teaching, theme and season of that month and remains under Alexis's editorial/visual authority.

**Development boundary:** The software should support a per-month illustration and corresponding commemorative card content as ordinary configurable editorial assets. Choosing or producing that illustration is **not a prerequisite to designing the reusable card behavior** and must not constrain the month's Challenges. No specific month's artwork, illustration production plan or final UI has been approved here.

### Different card types

Lifetime Challenge milestones and Special Experience commemoratives may need their own simpler participation-focused card treatments. **Do not assume they require exegetical summaries or that every collectible has the same card template.** Their details remain open.

**Open product/editorial questions:** How many reference verses belong on a card, whether quoted WEBP verses are full/partial, whether Scripture saving is available within cards, creation/review process and CMS data shape, how cards display on small screens, and which awards notify readers outside Challenge sessions. These are not approved implementation details.

## 8. November 7 refinement: straightforward lifetime Challenge-count milestones

> **Chosen milestone direction and initial thresholds, not an engineering assignment.** Artwork, reveal treatment and any milestones beyond 365 remain open.

Aaron first explored anniversary-style labels, then clarified that he does **not** want these awards named as periods of time such as "One Month Completed" or "Three Months Completed". The collectible names should plainly describe the **number of distinct Challenges completed**:

- **7 Challenges Completed**
- **30 Challenges Completed**
- **100 Challenges Completed**
- **200 Challenges Completed**
- **365 Challenges Completed** — at this point the award may additionally use the meaningful phrase **"A Year's Worth"** of Challenges.

The **365** milestone is the point at which time-equivalent wording becomes appropriate. The previous provisional 90- and 180-Challenge equivalents are **superseded**, not approved milestones. Further achievements after 365 have **not** been specified.

These milestones count completed **distinct Challenges**, regardless of whether the reader worked through current teaching, their selected historical workspace, or the Past Teaching Library. They are **not membership anniversaries, attendance streaks, consecutive-publication-date requirements, or calendar-day attendance measures**. Repeating an already completed Challenge must not inflate the lifetime total. Gamification remains hidden while reading in the Library and must not interrupt Challenge teaching.

**Still open:** Specific art and card design for the lifetime series, notification behavior outside the reader, whether 365 has a distinctive explanatory subtitle, and any post-365 progression. Do not manufacture additional thresholds.

## Status and process

The discussion generated a coherent **working hypothesis** for organizing personal participation. Aaron explicitly encouraged recording this level of detail even where final decisions have **not** been made. Keep proposals labeled as provisional until reviewed and accepted. Do not issue implementation tasks, alter participation stores or merge this documentation without Aaron's review.
