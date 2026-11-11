# R14-5: Earned Scripture Card Viewer (Month Screen)

## Preview and Privacy Boundary

- **Durable store authority only:** `resolveMonthDiscoveryPresentations` and `resolveDurableDiscoveryAward` in `src/components/month/monthScreenModel.ts` resolve viewable Scripture Cards exclusively from durable `ReaderParticipationStore` `EarnedAwardRecord` entries paired to canonical `discovery:YYYY-MM:<slug>` / `card:monthly:YYYY-MM:<slug>` identities and the active/historical `yearMonth`.
- **Provisional/stale progress never leaks Cards:** Even if a gateway progress payload includes `isEarned: true` and `earnedCard`, no Card thumbnail or viewer target is exposed unless the award has been durably admitted to `ReaderParticipationStore` with a matching `publicationYearMonth`, `discoveryId`, `kind`, and `validateEarnedCardSnapshot`-verified `EarnedScriptureCardSnapshot` (HTTPS `cdn.sanity.io` image URL without query/hash/userinfo, distinct `illustrationAlt` and `accessibleTranscription`, Scripture citation, attribution, and rights metadata).
- **Unearned & advance-preview isolation:** Advance preview (`mode === 'preview'`) withholds Monthly Discoveries entirely (`discoveries={[]}`). Unearned discoveries render only title and numeric progress (`achievedCount of targetCount`), with zero artwork, zero `<img>` tags, zero Card transcriptions/metadata, zero qualifying Challenge locations, and zero interactive targets.
- **No-art earned state:** If a durably earned record lacks a valid `EarnedScriptureCardSnapshot` (or `earnedCard` failed validation), the discovery displays the non-interactive `"Scripture card earned · Card artwork is unavailable"` state—never a gray silhouette, dead tap target, synthesized placeholder Card, or invented Bible text.
- **Resilience across offline/historical revisits:** Valid stored `EarnedAwardRecord` snapshots remain viewable from local storage even when `POST /api/months/:yearMonth/progress` fails on network error or when revisiting historical months.

## Presentation, Viewing State, and Focus Behavior

- **Direct Month Screen viewer:** `src/components/cards/EarnedScriptureCardViewer.tsx` renders a standalone accessible modal dialog (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`) directly from `MonthScreenView`, without routing through the Field Notebook or modifying global app navigation.
- **Card content:** Displays the validated original illustrated image (`object-fit: contain`, fallback notice if browser asset fetch fails), Card title, discovery/earned context, biblical reference/book/translation, full untruncated `accessibleTranscription`, optional themes, and honest `attribution` / `rightsStatus` metadata using existing CSS custom properties (`--surface`, `--page`, `--ink`, `--muted`, `--accent`, `--rule`, `--focus`, `--reading-size`).
- **Keyboard, screen reader, and mobile behavior:**
  - Earned thumbnails render as labeled `<button>` elements with a `"New"` badge while `cardViewed === false`.
  - Opening moves focus to the dialog Close button, traps `Tab` / `Shift+Tab` inside the dialog, supports `Escape` and backdrop/Close dismissal, and restores focus to the originating thumbnail `<button>` on close.
  - Responsive layout adapts to compact mobile viewports (`375px`) with vertical modal scrolling, no horizontal overflow, `--reading-size` scaling (`Compact` / `Default` / `Large`), and `@media (prefers-reduced-motion: reduce)` support.
- **Independent viewing flag (`markEarnedCardViewed`):** `MonthScreenHost` dispatches `markEarnedCardViewed` for the canonical `awardId` only after verifying the durable award and validated snapshot, without dispatching `acknowledgeAwardAnnouncements` or mutating `hubAnnouncementAcked` or `earnedOn`.

## Explicitly Deferred Work

- **Field Notebook & Hub announcements:** Browsing all earned cards by year/month, `All Earned Cards` gallery, lifetime status display, and combined Hub-only announcements (`acknowledgeAwardAnnouncements`) remain separate follow-on work.
- **Sharing & export watermark:** In-app sharing of original earned Cards with export-time Bibleberry watermark/attribution remains deferred.
- **Final visual & editorial artwork design:** Final field-book/notebook styling, custom illustration framing/cropping, typography, and badge design remain separate Aaron/Alexis design work.

## Verification Results

All browser smoke checks use synthetic mocked gateway responses, synthetic `cdn.sanity.io` 1x1 PNG image fulfillments, and local browser storage under the `VITE_ENABLE_MONTH_SCREEN=true` feature gate; no live Sanity writes or release/embargo bypasses are performed.

| Check | Outcome | Scope |
| --- | --- | --- |
| `npm run lint` | Passed | ESLint across repository (`0` errors, `0` warnings) |
| `npm run build` | Passed | TypeScript `tsc -b` + Vite production build |
| `npm run test:adapter` | Passed (226 tests) | Adapter, month screen model, and `earnedCardViewer` unit/boundary tests |
| `npm run test:native-participation` | Passed (10 tests) | Native Preferences / web storage V2 award persistence & migration tests |
| `npm run test:gateway` | Passed (101 tests) | Gateway handler, release eligibility, and earned-card projection tests |
| `npm run test:smoke` | Passed (49 tests across 7 build passes) | Public (15), Dev Studio (4), Challenge Pilot (2), Participation Pilot (5), Released Challenge (7), Gateway Released (8), Month Screen + R14-5 Card Viewer (8) |
| `npm run check:staging` | Passed | Wrangler `--dry-run` staging bundle verification |
| `git diff --check` | Passed | Clean whitespace/conflict check |

Known test limitation:
- Month Screen and Earned Scripture Card Viewer are gated behind `VITE_ENABLE_MONTH_SCREEN=true` on web (`Pass 7` of `npm run test:smoke`); real editorial artwork cropping, Hub announcement catch-up, and Field Notebook gallery browsing are outside this PR's scope and remain untested until those features are built.
