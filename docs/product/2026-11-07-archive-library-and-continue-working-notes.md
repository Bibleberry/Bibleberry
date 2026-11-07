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
- Monthly commemoratives and content-derived collections remain part of the established direction. **All Challenge completions, including those made directly in the Library, contribute to and may complete monthly commemoratives and thematic mini-collections automatically.** Awards are earned and stored even when gameful progress and notifications are hidden in the Library. **Adding a month to the Personal Archive is not a prerequisite for earning its awards.** Earned cards appear in the Field Notebook, with dates earned; exact award timestamp edge cases and delayed notification behavior remain to be specified.
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
2. **Award recording and reveal:** Historical-library completions **do earn** the corresponding full-month and thematic awards without the month being added to the Archive. Define exact earned-date/timestamp semantics and delayed out-of-reader notification behavior, without losing or rewriting earned history.
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

### Full-month completion Scripture collectible (November 7 clarification supersedes "monthly summary" treatment)

**Decided:** Completing every published Challenge assigned to a month earns **one more illustrated, Scripture-related collectible card**, just like the other thematic cards in the Field Notebook. The **unlock requirement** differs: complete the whole month's teaching instead of fulfilling a narrower topic- or motif-based discovery goal.

- **Do not title or present the card merely as "November 2026", "Month Completed", or a month-completion certificate.** Its reader-facing title and illustrated subject are a meaningful biblical concept, image, passage or connection chosen in light of Alexis's actual teaching that month.
- **Do not force the card to be a generic recap of the month's contents.** The prior proposal for a monthly-summary-card *as a separate type of card* is superseded by Aaron's clarification: the reward itself is another substantive Scripture card. Alexis may select a theme that helps synthesize the month, but that's an editorial choice, not a template constraint.
- The publication month, completion mechanism and earned date can remain **metadata** that allow it to appear in the correct month within the Notebook and be distinguished from narrower thematic mini-collections, without dictating its title or subject.
- As with other thematic Scripture collectibles, the card can include approved Bibleberry-style illustration, relevant Scripture references / WEBP passage text and a concise biblical/theological explanation derived from Alexis's teaching.
- This is the **final monthly reward**: it cannot be earned merely by completing all Challenges published so far while future Challenges in that month remain scheduled. All Challenges belonging to the month's final published set must actually be available and completed first. Thematic discovery cards may be earned earlier. Completion through the historical Library also earns the full-month card, without interruptive gamification there.
- Editorial additions, withdrawals or changes to an already-published month's eligible Challenge set still require an explicit rule.

### Consistent Bibleberry illustration language (reaffirmed)

Aaron reaffirmed that the choice is **not** between distinct monthly artwork and a cohesive collection. **All collectible artwork should share an overarching, recognizable Bibleberry visual style**, with Alexis's actual illustrated Bible-study notebooks as the primary stylistic guidance. Individual subjects, symbols, card images and monthly themes can differ while remaining part of the same artistic family. Do not invent an alternate generic botanical style or require each month to repeat the same image. Specific compositions, templates, palette refinements and the finished artwork remain subject to Alexis's ministry-facing visual approval.

### Monthly illustration requirement and editorial flexibility

**Decided:** Every full-month completion commemorative will have a distinct illustration within Bibleberry's established Alexis-notebook-inspired visual language. **The actual illustrated subject is not decided in advance**; it depends on the biblical teaching, theme and season of that month and remains under Alexis's editorial/visual authority.

**Development boundary:** The software should support a per-month illustration and corresponding commemorative card content as ordinary configurable editorial assets. Choosing or producing that illustration is **not a prerequisite to designing the reusable card behavior** and must not constrain the month's Challenges. No specific month's artwork, illustration production plan or final UI has been approved here.

### Different card types

