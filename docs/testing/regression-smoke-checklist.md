# Bibleberry — Regression Smoke-Test Checklist

**Status:** Standing verification checklist  
**Established:** November 1, 2026  
**Owner:** Aaron Waid (technical acceptance); Alexis Waid reviews changes to her teaching, editorial adaptations, and ministry-facing visual decisions.

This is a **verification procedure, not a claim that any tests have run**. Use it with [AI Development Protocol](../ai-development-protocol.md) and [Development Workflow](../development-workflow.md). It does not authorize new features, production deployment, account infrastructure, or publishing editorial material.

## 1. How to use it

- Each pull request (PR) must say **what changed**, **what could regress**, **what was actually checked**, and **what remains untested**. The implementation author performs checks appropriate to the change; a separate reviewer inspects risks and evidence. Aaron accepts or rejects.
- For a **docs-only** PR: inspect changed Markdown, links, scope, and factual accuracy; mark functional testing **N/A**. Do not run a full manual app test unless the documentation changes a procedure that needs validation.
- For a **reader UI/state/logic** PR: run the reader build and affected manual checks below; expand to neighboring flows where the change could cause regressions.
- For a **Sanity/schema/content** PR: run Studio typecheck/build and the relevant editor/validation checks below; test the reader only if integration or shared behavior changed.
- For **shared dependencies, routing, storage, publishing, authentication, or release** changes: use a broader smoke pass across both affected workspaces and explicitly examine security/privacy and migrations.
- For a **release candidate**: execute the full applicable checklist on the actual release artifact and supported platforms. A green PR is not itself release acceptance.
- Record each relevant test as **PASS**, **FAIL**, **NOT RUN**, **BLOCKED** (with reason), or **N/A** (with reason). Never treat an unperformed or unavailable check as PASS. Attach screenshots, short recordings, console output, or links when they substantiate results.
- If a regression is found, do not merge until it is fixed or Aaron explicitly accepts a documented exception. Preserve prior working behavior unless an approved requirement changes it.

## 2. Existing automated checks

The current GitHub Actions workflow `.github/workflows/ci.yml` runs on PRs into `main` and pushes to `main`:

| Job | Actual current checks | Meaning |
| --- | --- | --- |
| **Build reader application** | Root `npm ci`; `npx playwright install --with-deps chromium`; `npm run lint`; `npm run build`; `npm run test:smoke` | Dependency installation, Playwright Chromium setup, ESLint verification, production build, and automated reader regression smoke suite |
| **Verify CMS adapters and BerryMark preview** | Root `npm ci`; `npm run test:adapter` | Adapter unit verification and BerryMark fixture tests |
| **Verify Sanity Studio** | In `studio/`: `npm ci`, `npm run test:schema`, `npm run typecheck`, `npm run build` | Studio install, schema tests, TypeScript check, and Studio bundle generation |

### Automated Reader Regression Smoke Suite (`npm run test:smoke`)

Enforced in the required `reader-app` CI job and runnable locally, this suite runs automated Playwright Chromium end-to-end tests across four distinct build passes with strict directory cleaning between them:
- **Pass 1 (Public Production Bundle):** Builds standard reader via `npm run build` and tests:
  - `tests/smoke/build-isolation.spec.ts`: Asserts complete absence of Developer Studio, ordinary-shell Challenge pilot, and participation persistence pilot navigation, inert `#/pilot/challenge` and `#/pilot/participation` route fallback, local data reset clearing `bibleberry-reader-participation-v1`, and exclusion of Lab, preview, and pilot code chunks (`InteractiveChallengeLab`, `SanityChallengeLab`, `BerryMarkLocalPreview`, `ordinaryChallengePilot`, `participationPilot`) and synthetic fixture/pilot payloads from the production bundle (R12 / Section 5).
  - `tests/smoke/navigation.spec.ts`: Tests onboarding flow (Colossians 3:16 to Today), standard returning reader startup, 4-tab app navigation (Today, Foundations, Archive, More), and direct shared teaching link navigation preserving target entry.
  - `tests/smoke/today-resume.spec.ts`: Tests Today activity recording into `localStorage`, journey activity rendering, and returning reader resume card actions (Return, Continue, Jump to today).
  - `tests/smoke/memorization.spec.ts`: Tests Sunday pilot Scripture memorization phrase-reveal practice, incremental phrase reveals, and clean resets (R08).
