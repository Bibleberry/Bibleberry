# Bibleberry — Gamification, Achievements & Participation

> **Working product design record — NOT an implementation specification**  
> **Last updated:** 2026-10-31  
> **Status:** Agreed design principles, active proposals, and future brainstorming are deliberately separated.  
> **Project:** Bibleberry AppDev | **Target launch:** 2027-01-01  
> **Product lead:** Aaron Waid | **Content/ministry authority:** Alexis Waid

## Purpose

Bibleberry is a free Christian formation app built around the biblical teaching of Alexis Waid. Every daily content experience is called a **Challenge**, regardless of format. Challenges can be completed and revisited through the archive.

The participation system should encourage deliberate engagement, celebrate accomplishments, and make a reader's years of participation visible **without turning discipleship into competition, a holiness score, a punitive streak, or a content-unlocking game**.

This document preserves the ideas and distinctions from the October 30–31, 2026 design conversations. **It does not authorize Kimi to implement any feature.** Ideas not explicitly approved by Alexis remain subject to editorial/product approval.

---

## A. Established design principles

These are the strongest current decisions/principles from the gamification conversations.

### A1. Personal, collectible achievements

- Achievements/badges recognize **participation and positive accomplishments**.
- The collection is personal, not competitive. **No leaderboards, public rankings, or comparison of readers.**
- Achievements are **not measures of spiritual maturity, holiness, or biblical knowledge**.
- **No content should be locked behind an achievement.** Discipleship resources remain available on their own terms.
- **Earned achievements persist.** They do not disappear because a reader misses a day.
- Every earned achievement should store and display **the date it was earned**.
- The overall tone is closer to **“Sunday School gold stars”** than a system of tests or competitive rewards.

### A2. Make regular achievement goals visible

Aaron strongly prefers **goal-directed collections over surprise unlocks**:

- Ordinary achievement goals should appear in the collection before they are earned.
- Unearned regular badges appear **grayed out** (or otherwise clearly locked).
- Readers should be able to see **exactly what is required** to earn each badge.
- Show **progress toward a goal** where it can be represented meaningfully.
- Earning a badge can make it visually distinct from the unearned version.
- Specific badge artwork, names, animations, and layout have **not** been finalized.

**Important distinction:** This visible-locked approach applies to the **regular achievement collection**, not necessarily to future time-limited Special Event badges (see §D).

### A3. Recognize completion rather than continuous attendance

- The app should **not punish people for missing a day**.
- Readers can return to archived Challenges and complete them later.
- We are **not** pursuing a conventional daily active-use streak that resets when someone doesn't open the app.
- Reward positive outcomes; **do not create achievements whose criteria reward neglect, skipping, or deliberately falling behind**.
- In particular, the hypothetical **“Rally Cap”** badge for missing six days and then catching up was rejected because it could incentivize missing Challenges. Catch-up still counts toward normal accomplishments; it is just not something to reward *because of* the delay.

### A4. Scripture memorization is honor-system participation

- A reader can save Scripture used **anywhere in Bibleberry** to their own **My Scripture / memorization library**.
- A reader may practice a saved passage and mark it **“I learned it!”**.
- This is the reader's declaration, not a scored theological or recall exam.
- Preserve saved passages, learned status, the date marked as learned, and relevant accomplishments.
- **Memorization records are distinct from collectible achievement records**, even when memorization contributes toward an achievement.
- The weekly featured memorization Challenge is separate from the reader's broader personal Scripture library.

### A5. Completion must be a real event

- **Opening**, **reading**, **resuming**, **saving**, and **completing** a Challenge are different actions.
- Optional deeper studies and reflection choices must **not** become hidden requirements for Challenge completion.
- Each Challenge has its own stable identity, and completion should be tracked by that identity—not just by a counter.
- The app's presentation should remain flexible enough to faithfully present Alexis's teaching. **Do not impose gamification or screen-length constraints on what she writes.**
- The weekly content schedule and future Challenge formats are still evolving; the achievement data model should not be tightly coupled to a particular seven-day format.

---

## B. Milestone achievements — active design direction

These ideas have substantial support in discussion but **the exact criteria, values, names, art, and full catalogue still need formal definition**.

### B1. Lifetime Challenge completion milestones

Recognize readers for the **total number of distinct Challenges completed** over time.

- This is an accumulation of completed Challenge IDs, not a score for opening the app.
- Returning to and rereading the same Challenge should not accidentally inflate the unique-completion total.
- A graded series of visible milestones is envisioned.
- **Exact threshold numbers and names are not yet approved.**

### B2. Consecutive *Challenge release-date* achievements

Aaron proposed a nonpunitive alternative to live attendance streaks:

**Complete the Challenges assigned to consecutive calendar release dates, regardless of when you complete them.**

Example: if a reader eventually completes the Challenges released on seven consecutive dates, they can earn a seven-date achievement—even if some were completed much later from the archive.

- The chain concerns the dates **assigned to Challenges**, **not** seven consecutive calendar days of opening Bibleberry.
- A missed Challenge can be completed retrospectively, repairing the chain rather than restarting a punitive live streak.
- The system should distinguish at least three dates/times: **Challenge release date**, **Challenge completion timestamp**, and **achievement earned timestamp**.
- Achievements for different chain lengths should be **separate earned accomplishments**, not an achievement that disappears or resets.
- The progression **7, 14, 30, 60, 90, and 120 consecutive release dates** was discussed as a possible milestone ladder. The exact numbers should be treated as **proposed**, not a finalized implementation contract.
- What happens after 120 remains an **open design question**, potentially involving an advanced collectible/progression mechanism.
- Determine how to handle a date without a published Challenge, multiple Challenges on one release date, changing schedules, backdated or corrected content, and archival material **before implementation**.

