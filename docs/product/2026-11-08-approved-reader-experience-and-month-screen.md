# Bibleberry — Approved Reader Experience, Month Screen & Field Notebook

> **APPROVED PRODUCT DIRECTION — AUTHORITATIVE AS OF NOVEMBER 8, 2026**  
> **Approval:** Aaron Waid, Bibleberry product owner, explicitly confirmed that the decisions made in the November 6–8 design discussion are authoritative and supersede conflicting earlier proposals, research suggestions, handoffs, mockups and backlog descriptions.  
> **Scope:** Product behavior, information architecture responsibilities, participation and achievement rules. This document is **not evidence that a feature has been built** and does **not** independently authorize implementation, merging, a deployment, a particular event, or editorial publication.  
> **Primary owners:** Aaron approves product and creative implementation direction. Alexis creates and controls the substantive theological teaching; achievements are derived from that teaching and may not dictate it. Aaron can approve product designs and card concepts without inventing an additional Alexis sign-off gate for every item. Actual manuscript/theological adaptations remain subject to appropriate editorial review.  
> **Read with:** [Gamification & Achievements](gamification-and-achievements.md), [Product Roadmap](application-development-roadmap.md), [Accounts & Sync](../architecture/user-accounts-and-sync.md), [November 7 historical notes](2026-11-07-archive-library-and-continue-working-notes.md) and the [AI Development Protocol](../ai-development-protocol.md).

## 1. Authority and how to interpret older plans

**This is the current product authority for the subjects covered.** When older documents or Issues disagree, use the November 8 decisions here and update or flag the older material before building. Earlier design-session transcripts and research reports remain historical evidence, **not parallel product specifications**. Don't reintroduce superseded features because they appear in an unmodified Issue, a handoff, a mockup, or code fixture. Technical/UX details expressly marked *deferred* are **not silently approved**.

Bibleberry is **first a continuously publishing Christian teaching ministry**, and also a personal learning and formation experience. The current teaching remains central on the Hub. The reward system complements Alexis's work; it does not drive curriculum, determine theological subjects, dictate pacing/length or create compulsory content.

### Fourteen retained core principles

1. Ministry-first architecture: substantive current Christian teaching is the foundation, not gamification.
2. No punitive daily login streaks, attendance resets, mandatory backlog, rankings or holiness scores.
3. All ordinary historical daily Challenges remain available in the Library after publication.
4. One focused historical **Shelf** with **zero to three months**, distinct from the current month and complete historical **Library**.
5. Completing a Challenge counts identically from the Hub/current month, Shelf or Library.
6. Both thematic discovery completion and finishing all Challenges in a month earn substantive illustrated **Scripture cards**, not generic certificates or ordinary game badges.
7. Achievement visibility is hybrid: monthly goals visible within an active Month Screen; no huge wall of unearned cards in the permanent collection, and no fully surprise-only goal system.
8. One evolving lifetime participation status from **distinct** Challenge completions; no accumulating lifetime milestone badges.
9. Distraction-free teaching reader: no unrelated achievement pop-ups, tickers or announcements during the Challenge.
10. Earned cards, awarded dates and completion history are durable, permanent and non-regressive.
11. Record the minimum reliable facts necessary for participation and sync; exhaustive event sourcing is not a product requirement.
12. Scripture may be saved from anywhere in the app independent of collectible earning; do not turn Bibleberry into a compulsory memorization engine.
13. Genuine illustrated Bible-notebook/field-book identity grounded in Alexis's work, not a generic gaming badge aesthetic. Specific artwork/layout remains to be developed.
14. Alexis's existing teaching generates the discoverable subjects; do not add, remove, rearrange or distort teaching to manufacture rewards or force daily progress.

## 2. Screens and their distinct responsibilities