- **Pass 2 (Developer-Enabled Bundle):** Builds testing bundle with `VITE_ENABLE_DEVELOPER_STUDIO=true npm run build` and tests:
  - `tests/smoke/interactive-lab.spec.ts`: Tests Developer Studio entry, opening Interactive Challenge Lab, multi-screen Challenge navigation and completion, challenge bookmarking/saving, and strict storage key isolation (`bibleberry-interactive-challenge-lab-v1` vs `bibleberry-prototype-v1`) (R04, R09, R10, R12).
  - `tests/smoke/cms-challenge-player.spec.ts`: Tests shared `ChallengePlayer` and all nine CMS content block views against rights-safe synthetic fixture data, developer diagnostic retention, stable screen-ID resume and invalid screen-ID clamping, optional study/reflection non-requirement, reference-only Scripture metadata persistence, idempotent final-screen completion, 3-store namespace isolation (`bibleberry-sanity-challenge-lab-v1`), and narrow portrait layout with large reading text (R04, R05, R09, R10, R12, R13).
- **Pass 3 (Pilot-Enabled Ordinary Shell Bundle):** Builds ordinary-shell pilot bundle with `VITE_ENABLE_CHALLENGE_PILOT=true npm run build` (without `VITE_ENABLE_DEVELOPER_STUDIO`) and tests:
  - `tests/smoke/ordinary-challenge-pilot.spec.ts`: Tests opening `ChallengePlayer` via `OrdinaryChallengeHost` inside the normal `AppShell` without Developer Studio present, `#/pilot/challenge` deep-linking (including post-onboarding and browser Back/Forward navigation), suppression of CMS/Sanity diagnostics and unavailable-practice notices, optional study non-requirement, separate non-durable in-memory Challenge save / Scripture save / explicit final-screen completion with zero browser-storage writes, return to previous normal app surface, keyboard operation, and narrow portrait (`320px`, `375px`) + tablet landscape (`1024px`) layouts with large reading text (#44, A2).
- **Pass 4 (Participation-Pilot-Enabled Bundle):** Builds isolated persistence pilot bundle with `VITE_ENABLE_PARTICIPATION_PILOT=true npm run build` (without `VITE_ENABLE_DEVELOPER_STUDIO` or `VITE_ENABLE_CHALLENGE_PILOT`) and tests:
  - `tests/smoke/participation-pilot.spec.ts`: Tests `PersistedChallengeHost` and the durable participation store across full browser reloads via `#/pilot/participation`, verifying screen-ID resume across reload, `Back` to Screen 1 retaining durable `inProgress` status across reload, independent Challenge bookmarking and normalized reference-only Scripture saving (`'Not configured' -> null`, zero passage text persisted), explicit final-screen completion incrementing distinct completed count once and clearing `inProgress`, reread starting cleanly on Screen 1 without inflating completion count, isolated storage namespace (`bibleberry-participation-pilot-v1` only), and local app data reset (#46, A3).
- **Pass 5 (Released-Challenge-Enabled Bundle):** Builds controlled CMS-to-reader bundle with `VITE_ENABLE_RELEASED_CHALLENGE_ROUTE=true npm run build` and tests:
  - `tests/smoke/released-challenge.spec.ts`: Tests `ReleasedChallengeHost` and ordinary reader deep linking at `#/challenge/:slug`, verifying catalog provider integration, pure release-eligibility evaluation (exact boundary and timezone offsets), fail-closed capability token admission, multi-screen navigation and durable reload resume in `bibleberry-reader-participation-v1`, single-screen Start Challenge button lifecycle, missing slug empty state, embargoed future-release state without rendering player or screen content, validation failure notices, network failure recovery with Retry, and clean AppShell navigation (#41, A4.1).
- **Restoration:** Restores clean public build in `dist/` upon completion.

Useful local commands from a clean checkout:

```bash
# Reader app (repository root)
npm ci
npx playwright install chromium # Install Chromium browser for Playwright tests
npm run lint                    # ESLint verification (enforced in CI)
npm run build                   # Standard production build
npm run test:smoke              # Automated reader regression smoke suite (enforced in CI)
npm run test:adapter            # CMS adapter, participation domain/store, & BerryMark preview tests
npm run dev                     # Manual browser checks, developer tools available (pilots off)
npm run dev:pilot               # Manual browser checks with ordinary-shell Challenge pilot enabled
npm run dev:participation-pilot # Manual browser checks with isolated participation persistence pilot enabled
npm run dev:released-challenge  # Manual browser checks with controlled released Challenge route enabled

# Studio (run from repository root)
cd studio
npm ci
npm run test:schema
npm run typecheck
npm run build
npm run dev                     # authenticated editor checks require appropriate access
```

Issue #15 established ESLint verification in CI. Issue #26 established the automated reader regression smoke suite and CI enforcement via Playwright Chromium. Dependency-security investigation is tracked separately in **Issue #10**.

## 3. Reader smoke checks (manual, when applicable)

Use a development build for tests requiring Developer Studio. Test the ordinary production artifact separately for isolation (section 5). Choose a known fixture or developer simulation; record which date/content you tested. Never alter the published manuscript simply to facilitate a test.

| ID | What to exercise | Expected result |
| --- | --- | --- |
| R01 — Today | Load Today with normal date; use Developer Studio date simulation when needed | Correct available content and dates; no unintended future content or development controls in reader view |
| R02 — Navigation | Move between Today, Foundations, Archive, More, and available detail screens | Working links/back navigation, no dead ends, preserved reader context |
| R03 — Archive | Open a past Challenge and return; use Previous/Next through applicable sequence | Correct entry identity, order, release-date behavior, and accessible historical content |
| R04 — Guided teaching | Open a multi-screen Challenge, go forward/back, resume, finish | Correct order and full teaching/prayer retained; opening is not mistaken for completion |
| R05 — Optional content | Expand/collapse a deeper study; leave it unopened on another pass | Accessible toggle; completion never demands optional study or private reflection response |
| R06 — Disciplines | Enter a guided spiritual discipline; follow steps; open its evergreen library entry; leave early | Guidance and library links work; leaving or browsing does not invent completion |
| R07 — Worksheet | Open reflection/worksheet entry; view/download PDF where provided | Prompts match the intended worksheet; PDF opens/downloads correctly; no implied journal-response storage |
| R08 — Memorization | Practice multi-segment and one-phrase fixtures, reveal/restart, keyboard controls | Correct phrase order, full passage integrity, operable controls and screen-reader status |
| R09 — Saved Scripture | In the development Challenge Lab, add/remove a passage; reopen My Scripture and practice if configured | Independent saved-verse state, deduplication, removal; reference-only passages do not pretend text/practice exists |
| R10 — Lab Challenge state | In the development lab, save, resume, complete, reload, revisit | Separate saved/completed/position semantics; completion not inflated by revisiting; status survives refresh in this browser |
| R11 — Reader state | Change theme and text size, open a normal entry, reload, use Developer Studio reset/restore | Genuine preferences/history persist; temporary simulations reset without erasing genuine data |
| R12 — Isolation | Compare ordinary reader and lab after performing lab actions | Lab uses `bibleberry-interactive-challenge-lab-v1` independently of normal `bibleberry-prototype-v1`; no test-state leakage |
| R13 — Responsive and accessibility | Check narrow phones (e.g. 320, 375, 390 px), larger viewport, light/dark/system, large text, keyboard focus | No unintended horizontal overflow or clipped actions; labels/focus/expanded state remain usable |
| R14 — Errors | Watch browser console and failed same-origin requests during affected flows | No new uncaught exceptions, relevant 404s, or broken reader interactions |

When a feature changes, add targeted edge cases rather than assuming this table is exhaustive. For new account/sync functionality, write specific identity, permissions, deletion, and cross-device tests **before** declaring it ready. Those capabilities are not implemented by this checklist.

## 4. Sanity Studio/editorial checks (manual, when applicable)

Current Studio is **Milestone A**. Do not assume a working CMS-to-reader connection. Never publish an unapproved teaching draft during testing.

| ID | What to exercise | Expected result |
| --- | --- | --- |
| S01 — Editor access | Start Studio with a permitted origin and authenticated account if available | Editor opens; report blocked/not run if credentials or CORS access are unavailable |
| S02 — Draft template | Open the November 2 pilot setup/template | Expected existing series and Challenge fields; reopening does not silently duplicate content |
| S03 — Flexible structure | Inspect/reorder supported guided screens and structured blocks in an isolated draft | No arbitrary screen limit; order and meaningful visual/teaching structures remain intact |
| S04 — Editorial approvals | Inspect proposed structured blocks and whole-document review rules | Unapproved adaptations remain flagged and cannot satisfy the documented publication checks |
| S05 — Scripture rights | Inspect reference-only passage and memorization prerequisites | Text and practice unavailable until rights-cleared text is supplied and configured |
| S06 — Release and links | Inspect required release time, companion links and publishing validation | No invented release time or external URL; companion resources never gate Challenge completion |
| S07 — Integration boundary | For future CMS-to-reader PRs, test a validated authored Challenge in the reader and fallback/error behavior | Do not mark PASS until this integration actually exists and has been exercised |

Use copies or isolated drafts for destructive/editorial validation tests and document any created test data. Approval checks in an editor are *not* a substitute for Alexis's actual editorial approval.

## 5. Mandatory public-build isolation check for affected work

Changes to routes, imports, Developer Studio, environment flags, or packaging require **both** of these checks:

1. **Testing environment:** `npm run dev` or an intentionally enabled build with `VITE_ENABLE_DEVELOPER_STUDIO=true npm run build`. Confirm **More → Developer Studio → Interactive Challenge Lab** remains accessible and test workflows function.
2. **Ordinary public build:** run `npm run build` **without** the enabling variable, inspect the generated `dist/` and launch it with `npm run preview`. Verify no Developer Studio navigation, lab route, development controls, lab chunk, or fixture content is exposed. Document how the bundle and runtime were inspected; merely not seeing the menu is insufficient to prove assets are excluded.

Builds reuse `dist/`: inspect/capture the public artifact **before** overwriting it with a test-enabled build, or rebuild cleanly. Browser-local lab data must remain distinct from real reader state. Never treat a test-enabled build as a publishable release artifact.

## 6. Before merge and before release

**For every code PR:** required GitHub Actions checks are green; relevant manual checks have evidence or an explicit NOT RUN/BLOCKED explanation; security and editorial boundaries were reviewed; scope is limited to the approved Issue; affected existing flows still behave correctly. A code reviewer or Copilot comment does not authorize a merge. **Only Aaron accepts and merges**; content decisions requiring Alexis's approval remain pending until reviewed.

**For a release candidate:** retest against the intended release build and environment; include full applicable reader + Studio smoke suite, reader privacy/security review, keyboard/assistive-technology coverage, real-device/browser testing when supported, rollback readiness, and approval of production editorial material. If capability is not implemented or hardware access is unavailable, mark it honestly and determine whether it blocks release. Do not claim real iOS/Android or screen-reader validation based only on desktop Chromium.

## 7. PR verification report template

Copy this small table into the PR's **Test Results** section, adding lines for the relevant check IDs:

| Check / ID | Environment or command | Result | Evidence or limitation |
| --- | --- | --- | --- |
| Reader build | `npm run build` / CI link | PASS / FAIL / NOT RUN / N/A | Commit SHA or log |
| Studio typecheck/build | `npm run typecheck`, `npm run build` / CI link | PASS / FAIL / NOT RUN / N/A | Commit SHA or log |
| Changed-flow checks (Rxx/Sxx) | Browser/device + fixture/date | PASS / FAIL / NOT RUN / BLOCKED / N/A | Actual observations |
| Related regressions | IDs and environment | PASS / FAIL / NOT RUN / BLOCKED / N/A | Existing behavior observed |
| Public build isolation (if applicable) | `npm run build` plus bundle/runtime inspection | PASS / FAIL / NOT RUN / BLOCKED / N/A | Inspection method |

Also state the **commit SHA**, **files changed**, **remaining risks**, **known regressions**, and **untested environments**. This document provides expectations; it does not itself execute any tests.