**Both thematic discovery cards and the full-month completion reward are Scripture-focused collectible cards**, not two radically different classes of artifact. Their *earning conditions* differ, and their artwork/content differ according to Alexis's teaching. Special Experience commemoratives may need another treatment; do not force every special event into the same editorial template. Lifetime Challenge recognition is now an evolving Notebook status, not a series of separate collectible cards (see Section 8).

**Open product/editorial questions:** How many reference verses belong on a card, whether quoted WEBP verses are full/partial, whether Scripture saving is available within cards, creation/review process and CMS data shape, how cards display on small screens, and which awards notify readers outside Challenge sessions. These are not approved implementation details.

## 8. November 7 latest direction: one evolving lifetime participation status, not permanent milestone cards

> **This section supersedes the earlier discussions of collectible lifetime badges, a separate Lifetime Achievements page, and a row of annual awards.** This is a product-design direction, not an instruction to implement.

Aaron questioned the long-term value of having badges like "7 Challenges Completed" or "30 Challenges Completed" permanently visible years later. **Rather than collecting lifetime award cards, the Field Notebook should display one changing lifetime participation status.** As the reader surpasses milestones, the new status **replaces** the previous one. It can become a modest status section or, for multi-year achievement, a distinguished Notebook heading. There is no need to retain expired participation tiers as visible collectibles.

The previously discussed **cumulative distinct-Challenge thresholds** remain a useful conceptual basis: 7, 30, 100, 200 and 365 completed Challenges, then new year-equivalent status each 365 additional distinct Challenges (730, 1,095, 1,460, etc.). However, **these are NOT individual cards or required titles**. Aaron is now considering reader-friendly descriptors such as "One Week", "Three Months", then years'-worth wording as appropriate. The exact labels, whether every initial threshold still deserves a visible status change, and final heading presentation remain to be refined; do not conflate the labels with elapsed membership or attendance streaks.

These totals count **distinct Challenges completed** in current teaching, Personal Archive or Past Teaching Library, without double counting, and they do not measure consecutive days or elapsed account age. No advance-to-next-goal progress bar is wanted. The actual total count might appear discreetly if useful, but there is **no dedicated Lifetime Achievements page**.

This distinguishes **an evolving acknowledgement of how much teaching the reader has completed** from **permanent illustrated collectibles**. Monthly full-completion commemoratives, content-derived thematic discoveries, and qualifying Special Experiences remain lasting cards with earned dates and meaningful content. The "All Earned Cards" gallery should not fill up with obsolete lifetime participation stages.

## 9. November 7 Field Notebook navigation: Year → Month, and All Earned Cards

> **Reader experience direction agreed in discussion.** This is not an approved visual mockup or final engineering specification.

### View 1: Years, with all 12 months

The Field Notebook can be browsed by **year → 12 month blocks → that month's earned collectibles**. **Every month block appears in its normal presentation, whether or not the reader participated or earned anything.** Empty months are not grayed out, labeled as missing, or framed as a failure. Tapping a month opens its associated monthly commemorative and thematic discovery cards, if earned. Each card opens its illustrated biblical study or monthly-summary detail screen.

A month screen also offers relevant ways to access the underlying teaching: **add that month to the Personal Archive (active workspace)** or **explore it in the Past Teaching Library**. Archive capacity remains three historical months plus the separate current teaching. Past or future availability rules must be respected: never imply that unpublished Challenges can already be studied. Exact action placement and behavior when the month is already active are UI questions.

The year/month hierarchy follows the **publication month that the content and collectibles belong to**, **not necessarily the month in which the award was earned**. For example, someone who completes March's teaching from the Library in October earns March's collectibles, which appear under March of that publication year, with the true October earned date shown on their cards.

### Partially completed months: discovery goals reveal after initial earned achievement

**Decision (November 7): Choose A, conditional on the reader having earned at least one achievement associated with that month.** Aaron's reasoning: earning a monthly-related achievement demonstrates enough interest in the month's teaching that the Field Notebook can show **what else could be earned by continuing**.