| Place | Primary purpose and approved behavior |
| --- | --- |
| **Hub** | Current teaching and ministry resources take priority. A single unobtrusive **Continue** suggestion may resume focused historical study. New **earned-card announcements** occur **only when entering/returning to Hub**, not simply on leaving any reader. The Notebook can show a **New Discoveries** indicator. Hub is not an achievement backlog dashboard. |
| **Month Screen — NEW REQUIRED PRODUCT COMPONENT** | One coherent landing screen per publication month, current or historical. Shows month completion and a **calendar** of its Challenges, their availability/completion states, and **Monthly Discoveries** including progress to earn cards. Accessible in the current-month flow and when browsing months through Shelf or Library. |
| **Shelf** | Focused historical working space for up to three months selected/protected by the reader or admitted under the approved rollover rules. Current month is not a Shelf slot. |
| **Library** | Complete catalogue of ordinary past teaching. Readers can access, finish and earn credit directly here without placing a month on Shelf. Its catalogue and Challenge reading are not an achievement-promotion feed, but opening a month leads to that month's normal Month Screen with progress and discoveries. |
| **Field Notebook** | Lasting, browsable record of **earned** Scripture cards, grouped by publication year/month with a separate **All Earned Cards** gallery, one evolving lifetime status, and an earned-only Special Experiences area. No personal journaling feature. |
| **Saved Scripture** | Separate app-wide collection of Scripture references/readers' saved passages, independent of challenges, earned cards and any future optional memorization guidance. |
| **Ministry news / What's New** | Editorial updates, including the recurring next-month preview announcement. News is not a second achievement notification stream. |

**Whole-app global navigation placement remains deferred.** This screen-responsibility map does not prematurely choose tabs, hierarchy or hide Foundations, Saved Scripture, ministry updates or other roadmap features.

## 3. Month Screen — approved new feature

The Month Screen is **calendar-based, not an ordinary 30/31-row list**. At a minimum:

- Display the month's title/theme and a clear **completed Challenges out of total** count or ticker, e.g. **18 of 30**.
- Show **all** the month's daily Challenge titles from the beginning. The ministry prepares the complete month's teaching ahead of release. **Completed**, **available**, and **not yet released / Coming Soon** states must be distinguishable.
- Upcoming Challenge **titles** are visible, but unreleased Challenge content is inaccessible until its assigned reader-local release date. Release enforcement is server-authoritative; the reader's device clock must not be trusted as authorization.
- Include the month's one-time **Introduction** and a persistent **Read Monthly Introduction** link so a reader can revisit it without seeing it automatically again.
- Below the calendar, display **Monthly Discoveries** with their titles and numeric progress; place the **full-month completion card goal last** in that section.
- Finishing a Challenge from this Month Screen returns the reader **here**, updates its completion ticker and discovery progress promptly, and does **not** produce an on-screen toast or award notification. Awards wait for the next Hub visit.

**Deferred UX:** Seven-column calendar grid versus spacious week-by-week calendar, exact day cell/title layout, scroll and mobile detail treatments. Build mockups later; do not quietly replace the approved calendar with a list.

### 3.1 Monthly Discoveries: goal visible, reward secret

