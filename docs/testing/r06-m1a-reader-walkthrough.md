# R06 M1a Connected Reader Walkthrough & Browser Acceptance Harness (`[Clover Compass]`, Issue #308)

## 1. Scope & Milestone Boundary

- **Assignment:** `[Clover Compass]` — [Issue #308](https://github.com/Bibleberry/Bibleberry/issues/308) (`WP-09a` increment)
- **Milestone:** `M1a` — Early Integrated Reader Walkthrough (bounded subgate within `M1`, integrating [Tidal Hearth #292](https://github.com/Bibleberry/Bibleberry/pull/292), [Bramble Anchor #330](https://github.com/Bibleberry/Bibleberry/pull/330), and [Opal Lantern #331](https://github.com/Bibleberry/Bibleberry/pull/331))
- **Explicit non-claims:**
  - Automated `PASS` in this synthetic-gateway browser suite **does not** establish live Cloudflare Access / Worker / private Sanity `staging` qualification (`M2` Alpha A–C), full `WP-09b` `G09 J1–J7` whole-application acceptance (`M1`), physical mobile-device qualification, [Glass Atlas #265](https://github.com/Bibleberry/Bibleberry/issues/265) visual acceptance, or Aaron Waid's separate hands-on `M1a` checkpoint decision.
  - Hosted GitHub Actions execution of `npx playwright test --config tests/readerShell/playwright.config.ts` is owned separately by [Parchment Circuit #309](https://github.com/Bibleberry/Bibleberry/issues/309).

## 2. Reproducible Commands & Build Configuration

| Check | Command | Feature flags / environment |
| --- | --- | --- |
| **M1a connected browser acceptance (`20` cases)** | `npx playwright test --config tests/readerShell/playwright.config.ts` | Boots two real Vite application servers from `index.html` → `src/main.tsx`: flag-on (`VITE_ENABLE_R06_SHELL='true'`) and flag-off (`VITE_ENABLE_R06_SHELL='false'`), with `VITE_RELEASE_GATEWAY_ORIGIN=''`, `VITE_GATEWAY_ORIGIN=''`, `VITE_ENABLE_FIELD_NOTEBOOK='false'`, `VITE_ENABLE_SAVED_SCRIPTURE='false'`. All `https://**` requests are aborted in `beforeEach`. |
| **Deterministic R06 Node unit & fixture-schema suite (`45` cases)** | `npm run test:reader-shell` | Node `--experimental-strip-types --test tests/readerShell/*.test.ts` (including `m1aGatewayFixtures.test.ts` validating synthetic payloads through `createGatewayMonthProvider`, `createGatewayChallengeProvider`, `createGatewayCatalogProvider`, `admitGatewayMonthProgressAwards`, and `deriveTodayPrimaryAction`). |
| **Flag-on & default production builds** | `VITE_ENABLE_R06_SHELL=true npm run build && npm run build` | Verifies TypeScript project references (`tsc -b`) and Vite production bundles for both flag states. |

Before navigation, the browser suite fixes the device clock at `2026-11-10T12:00:00Z` (November 10 at 7:00 a.m. in `America/New_York`). Today uses that device date to bootstrap its November Month request. The default synthetic gateway authorizes November 15, 2026 in `America/New_York`. The month-boundary test supplies December 1 in `Pacific/Auckland` and October 25 in `Pacific/Honolulu` to exercise recovery from the initial November request.

## 3. Synthetic Gateway Fixture Inventory (`tests/readerShell/fixtures/m1aGatewayFixtures.ts`)

- **Authoritative date context:** `serverContext = { authorizedLocalDate: '2026-11-15', effectiveTimeZone: 'America/New_York' }`.
- **Current active Month (`2026-11`):** 30 slots (`phase: 'active'`), including 3-screen `november-challenge-14` (`cms:november-reading-14`), Today's `november-challenge-15` (`cms:november-reading-15`, 2-screen default + 3-screen `todayMultiScreenChallenge` variant), locked `comingSoon` slots for Days `16–30`, one thematic discovery (`discovery:2026-11:november-reading`) with a schema-validated `earnedCard` snapshot (`card-november-reading`), and one `fullMonth` discovery (`discovery:2026-11:full-month`, placed last, strictly withholding `awardId` and Card metadata while unearned).
- **Historical Month (`2026-10`):** 31 available slots (`phase: 'historical'`), Day 25 `test-challenge-25` (`cms:october-reading-25`), and `discovery:2026-10:october-reading`.
- **Authorization-negative fixtures:** Neutral gateway `404` / `410` withdrawn/embargoed Challenge responses, defense-in-depth unreviewed Challenge payloads (`adaptationReviewed: false`) carrying `RESTRICTED_MANUSCRIPT_SENTINEL`, and privacy-violating unearned progress payloads carrying `RESTRICTED_CARD_ART_SENTINEL` / `RESTRICTED_CARD_IMAGE_URL` to prove zero body, Card art, completion, or award leakage.
- **No fake UI:** Neither `TodayHost`, `MonthScreenHost`, `ReleasedChallengeHost`, `PersistedChallengeHost`, nor `ChallengePlayer` is mocked or replaced; removing or breaking any real host fails the suite directly.

## 4. Integrated Browser Coverage Summary (`tests/readerShell/shell.spec.ts`)

1. **Legacy flag-off isolation (1 case):** `VITE_ENABLE_R06_SHELL=false` renders legacy `Today | Foundations | Archive | More`, omits `Collections` and `r06-today-landing`, issues zero `/api/months/**` R06 requests, and never initializes `bibleberry-r06-navigation-v1` in `sessionStorage`.
2. **Shell chrome, responsive reflow & tab restoration (3 cases):** `320px`/`375px` at `200%` root font size without horizontal overflow, `1024px` rail layout, keyboard tabbing, per-tab nested route/scroll/focus restoration across `Collections` and `More`, active-tab re-tap reset, and `sessionStorage`-blocked resilience.
3. **Today → Challenge → Finish, multi-screen reload persistence & Read Again idempotence (6 cases):**
   - Direct Today Challenge open without a Monthly Introduction detour; global navigation hidden during reading.
   - 3-screen Today progression (`Screen 1 of 3` → `Screen 2 of 3` → `Screen 3 of 3`): mid-Challenge browser `reload` reauthorizes and restores `Screen 2 of 3`; reaching the final screen (`Screen 3 of 3`) without tapping `Finish` records zero completions and zero awards; `Exit` from the final screen + `Today` `reload` preserves `In Progress` (`Resume Today’s Reading`) and resumes at `Screen 3 of 3`; `Start from Beginning` resets only reading position to `Screen 1 of 3`.
   - Explicit `Finish` returns to `Today` (`Completed`, `Read Again`) and reconciles the gateway-authorized thematic Scripture Card award (`earnedOn: '2026-11-15'`).
   - Partial reread + `Exit` and full `Read Again` + `Finish` keep `Today` `Completed` and preserve unique completion and earned Card records unchanged.
   - Gateway month-boundary recovery (`ready` date mismatch and `404` → News context), stale response supersession, `Explore This Month` fallback on unreleased/withdrawn slots, single secondary `Continue Your Study`, and corrupt participation-store error reporting without data mutation.
4. **Current & historical Month-origin walkthrough, tab switching & Back/Forward integrity (2 cases):**
   - `Today` → compact Current Month link (`#/month/2026-11`) → one-time Monthly Introduction → `0 of 30` ticker, unearned discoveries showing title + numeric progress only (zero Card art), locked `Coming Soon` rows → 3-screen `November Challenge 14` → explicit `Finish` → returns to `#/month/2026-11` (not `Today`) with scroll and focus restored, `1 of 30` ticker, and earned thematic Card button while `fullMonth` (`1 of 30`) stays hidden.
   - Multi-tab switching (`Today` on `#/month/2026-11` → `Library` → `Collections / Field Notebook` → `More` → `Today`), active-tab re-tap reset, `reload`, and browser `Back`/`Forward` never strand legitimate in-session visits on `Month unavailable`, `Challenge unavailable`, or `Page unavailable`.
   - Historical Month (`2026-10`) via `Library → Browse All Months` scroll/focus/reread/award preservation.
5. **Authorization-negative & trust-boundary paths (8 cases):**
   - Withdrawn Today Challenge (`404`), unreviewed/unauthorized Month Challenge (`adaptationReviewed: false`), privacy-violating unearned Card art metadata in progress responses, direct unreleased `comingSoon` hash (`404`), gateway `403`/`404`/`410`/`503`/malformed envelopes, slug/documentId mismatch, history-revisit withdrawal, abandoned-visit late authorization, forged URL `?origin=month`, and quota-exceeded `Retry Finish` recovery — all verified with zero restricted body/Card art leak and zero unauthorized completion or award credit.

## 5. Owner Hands-On M1a Walkthrough Checklist (Aaron Waid)

Use this checklist on the exact integrated candidate commit when performing the separate owner hands-on `M1a` walkthrough:

- [ ] **Candidate identity recorded:** Exact `git rev-parse HEAD` SHA, branch, `VITE_ENABLE_R06_SHELL=true` flag, and gateway source (local synthetic dev/fixture server vs. private staging gateway).
- [ ] **Today landing & visual hierarchy ([Glass Atlas #265](https://github.com/Bibleberry/Bibleberry/issues/265) check):** Inspect `Today` primary teaching card, status pill, `Open Today’s Reading` / `Resume Today’s Reading` / `Read Again` CTA, compact `Current Month` link, and secondary `Continue Your Study` spacing at phone (`320px`/`375px`) and wide (`1024px+`) widths. Record visual/layout feedback explicitly as owner notes.
- [ ] **Focused Challenge Reader & Finish-only credit:** Open today's Challenge from `Today` (confirm no Monthly Introduction detour and hidden primary nav), step across multiple screens, test `Exit`, page reload, `Resume`, `Start from Beginning`, and explicit `Finish` → `Today` return; test `Read Again` and confirm no duplicate progress or jarring transitions.
- [ ] **Current Month Screen & return restoration:** Open `Current Month` from `Today`, step through the one-time Monthly Introduction, scroll the weekly agenda, open an available Challenge, `Finish`, and confirm return to the same Month Screen scroll position with silent progress update and hidden unearned Card art.
- [ ] **Four-tab & browser navigation feel:** Switch across `Today | Library | Collections | More`, re-tap an active tab to reset to its landing, and exercise browser `Back` / `Forward` / reload. Note known `M1a` placeholders still scoped to later `M1` packages (e.g., `Foundations unavailable` under `Library`, `R06LibraryLanding` mounting in `Marble Harbor #312`, inline Hub Card announcement in `WP-06a`, Guided App Tutorial in `WP-07c`).
- [ ] **Owner disposition recorded:** Record `M1a` walkthrough UX feedback and [Glass Atlas #265](https://github.com/Bibleberry/Bibleberry/issues/265) disposition separately from automated test `PASS`.
