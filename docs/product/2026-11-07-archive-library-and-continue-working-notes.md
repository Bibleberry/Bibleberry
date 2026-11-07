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
- **Chosen capacity: three active historical months, plus the current publication month.** The current month does not consume one of the three historical study slots. This preserves the Archive as an intentional workspace instead of a second Library. Aaron explained that three months represent a *season of life*, recognizing that participation in ministry naturally varies across life's seasons. Readers can exchange older months with `Put Away`, without losing progress.
- When the reader first opens Bibleberry **during a publication month**, that month enters their Personal Archive automatically. All Challenges for that month enter the reader's available month as **each is published**, even if the reader does not visit again during that month. A reader first opening the app on May 20 can access May 1–20 and subsequently published May Challenges, not unpublished future Challenges.
- If a reader skips an entire month without using Bibleberry, that month does **not** automatically appear in their Personal Archive on their return. It remains available in the Past Teaching Library.
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

Aaron reconsidered the earlier unlimited-month idea and **explicitly chose three active historical months in addition to the current publication month**. This is a product-direction decision, not merely a candidate capacity.

The *season-of-life* rationale matters: the Archive should accommodate periods when someone participates more deeply or less deeply without accumulating an overwhelming backlog. Limiting active historical studies does not limit access to teaching in the Library. `Put Away` preserves progress and awards.

**Still open:** What happens when the current month ends while the three historical slots are already full; whether the current month can be put away; how the interface explains these transitions. Do not assume automatic eviction.

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

1. **Membership and availability:** Precise first-use/month activation behavior, including anonymous guests, device loss, returning after inactivity, current-month `Put Away` options and month-end transitions when the three historical slots are full.
2. **Completion versus award eligibility:** Do achievements for a historically completed month get *awarded* while studying silently in Library, or only upon adding the month? What date should each award keep? Ensure no loss or rewriting of genuine earned history.
3. **Progress preservation:** Define `Put Away` as a visibility/workspace operation rather than deletion. Clarify if removing a month affects only Hub suggestions or other views as well.
4. **Continue selector:** Confirm a deterministic ordering/recency rule for ties, cross-month gaps, the frontier and manual navigation.
5. **Onboarding:** Explain that Bibleberry is a **live ministry**, the current teaching is primary, older teaching is accessible, and the Personal Archive is optional reader-managed workspace. UX and wording require separate review.
6. **Award notifications:** Define post-reader notice timing (possibly on the Hub), multiple awards, dismissal and Quiet Reading Mode, without interrupting Challenge reading.
7. **Scope/timing:** Decide what can ship at launch and what should be deferred; validate against A3 durable participation identity/persistence without prematurely expanding A3's authorized engineering scope.

## Status and process

The discussion generated a coherent **working hypothesis** for organizing personal participation. Aaron explicitly encouraged recording this level of detail even where final decisions have **not** been made. Keep proposals labeled as provisional until reviewed and accepted. Do not issue implementation tasks, alter participation stores or merge this documentation without Aaron's review.