- Before earning anything tied to a month, its block is still present normally in the year grid. Its Notebook month detail does **not** present a wall of unearned thematic achievements or outstanding objectives.
- Once the reader earns **at least one achievement from that month's teaching**, the month detail shows both **earned illustrated cards** and the **remaining available thematic discoveries**, with intelligible requirements and progress (for example, '2 of 4 Challenges completed').
- Earning an achievement in the historical Library qualifies in exactly the same way as earning it in the active Archive/current teaching. The Library itself remains free of gamification presentation; readers encounter this information when they deliberately visit the Notebook.
- This is **not** an invitation to make Bibleberry teaching depend on goals or to gray out whole calendar months. Specific visual treatment of earned versus available discovery cards remains an Alexis-approved design decision.

This rule concerns **achievements associated with that publication month**, not arbitrary lifetime participation statuses earned on a date within the month. Edge cases such as a month containing no thematic mini-collections can be handled in normal UI specifications.

### View 2: All Earned Cards, organized in collectible families

Provide a **separate, browsable scrolling view of every collectible actually earned**, independent of knowing its source month. Aaron clarified that **All Earned Cards should be divided into coherent groups** so related cards stay together:

- **Monthly Challenges** (working group label): includes full-month completion commemoratives and the thematic discovery cards drawn from that month's Challenges.
- **Special Experiences**: includes only the time-limited special event cards the reader has earned. The group **does not appear until at least one Special Experience card has been earned**, consistent with the existing earned-only rule.

Within each group, default to **newest earned first** (actual earned date), preserving the earlier preference for most recent accomplishments at the top without interleaving special-event cards among monthly cards. This refines the earlier global newest-first ordering. One card opens the same illustrated theological detail from either this gallery or its publication-month view; these are views of the **same earned record**, not duplicates.

Readers can find a remembered illustrated subject without knowing its publication month. Search, filtering and alternative sort controls have not been established as needed. **Lifetime participation statuses are evolving headings/status, not permanent cards**, and therefore do not accumulate in All Earned Cards. The exact section title and visual grouping treatment await design review.

### Silent Library awards, visible Notebook records

**The Library hides all in-context gamification, but it does not disable earning.** Challenge completions there count toward lifetime totals, monthly full-completion commemoratives, and thematic mini-collections exactly as they do elsewhere. Qualifying awards are **recorded and visible in the Field Notebook even if the reader never adds that month to the Personal Archive**. The Library should not show reward progress, celebrations or collector prompts during study. Achievement notifications, if shown, occur outside the active Challenge reading session under the existing decision.

### Evolving lifetime status and special collections

Rather than a dedicated Lifetime Achievements page, a **single current lifetime participation status** lives within the Field Notebook itself. It updates and replaces its preceding stage as more distinct Challenges are completed. The exact presentation may become a Notebook heading for years'-worth achievements. This is **not a permanent card collection** and has no separate 7-, 30-, 100-, or 200-Challenge badges that remain visible forever, nor a target-progress indicator. A simple total-count readout can be considered as part of the Notebook rather than a separate stats screen.

Special Experiences remain **earned-only**, and their dedicated section stays hidden until the first earned Special Experience collectible, consistent with the November 6 decision. Do not show gray missed-special-event placeholders just because the 12-month publication grid is always visible.

**Remaining UI questions:** visual treatment of month details with no earned cards (remaining goals become visible only after earning an achievement associated with the month); whether readers later need search/filter or alternative sorting; exact lifetime status wording and placement, whether to show the current distinct-Challenge total, and final visual treatment of the grouped earned-card gallery; treatment of months that have not yet published; and Alexis's approval of the visual design. The default All Earned Cards order is now decided as newest earned first. No new feature or build work is authorized by this record.

## Status and process

The discussion generated a coherent **working hypothesis** for organizing personal participation. Aaron explicitly encouraged recording this level of detail even where final decisions have **not** been made. Keep proposals labeled as provisional until reviewed and accepted. Do not issue implementation tasks, alter participation stores or merge this documentation without Aaron's review.