- A reader who begins the month can see **the available thematic discovery titles and their progress**. **Do not require earning a first card** to reveal the goals. This explicitly supersedes the November 7 first-earned-card rule.
- Example: **Dogs in the Bible — 1 of 3**. This is a *treasure hunt*. It is intended to elicit curiosity about which biblical references the month's teaching will uncover.
- **Unearned discovery:** Show **title and numeric progress only**. No illustration, Scripture card image, Scripture text/explanation, teaser, hidden Challenge list, tap target, detail view or links revealing where to find it.
- Do **not** identify the qualifying Challenges or offer a map to their locations. A reader finds the references/subjects through completing the actual teaching.
- **Earned discovery:** Reveal an illustrated **badge/thumbnail** (likely derived from the card's illustration). Tapping it on the Month Screen opens the **full illustrated Scripture card** directly, without first visiting the Field Notebook.
- The permanent **All Earned Cards** collection shows **only earned cards**; it does not display unearned gray placeholders. The Month Screen can show work-in-progress goals without leaking future card artwork.
- **Full-month reward:** Show a visible goal such as **18 of 30 Challenges**, placed **after** the thematic discoveries. The complete Scripture card and illustration remain hidden until every Challenge in that finalized month is finished. This reward is a substantive Scripture card, not a certificate.
- Completing **every Challenge in the month guarantees earning every monthly thematic discovery card** as well as its full-month card. There are no additional hidden tasks.
- Thematic discoveries arise from Alexis's already-prepared Challenges; occurrences can be spread throughout the month. Some Challenges contribute to more than one discovery; others to none. **Do not engineer daily progress just to award something every day.**
- **A discovery is recorded only when the associated Challenge is finished.** Simply reaching its text, reading the last screen, saving, opening or exiting does not award discovery credit. One Challenge completion may update multiple thematic counters.
- Partial discovery progress updates **silently** on the Month Screen; no routine progress notification. Actual earned-card announcements follow the Hub rules below.
- During **advance preview only**, monthly discovery titles and goals are **not exposed**. They become part of the normal Month Screen once the month begins.

## 4. Monthly publication preview and introduction

### 4.1 Preview calendar

- On the **28th of the preceding month**, or **February 27**, the next month's preview becomes visible and can be featured as a **Bibleberry ministry news event**. This is grounded in the ministry's established advance monthly editorial release practice.
- During this advance-preview interval, the upcoming month is a **placeholder/preview destination**, showing teaching theme/introduction and upcoming Challenge titles. It does **not** reveal Monthly Discoveries or make future Challenge content available.
- A dedicated, swipe-through **Introduction to the Month** is planned. The **four-screen** example is a working content-flow concept, **not a final mandated screen count**.
- The last introduction screen is **“Welcome to [MONTH'S THEME]”** and is **not shown during the advance-preview period**. It appears once the month actually begins.
- On/after the month begins, a first-time reader of that month sees the introduction including the welcome; a reader who already viewed the advance preview may **Skip to Welcome** or replay the full introduction. This is a reader choice, not a forced repetition.
- After the month introduction/welcome has been experienced, subsequent visits open the Month Screen normally. The link to replay the introduction remains available at any time.
- **Historical months:** If a reader first encounters an older month in Shelf/Library, show its full introduction and Welcome once, then use the Month Screen normally on future visits. Avoid repeated automatic introduction prompts.
- What Alexis writes on each introduction screen, preview artwork and exact interactions remain future design/editorial work.

## 5. Completion, context and announcements

### 5.1 Explicit final navigation

- The final navigation control for a teaching Challenge reads **Finish**, prominently, rather than “Next”.
- Tapping **Finish** is the action that **records completion** and thereby qualifies the Challenge for its monthly discoveries and lifetime total; there is **no second completion-confirmation screen** or unrelated timer.
- Arriving on the last screen and leaving without tapping Finish leaves the Challenge **unfinished**; save its resume position. For other Challenge formats, define an intrinsic Finish/complete contract consistent with their real activity; optional deeper content remains optional.
- The reader returns to **the origin context** on Finish: Hub-origin Challenges return to Hub, Month Screen-origin Challenges return there, Shelf-origin work returns to Shelf context, Library-origin work returns to Library context. Preserve browsing continuity.

### 5.2 Hub-exclusive earned-card announcements

- Awards are issued and stored **immediately on Finish** when criteria are met, even if the reader is in the Library or opted out of announcements.
- Completing a Challenge updates completion/discovery progress where it is shown. **Do not show partial-progress notices.**
- **Earned-card announcement trigger: the reader arrives at/returns to the Hub.** Neither exiting the reader into Shelf/Library/Month Screen nor opening an earned badge elsewhere triggers the announcement.
- Announce all newly unannounced earned cards as **one combined message**, never a queue of separate celebrations. If the reader leaves the app before reaching Hub, keep the pending award announcement for the next Hub visit, including a later app session.
- Announcement opt-out affects **presentation only**: it does not disable earning, dates, Notebook or New markers. If notifications are turned back on, show **one combined catch-up announcement** for previously suppressed awards (not repeated individually).
- One-time announcement dismissal/acknowledgment is distinct from indicators: Hub **New Discoveries** clears when the **Field Notebook opens**, while each earned card's **New** status persists until **that particular card is opened**, whether accessed from the Month Screen or Notebook. Dismissing a Hub announcement does not automatically mark cards viewed.
- The exact illustration/wording of an announcement and settings location are UX work. No separate broad Quiet Reading mode is required by this decision.

## 6. Shelf, Library and returning to historical teaching

**Approved reader-facing names: Shelf and Library.** Supersede older “Personal Archive” and “Past Teaching Library” labels in future UI/specifications. Historical documents retain the old names solely as dated context.

- **Current month** is separate and always discoverable; the **Shelf** holds **0–3 historical months**, never automatically padded to three.
- At rollover, a just-ended month with **at least one completed Challenge** is eligible for automatic admission. If the Shelf has a free slot, admit it.
- The Shelf distinguishes **reader-selected/protected** months from **automatically admitted** months. Explicit selection/protection is respected even if the reader has not yet completed another Challenge there.
- With all three slots full, an eligible just-ended month may replace the **oldest automatically admitted** month. **Never automatically evict a reader-selected/protected month.** If all three are protected, the just-ended month remains in Library.
- Reader can **keep/protect** an auto-admitted month; wording remains UX work. Reader may **Put Away** a Shelf month at will, which removes workspace membership without deleting any completion, earned award, saved Scripture or resume location.
- A reader's deliberately chosen **active study focus** is separate from incidental Library activity, Shelf membership, or the last thing opened. Merely browsing elsewhere does not redirect focus.
- Hub should offer **only one** low-key Continue suggestion, prioritizing an unfinished Challenge in the active focus. When a focus month is finished, it may suggest the next active unfinished month **without silently rewriting the formal focus**. No mandatory backlogs.
- If a reader was interrupted in a just-ended Challenge, preserve its progress **even if that month did not enter Shelf**. A temporary resume suggestion may surface on the **first visit after rollover**, then normal focus resumes. The exact “first visit” technical definition is deferred.
- Readers may complete Challenges directly through Library without activating Shelf membership; award eligibility is exactly the same as through any other route.
- The historical Library's **catalogue/reading** is not an award-chasing feed. A historical **Month Screen**, however, retains the same legitimate calendar and discovery progress so the reader can understand the month they're studying.
- A publication month's thematic and full-month earned cards remain filed under their **publication month** even if earned years later. Earned **date** is the actual date of earning, separate from publication and completion timestamps.

## 7. Field Notebook and illustrated Scripture cards

- Navigate by **publication year → twelve month entries**. An ordinary unpublished future month may show a neutral coming-soon state without leaking future teaching or discoveries.
- **All Earned Cards** is a separate gallery, showing earned monthly cards and, only once relevant, earned Special Experience cards; within groups, newest-earned-first is a working selection. Do not show unearned event placeholders.
- Earned cards contain a substantive illustration and **written biblical text/explanation**; these are **not diagrams with arrows or dependency maps**. Accessibility should make actual text available to assistive technologies and use concise descriptive text alternatives for the illustration, not require Alexis to compose a second theological exposition.
- Cards are searchable by **card title, Bible book, passage and editorially curated theological themes/motifs** grounded in Alexis's teaching; do not invent metadata the teaching does not support.
- **No Field Notebook personal journaling/handwritten annotation feature.** Guided worksheet, prayer or reflection interactions elsewhere remain a separate Challenge-content matter.
- **Lifetime participation** is one prominently presented, evolving status derived from **distinct** Challenge completions. Show number completed in secondary details if useful, without a mandatory next-tier progression bar or permanent milestone card collection.
- Reader may **share the existing original earned Scripture card**, complete with explanation; no independently designed or separately maintained social assets. The app **adds a subtle Bibleberry identifier/watermark on the export/share image at share time**, leaving the in-app original untouched. **Exact wording/logo/placement is deferred.** No attempt to block screenshots, and no attribution promise for screenshots.
- Card visual identity is anchored in Alexis's authentic notebooks; actual art, badge thumbnails, typography and layouts will be mocked up later.

## 8. Accounts, cross-device records and earned-date integrity

- Registration is **optional**; guest participation is real participation.
- When a guest creates a new account on that device, **automatically transfer/merge** their Challenge completions, saved Scripture, earned cards and earned dates, resume state and other relevant saved progress. No reset or duplicate award.
- When someone using a **guest device** signs into an **already existing account** there, **automatically merge guest activity into that existing account**. Preserve accomplishments/saved Scripture from both sides and deduplicate by stable IDs.
- If guest Shelf choices conflict with the existing account's Shelf, **the account's current Shelf selection takes priority**; this must not delete the guest's underlying completed Challenges or awards.
- Duplicate offline/parallel earning of the same card yields **one** card with the **earliest credible earned date**. Do not simply trust the earliest unverified client clock.
- On two devices with different partially read positions for a Challenge, resume from the **furthest position** by default, rather than blindly selecting latest timestamp. Deliberate reread flows can be specified later.
- Gentle account invitations may appear **outside focused teaching** to protect recoverable progress. Cloud identity/auth, client conflict algorithms and offline capability are engineering specifications still requiring review.

## 9. Special Experiences — separate from ordinary Challenges

**Category is approved for future design; no individual event is approved or scheduled.**

- Optional, advertised, truly **time-limited** events, potentially with opt-in reminders and a Hub promotional entry.
- Readers must **start** within the event's available participation window; **simply tapping Start is sufficient** to qualify for any grace period. No requirement to complete the first step immediately.
- Each event has an **event-specific grace deadline** selected by the product team. Example: a one-day event can give existing starters until **noon the next day**, in the reader's local day. Do not assume every event has identical grace duration.
- After the event closes/grace expires, its activities are **not readable/completable later** and are **not added to the ordinary historical Library**. No retrospective participation or earning.
- Only cards actually earned by participants appear in their permanent dated collection. **No grayed-out missing event slots**, hidden historic events, or reminders of missed events.
- Ordinary historical monthly Challenges remain permanently available. Do not apply this time limit to them.
- Local-time/day and boundary handling need a safe technical implementation contract; it is not approval to trust arbitrary device-clock edits.

## 10. Clearly deferred decisions and boundaries

**Design/UX deferred:** exact Month Screen calendar form; overall app tab/navigation IA; Field Notebook/card/thumbnail artwork; monthly intro text/layout/count; selected introduction link and Skip-to-Welcome wording; Hub reward announcement wording; watermark branding/position; lifetime tier names; on-screen visual placement for account invitations; exact shelf protection labels.

**Technical behavior to specify:** intrinsic completion for all seven Challenge formats; reliable server-enforced local-calendar publication and travel/timezone transitions; secure client/cache handling of prepublished titles versus embargoed teaching; idempotent completion/card issuance; credible earned-date merge; offline conflicts and guest-account migration; active-focus/rollover tie handling, first-post-rollover resume; announcements/new-marker persistence; performance on low-end Android and screen-reader verification.

**Not currently approved:** new event production; forced memorization app; Field Notebook journaling; compulsory missed-day catch-up; additional social graphics; full event sourcing; any redesign of the ministry's teaching for gamification; a specific global navigation; conversion of the calendar back to a list; hiding monthly discovery goals until the first card.

**Do not invent hypothetical ministry publication failures or major theological revisions as normal-path product requirements.** The monthly content is prepared and published reliably in advance. Routine proofreading can preserve progress without introducing elaborate retroactive-card recalculation rules; genuinely exceptional circumstances can be handled separately if they ever exist.

## 11. Supersession checklist for developers and future AI agents

| Prior proposal or confusing legacy language | Binding November 8 direction |
| --- | --- |
| “Personal Archive” / “Past Teaching Library” as final UI labels | **Shelf** / **Library**; current month separate |
| Rotate away reader-selected months based on raw recency | **Protect explicitly selected months**; replace oldest *auto-admitted* only |
| Reveal monthly thematic goals after first earned card | **Visible on Month Screen when participating**, while actual card stays secret |
| Display discovery requirements by qualifying Challenge/link | **Never expose source Challenge locations** before discovery |
| Gray silhouettes/previews of unearned card artwork | **Title + numeric progress only; untappable** |
| Monthly progress belongs chiefly in Field Notebook | **Calendar Month Screen** shows Challenges and discovery progress; Notebook is permanent earned collection |
| Generic full-month certificate / top-of-page reward | **Illustrated Scripture card** as last Monthly Discovery |
| Automatic completion merely by reaching final teaching screen | Clear **Finish** button records completion |
| Announce as soon as reader exits any Challenge | **Hub only**; other destinations update silently and defer announcement |
| “Current month only; older month details as flat archive entries” | **Same Month Screen** available for historical months |
| New month appears only on the first day | **Advance preview on preceding 28th / Feb 27**, Welcome gated to month start |
| Repeat entire introduction after someone saw the preview | **Skip to Welcome** option; intro accessible later, no automatic replay |
| Guest account merges unspecified/manual | **Automatic** new-account transfer and guest-on-device sign-in merge; existing Shelf wins |
| Special events can be finished retroactively via Library | **No retrospective event availability**; start during window, event-specific grace only |
| Separate share images/social templates | **Share original earned card**, adding attribution on exported image only |
| Every card/layout requires separate Alexis product approval | **Aaron approves product direction**; Alexis's substantive teaching/editorial authority remains intact |

**Implementation process:** Commit approved documentation through a scoped PR. Do not represent product authorization as a finished UI, authenticated sync implementation, launched Special Experience or changed CMS schema. Follow the normal Issue, branch, review and merge protocol.