### B3. More advanced / evolving collectibles

A possible later system would let certain long-term accomplishments **visually evolve through tiers** rather than simply creating an endless field of separate badges.

Design idea from discussion:
- Show the reader their current evolved appearance/tier.
- Preserve the history of **each earned tier and its earned date**.
- Do not silently erase the prior accomplishment as the collectible changes appearance.

**Status: exploratory.** Tier thresholds, appearance, categories, and whether to launch such a system are all unresolved.

---

## C. What does NOT belong in the achievement system

Explicitly avoid:

- Leaderboards, competition, or rankings against other people.
- “Holiness,” “better Christian,” or comparative spirituality scores.
- Theological quizzes or exams used to verify that a reader has truly memorized Scripture.
- Punitive attendance streaks that erase progress after missed days.
- Rewards for missing days and then catching up.
- Required optional studies, mandatory reflection disclosures, or arbitrary gamified obstacles.
- Downloadable resources or substantive biblical teaching gated behind achievement counts.
- Creating incentives that pull readers away from the actual purpose of the teaching.

A formerly discussed **Bookmarks/Keys** idea and reward-gated downloads should be regarded as **historical brainstorming, not current requirements**. Likewise, references to a particular “Greek lesson” prize are not an approved achievement reward.

---

## D. Special Events — separate, FUTURE brainstorming only

**This idea was proposed by Aaron on October 31, 2026. It is NOT approved, NOT build-ready, and should not be treated as a launch requirement.**

The concept is an **optional, advertised, time-limited experience** distinct from the ongoing Challenge/achievement collection.

### Example: “Praying the Hours”

- A reader **opts into** the event.
- The app may offer **opt-in notifications** approximately **three times during a day**.
- Each notification takes the reader to an intended **prayer point**.
- Completing the defined event participation earns a **special commemorative badge** that records the **date earned**.
- This could be an occasional one-off or perhaps recur (e.g., monthly)—frequency is not decided.
- A time-bounded participation requirement could be appropriate here **because the user explicitly joins a special event**, without creating an endless compulsory attendance streak.

**Special Event badge visibility differs from regular achievements:**

- **Earned** Special Event badges may appear in the reader's collection.
- **Unearned or missed** Event badges should **not** sit in the collection as gray placeholders, visible gaps, or permanent reminders of missed opportunities.

Open questions include event eligibility, timezone boundaries, late entry, device notification permissions, offline handling, event history, badge recurrence, and whether Alexis approves this format at all.

**Do not confuse proposed Special Events with the core ongoing Challenge experience.**

---

## E. Cross-device permanence and account implications

Reference: [User Accounts, Authentication & Cross-Device Continuity](../architecture/user-accounts-and-sync.md)

Working account direction is **Supabase with Google, Apple, and passwordless email-code sign-in**; accounts are optional. Guest data may be local only, and **account-based cloud continuity** is required for durable recovery across devices.

The gamification system needs to preserve (when signed in):

- Unique completed Challenge records, with source Challenge ID, release date, and completion date/time.
- The user's total unique completed Challenges (calculated from underlying records rather than trusted as a free-floating number).
- Memorization library saves, learned status, and learned dates.
- Earned achievement identifiers, dates, and enough historical data to explain/restore awards.
- Distinct histories for evolving/tiered awards if such a system is eventually approved.
- Optional future Event participation **only if Special Events are approved and developed**.

**Cloud sync and conflict handling are not designed yet.** On multiple devices, the same completion must not be double-counted; a device with older data must not erase newer achievements. Access control must prevent one reader from viewing or editing another reader's private progress.

The stable identifiers and event records should be carefully designed *before* real participants accumulate years of progress.

---

## F. Open questions / decisions still to make

1. What is the initial **regular achievement catalogue**? Categories, names, artwork, requirements, and total-completion thresholds.
2. Are the proposed **7/14/30/60/90/120** release-date milestones the final progression? How should the chain handle publication-calendar irregularities?
3. What exactly constitutes **Challenge completion** for each Challenge format? Keep optional content optional.
4. How will progress be shown for each ordinary visible-but-locked achievement?
5. What are the rules for revisiting, undoing, or correcting a completion or “I learned it!” status?
6. Which achievements derive directly from saved history, and which need permanently recorded award events?
7. Should evolving collectibles exist at launch, later, or at all? How would tiers and earned-date history display?
8. Does Alexis approve any Special Events? If so, define opt-in, notifications, timing and badge visibility separately from ordinary achievements.
9. How should guest achievement records migrate to an authenticated account without loss or duplication?
10. How do we introduce accomplishments to readers in a way that supports formation rather than distracting from the teaching?

## Planning and implementation boundary

This record is a **snapshot of the current conversation**, not a finished gamification specification. It preserves principles and proposals for later review, including Alexis's authority over ministry/content choices.

**No build instructions for Kimi yet.** First resolve the outstanding product questions, then inspect the existing React Challenge components and persistence model, and only then prepare a scoped handoff.

When revising this file, use a meaningful Git commit message and update the status of ideas as they move from **exploratory** → **approved** → **implemented**.
