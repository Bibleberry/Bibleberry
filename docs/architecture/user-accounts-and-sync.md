# Bibleberry — User Accounts, Authentication & Cross-Device Continuity

> **Working architecture decision record**  
> **Updated:** 2026-11-08  
> **Status:** Working account decisions plus the November 6 minimal-record product choice; not an implementation brief  
> **Owners:** Aaron Waid (product/technical decisions), Alexis Waid (ministry/content authority)  
> **Target launch:** January 1, 2027

## Purpose

Bibleberry is a free, mobile-first Christian formation application. Readers may complete daily Scripture **Challenges**, save Scripture references, and earn long-lived achievements. Optional personal-Bible memorization guidance and memorization-status controls remain design possibilities, **not approved launch account-data requirements**. The account system should make those accomplishments reliably recoverable when a reader changes devices, reinstalls the app, or returns years later.

The guiding requirement is: **A reader's durable accomplishments must belong to their account, not to a particular phone.**

This document captures the **working decisions made so far**, why they were made, and what remains open. It is not authorization to implement or redesign existing working components.

## November 6, 2026: installed-mobile-first storage clarification

**Product owner decision:** Bibleberry is intended primarily as an **installed iOS and Android application**, with a hosted web version as an additional channel. The existing React/TypeScript/Vite UI is not a browser-only delivery commitment.

For A3, reader participation identity, completion semantics, optimistic state and React-facing store must be **independent of the physical persistence technology**. A web localStorage adapter is suitable for hosted-web guest mode and development tests, but **must not be treated as the permanent native-device storage contract**. The store must support asynchronous hydration, queued early actions, serialized writes, failure/retry reconciliation and safe reset during pending writes. Capacitor/native Preferences, SQLite, and other native packaging/storage choices remain **unselected**; no native dependency or packaging work is authorized by A3.

