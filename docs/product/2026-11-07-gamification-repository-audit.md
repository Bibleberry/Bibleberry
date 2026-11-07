# November 7, 2026 — Gamification and Field Notebook repository consistency audit

> **AUDIT / PROVENANCE, NOT A COMPETING PRODUCT SPECIFICATION.**
> Current behavior lives in [Gamification & Achievements — decision-status map](gamification-and-achievements.md#decision-status-at-a-glance--november-7-2026). This report identifies where earlier text appeared, what it meant, and how it should be interpreted. It does not authorize coding or merge PR #51.

## Scope and method

Inspected Bibleberry's repository tree on `main` and the documentation branch for [draft PR #51](https://github.com/ContraPhilosophy/Bibleberry/pull/51); searched repository content for gamification, achievements, streaks, badges, Field Notebook, monthly commemoratives, lifetime completion, Special Experiences and Archive references; read the relevant product, agent, engineering-status and release documents. Inspected relevant source references for old achievement mechanics. Also inspected the live description of [Issue #22](https://github.com/ContraPhilosophy/Bibleberry/issues/22) and the A3 scope of [Issue #46](https://github.com/ContraPhilosophy/Bibleberry/issues/46). Git history and dated discussion records were not rewritten into fictitious contemporary decisions.

This is a **documentation/reference consistency audit**, not a runtime verification or exhaustive statement about unindexed binary assets.

## Current, historical and open sources

| Source | Classification | Audit finding and treatment |
| --- | --- | --- |
| [Gamification & Achievements](gamification-and-achievements.md) | **CURRENT WORKING MODEL** | Canonical subject document. Adds an explicit three-way status map. Settled product behavior is separate from artwork and implementation approval. |
| [November 7 Archive/Library/Continue and Field Notebook notes](2026-11-07-archive-library-and-continue-working-notes.md) | **CURRENT WORKING MODEL + OPEN DETAILS** | Records the most recent discussions. Header now differentiates decided Field Notebook behavior from unresolved Archive/Hub selector cases; earlier language inside the running chronology is superseded by later decisions. |
| [November 6 design session record](2026-11-06-design-session-record.md) | **HISTORICAL SNAPSHOT** | Its then-open question “Do mini-collections earn permanent cards?” and earlier monthly commemorative, lifetime seal and visible-goal concepts are **not** current unresolved decisions. Preserved with an explicit November 7 supersession banner. |
| [Roadmap R06/R08/R14](application-development-roadmap.md) | **PLANNING, UPDATED REFERENCE** | Previously referenced selected visible lifetime goals and generic full-month commemoratives. Updated to the evolving status and substantive Scripture cards; roadmap remains non-authorizing. |
| [Current project status](../project/current-status.md) | **LIVING STATUS / DATED ENGINEERING EVIDENCE** | November 6 design summary was stale for Field Notebook. Added November 7 product addendum without rewriting the older engineering baseline. |
| [Agent instructions](../../.github/copilot-instructions.md) | **ACTIVE AGENT GUIDANCE** | Clarifies which subject record supersedes older design, and forbids inferring lifetime badge ladders or optional achievement earning from historic texts. |
| [Release readiness](../release/release-readiness-and-rollback.md) | **LAUNCH-SCOPE PLANNING** | Older “design still open” wording blurred settled behavior vs open production/visual scope; clarified. “Evolving collectible designs” is not the current evolving lifetime status. |
| [README](../../README.md) | **ENTRYPOINT** | Adds direct link to current/historical/open map for new contributors and agents. |
| [November 6 A3 handoff](../project/handoffs/2026-11-06-a3-mobile-first.md) | **HISTORICAL CHECKPOINT — preserved** | Mentions earlier “monthly commemoratives” and undifferentiated goals, but is explicitly dated and concerned with an A3 implementation phase that excludes the achievement engine. Do not rewrite historical verification; use current subject record for future Field Notebook work. |
| [Issue #22 — Hub / My Journey](https://github.com/ContraPhilosophy/Bibleberry/issues/22) | **OLDER OPEN DESIGN ISSUE — needs owner-level reconciliation** | Its older My Journey structure and retrospective consecutive-release-date awards conflict with the newer Field Notebook model. The Issue body remains as originally proposed; **do not use those clauses as current requirements**. Update or cross-link the Issue when planning Track B implementation, after Aaron reviews PR #51. |
| [Issue #46 — A3 participation](https://github.com/ContraPhilosophy/Bibleberry/issues/46) | **SCOPED ENGINEERING HISTORY** | References permanent monthly commemoratives and future thresholds as of November 6. A3 deliberately excludes the award engine and UI; its distinct-completion/persistence separation remains relevant. Current Field Notebook design takes precedence for future reward UI. |
| [Code / reader prototypes](../../src/App.tsx) | **EXISTING IMPLEMENTATION, NOT PRODUCT APPROVAL** | No implemented release-date badge ladder or new Field Notebook award engine was identified in inspected relevant source references. “Field Notebook visual tokens” and UI `badge` components are styling/prototype terminology, not proof the new achievement system exists. |

## Concrete supersessions found

1. **Accumulating lifetime threshold badges → one evolving participation status.** Older references appear in November 6 design ideas and Issue #22. Distinct completion remains the underlying count.
2. **Generic monthly commemorative/certificate → substantive Scripture card.** The full-month card is the final reward when the month's finalized eligible Challenge set is complete. Each thematic discovery also earns a substantive Scripture card.
3. **Optional/unspecified thematic mini-collection award → permanent award when completed.** The November 6 question is answered; do not re-open it as an unresolved core rule.
4. **A broad grid of gray unearned goals → selective reveal after first month-associated award.** All calendar months appear ordinarily, without gray failure placeholders. Special Experiences never display unearned placeholders.
5. **Release-date consecutive streak/ladder → not a current approved progression feature.** Recoverable old reading remains allowed and counts toward total distinct Challenge completion.
6. **Unlimited historical active months → up to three historical Archive months plus the current publication month.** Archive/Hub tie-breaker details are still open.
7. **Announcements undefined → explicit one-time combined, next-session, individual-card and opt-out semantics.** Hiding an announcement never disables earning or the Field Notebook.
8. **“Design open” as an undifferentiated claim → split settled product behavior from pending Alexis artwork/UI approval and engineering/release scope.**

## Real open questions that remain

- Archive rollover prioritization/ties, what re-adding does to recency, and the exact one-item Hub Continue selection algorithm and onboarding behavior.
- Alexis's final Field Notebook visual and editorial review, individual Scripture card artwork/copy, lifetime status wording and responsive UI.
- The *broader* Quiet Reading experience beyond the specifically approved earned-card announcement opt-out.
- Technical data model and idempotency, Sanity editorial metadata, acknowledgment persistence, session behavior, authenticated synchronization, testing and launch scoping.
- Individual Special Experience approval, scheduling and eligibility, **if** an event is ever commissioned.

## Change-management rule

Do **not** delete or rewrite historically accurate November 6 or older designs just to make history look consistent. Instead, signpost them as dated context and ensure **active guidance and current planning documents** route to the latest product decision register.

As of this audit, the updates are part of **draft, unmerged PR #51**. Acceptance/merge is Aaron's decision. The current Field Notebook working design itself is **not an implementation order**.