A future authenticated Supabase account remains the working route to **recoverable multi-device accomplishments**. Guest records in a native app can still be lost on uninstall or device loss. See [A3 Issue #46](https://github.com/ContraPhilosophy/Bibleberry/issues/46) and [November 6 handoff](../project/handoffs/2026-11-06-a3-mobile-first.md). The native packaging choice should be resolved earlier in [R20](../product/application-development-roadmap.md) planning, before committing to authentication, device notifications or app-store release details.

## November 6, 2026: approved scope for participation records

Aaron resolved the gamification research architecture disagreement in favor of the **simpler durable-record approach**, rather than a comprehensive append-only event log. This is a product-scope decision, not a finalized database schema.

- **Record what matters to the reader:** which distinct Challenges are complete, which Scripture references are saved, and which accomplishments were earned, with their actual earned **calendar dates**. A future honor-system “learned” declaration is conditional on a separate memorization-feature decision.
- **Keep identities stable and progress recoverable:** preserve completion and award records when signed-in readers change devices. Deduplication and authorized access remain engineering requirements, even if there is no detailed interaction diary.
- **Avoid unneeded behavioral history:** precise times for every view, tap, practice session or reading interval are not product requirements. Use minimal technical timestamps or provenance only where needed to implement reliable sync, correction, or a separately approved feature.
- **Respect the separate editorial calendar:** a Challenge's publication month and any content-derived monthly collection are editorial data; one permanent reader-completion fact can satisfy lifetime, monthly and topic-related eligibility without a duplicated event stream.
- **Do not overbuild guest synchronization:** current direction remains guest progress stored locally and recoverable account-bound records in Supabase after sign-in. Online-first release remains the working direction. Exact guest merge and collision rules remain to be designed and verified.
- **Keep future ideas conditional:** surprise acknowledgments for actual consecutive participation days are possible, not approved technical scope. If adopted, they may need day-level participation dates, but not minute-by-minute activity tracking. Do not preemptively build a real-day streak ledger.

For product decisions and unresolved achievement rules, see [Gamification, Achievements & Participation](../product/gamification-and-achievements.md) and [Biblical Discovery & Scripture](../product/biblical-discovery-and-scripture.md). This note supersedes any inference elsewhere in this record that **full event sourcing or a comprehensive append-only interaction ledger** is required.

## November 8 owner-approved guest conversion and synchronization rules

The [November 8 approved reader experience](../product/2026-11-08-approved-reader-experience-and-month-screen.md) **settles the product behavior** for guest conversion and merging. Prior "guest-to-account migration undecided" language below is superseded.

1. A guest **creating a new account** on that device automatically transfers completed Challenge records, saved Scripture, earned cards and their dates, reading positions and saved progress into the new account. Do not reset or duplicate awards.
2. Someone browsing **as a guest on a device** who signs into an **already existing account** there automatically merges the guest records into that account. Preserve both sides' completions, saved Scripture and valid earned cards. Never require redoing Challenges.
3. The **existing account's Shelf selections win** if guest and cloud Shelf memberships conflict; the guest's underlying reading, achievements and Scripture remain preserved in the Library and collections.
4. Duplicate earning of the same card results in **one card**, using the **earliest credible earned date**, not an arbitrary unverified client timestamp. When two devices have conflicting partial Challenge positions, default to **furthest read position**; intentional reread cases need separate technical design.
5. Account invitations remain optional, gentle and outside focused Challenge reading. Guest data may still be lost on device loss before registration; these merge rules do not promise cloud recovery for unsigned guests.

**Still to specify:** Atomic migration steps, stable identities, idempotence, clock integrity, offline conflicts, native device persistence, row-level permissions, secure account linking and practical failure/retry UX. These are engineering design questions, not permission to reopen the product decision.

## Working decisions

| Area | Working decision | Reason / boundary |
| --- | --- | --- |
| Authentication and user-data service | **Supabase** is the selected working direction, subject to integration validation before implementation. | Managed authentication plus a PostgreSQL database; fits React/TypeScript and connected progress records. Avoids operating a custom authentication server. |
| Login methods | **Continue with Google**, **Continue with Apple**, **Continue with email**. | Readers choose based on preference, not device brand. Google login must work for iPhone users; credentials should work across supported platforms. |
| Email login | **Passwordless six-digit email verification code** rather than a conventional Bibleberry password. | Familiar, relatively low-friction sign-in; requires reliable production email delivery. This is one authentication factor, not two-factor authentication. |
| Persistent sessions | Keep signed-in readers signed in under normal conditions, with secure sign-out and session handling. | Readers should not need to enter an email code every day. |
| Registration | **Optional.** Free published teaching and Challenges should be available without registration. | Do not place an account wall between readers and Bibleberry's ministry content. |
| Guest activity | Guest progress may be saved on the **current device**; it is **not guaranteed** to survive device loss, reinstall, or change of device. | Communicate the consequence clearly; don't promise guest account recovery. |
| Why register | Registration is encouraged to **protect and synchronize personal accomplishments**, not for monetization. | Offer contextual, respectful invitations; avoid repeated disruptive prompts. |
| Permanent reader records | Account-bound cloud records for Challenge completion, saved Scripture, and earned achievements (including earned dates). Optional memorization state **only if separately approved**. | Core cross-device continuity requirement without presuming a dedicated launch memorization app. |
| Editorial content | **Sanity CMS** remains responsible for published teaching and other editorial content. | Sanity is not the user authentication or personal-progress database. |
| Local and cloud data | The authenticated account's cloud data is the durable record; device storage may cache data for responsiveness. | Exact local/offline sync design is pending. |
| Offline scope | **Online-first** initial release is the current working direction; do not promise full offline completion/sync for launch. | Avoid unnecessary complexity before January 1, while planning not to preclude later support. |
| Patreon | **Entirely separate from Bibleberry AppDev.** No planned Patreon account, donation, or payment integration as part of this architecture. | Patreon has its own independent engagement system. |

## Product principles

1. **Teach first; registration second.** Visitors can read and participate without creating an account.
2. **Explain consequences without penalizing guests.** A guest can use the app, but cross-device recovery requires a recoverable account.
3. **One Bibleberry identity, multiple login methods.** Securely link Google, Apple, and email identities to the same reader account when the reader proves ownership; do not automatically merge accounts merely because emails match.
4. **Store the facts behind achievements.** Preserve individual Challenge completion records, not just a running total.
5. **Protect long-term accomplishments.** Achievements are noncompetitive and persistent; retain the date earned and the underlying qualifying history.
6. **Keep records distinct.** A Challenge's editorial release date, any completion date/time used for a defined purpose, and an achievement's earned date are different facts. Do not require fine-grained activity timestamps merely because they are technically available.
7. **Don't build a custom login-security system.** Use standard managed identity, access-control, and recovery mechanisms.
8. **Collect minimal personal information.** Do not require a reader's real name, address, denomination, or similar information for basic accounts. Authentication does not automatically enroll someone in marketing communications.
9. **Preserve the existing application.** Review the codebase and extend working systems rather than assuming a rebuild.

## Existing implementation: repository review (October 31, 2026)

Repository: [ContraPhilosophy/Bibleberry](https://github.com/ContraPhilosophy/Bibleberry), default branch `main`.

- The current reader app uses **React 19, TypeScript, and Vite**.
- Sanity Studio exists as a separate `studio/` workspace.
- The main prototype stores browser-local preferences and reading activity under `bibleberry-prototype-v1`.
- The development-only interactive Challenge lab stores local positions, completions, bookmarks, and saved Scripture under `bibleberry-interactive-challenge-lab-v1`.
- Opening a Challenge and completing it are already treated as different concepts.
- The checked application has **no implemented Supabase/Firebase authentication or cloud progress synchronization**.
- The inspected package manifest does not include Capacitor; final native mobile packaging and its sign-in implications still need verification.

These observations reflect the repository at the review date, not a promise about later branches or deployments.

## How cross-device continuity should work (conceptual)

1. The reader signs in using Google, Apple, or an email code.
2. Supabase authentication establishes a **stable Bibleberry user ID**.
3. Bibleberry writes durable personal accomplishments associated with that user ID.
4. The same reader signs in on another supported device.
5. The app retrieves that reader's saved accomplishments and preferences that are designed to sync.
6. Changes on either device flow back to the cloud when connectivity permits.

**Important:** Simply adding a cloud database does not solve conflicting edits. Saving records with meaningful stable IDs, preserving offline changes when eventually supported, and safely combining guest and existing-account records require explicit design and testing.

### Initial data categories to plan

**Expected to require durable account storage:**
- Distinct completed Challenge IDs with minimal metadata for safe deduplication and sync; completion date/time only when needed for a defined feature or technical integrity.
- Saved Scripture passage library.
- **Conditional future category only:** Memorization state, dates marked “I learned it!”, or memorization-specific achievements **if** a separate product decision approves the relevant feature. These are **not mandatory for initial account schema or launch**.
- Earned achievement IDs and dates, with only the supporting facts needed to explain and preserve awards.
- Bookmarks and other saved content if approved.

**Decide individually:**
- In-progress Challenge position.
- Reading history and archive state.
- Appearance, text size, and other preferences.
- Reminder/notification settings (some are necessarily device-specific).
- Future special-event participation.

**Not approved for cloud storage by this record:**
- Personal journaling/reflections. If pursued later, requires separate product approval, privacy design, and conflict/recovery handling.

## Security and sustainability expectations

These are requirements for a production design, not completed implementation:

- Appropriate **row-level security** so authenticated readers can access only their own private records.
- Secure account linking, recovery, and session management.
- Rate limiting and dependable production delivery of email verification codes.
- Secure transport and appropriate encryption/storage controls.
- Account/data deletion and relevant Apple App Store and Google Play compliance.
- Backups, restoration testing, monitoring, and safeguards against accidental overwrite or deletion.
- Cost visibility at roughly 1,000, 10,000, and 100,000 users, based on **actual monthly active users, storage, and traffic**, not just total registered accounts.
- Versioned database/schema changes reviewed alongside the application source in GitHub.

## Open questions — discuss before Kimi implementation instructions

1. **Guest-to-account conversion (product settled Nov 8):** Engineer/test the **approved automatic transfer and merge**, including retries, deduplication, idempotence and safe errors. Do not ask whether migration is manual or optional.
2. **Identity linking:** How readers add/change login methods and how to prevent duplicate or incorrectly merged accounts.
3. **Data model:** Stable Challenge IDs, verse identity, completion record semantics, achievement award records, retries, and deduplication.
4. **Synchronization:** Implement the approved existing-account Shelf precedence, furthest reading position and earliest credible earned date; define remaining offline/timestamp conflict safeguards.
5. **Offline behavior:** Define the minimum acceptable launch behavior; assess future offline completion architecture.
6. **Mobile packaging:** Confirm iOS/Android deployment technology and test Google/Apple/email-code flows on actual supported platforms.
7. **Privacy lifecycle:** Final user-data collection, deletion, retention, and whether export is provided.
8. **Operations and costs:** Supabase plan, transactional email provider, monitoring, backups, and budgets.
9. **Guest registration prompts:** Decide which milestones deserve a nonintrusive invitation to protect progress.

## Current process

First understand the concepts and tradeoffs; recommend mainstream, secure 2026 approaches with clear reasoning; review the real codebase; make informed decisions; **only then** prepare implementation instructions for Kimi K3.1 Pro.

**Do not treat this document as a complete technical specification or as permission to implement all open questions without further discussion.**
