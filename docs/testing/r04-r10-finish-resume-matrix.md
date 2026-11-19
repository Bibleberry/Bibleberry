# R04/R10 Challenge Finish and Resume Regression Matrix

**Issue:** [#226 — Maple Lantern](https://github.com/Bibleberry/Bibleberry/issues/226)  
**Evidence basis:** repository source and committed test inspection; run results are listed separately below. This matrix describes current implementations and harness boundaries, not all planned product experiences.

## Implemented reader/player paths

| Implemented path / supported variant | Current exercise surface | Existing and added coverage | Remaining invariant gap |
| --- | --- | --- | --- |
| Shared multi-screen `ChallengePlayer` in the ordinary prototype shell | Feature-gated ordinary reader pilot; synthetic content, not a released CMS experience | `tests/smoke/challenge-accessibility.spec.ts` checks keyboard navigation, focus, explicit Finish, large text and narrow viewport. `tests/smoke/ordinary-challenge-pilot.spec.ts` covers the host. | No assistive-technology run against native iOS/Android; browser simulation is not a substitute. |
| Sanity CMS Challenge Lab using the shared player and CB1–CB9 rendering variants | Explicitly selected Developer Studio fixture; diagnostics/development surface, not production discovery | `tests/smoke/cms-challenge-player.spec.ts` renders all nine blocks, checks optional reflection/study/companion behavior, stable screen-ID reload, removed-ID clamp, Finish and revisit idempotence, focus and narrow viewport. | Existing block fixture is synthetic and renderer coverage does not imply nine Challenge formats or all content combinations. |
| Durable participation host for canonical CMS Challenge identity | Separate participation reload pilot; production host/store code exists, pilot route is feature-gated | `tests/smoke/participation-pilot.spec.ts` covers reload, progress, completion and namespace separation. `tests/participation/guestAwardsV2.test.ts` covers async persistence, failed writes/retry and V1/V2 recovery. New `tests/participation/challengeLifecycle.test.ts` adds slow hydration, failed-write recovery, cross-Challenge IDs, Finish single-flight and return idempotency; it runs via `npm run test:native-participation`. | Native lifecycle interruption and real device storage are not exercised by these Node/browser tests; cloud account merge is a separate capability. |
| Released CMS Challenge detail host | Controlled, feature-gated route through the release gateway; catalog-to-detail flow is not the complete Hub/Month/Shelf/Library app | `tests/smoke/released-challenge.spec.ts`, `tests/smoke/gateway-released-challenge.spec.ts`, and staging evidence recorded in `docs/testing/regression-smoke-checklist.md`. | Live staging evidence used a one-screen fixture; multi-screen completion and reopen were not part of that specific live run. Browser mocks do not establish live gateway state. |
| Month Screen Challenge launch and return origin | Feature-gated Month Screen integration, backed by injected/mocked month data in browser smoke | `tests/smoke/month-screen.spec.ts` covers Month Screen Challenge finish/return. `tests/smoke/gateway-released-challenge.spec.ts` checks Month, Shelf and Library origin contexts on Finish and exit. `src/cms/reader/challengeOrigin.ts` plus the lifecycle regression check origin parsing/round-trip and guarded duplicate return. | All origins are not independently verified in a live app plus durable backend end to end. Full production navigation integration remains partial. |

### Coverage against requested invariants

| Invariant | Evidence / status |
| --- | --- |
| Viewing, scrolling, last-screen arrival, Back, optional reflection/study/companion content do not finish silently | Covered by CMS and accessibility smoke; new Node regression verifies Finish is offered only on the final required screen and optional material is not part of completion gating. |
| Duplicate Finish and re-entry do not duplicate completion or return | Existing browser completion/revisit coverage; new Node regression checks controller single-flight. Participation reducer/store records completion by canonical key, so repeated same-ID completion remains one record. |
| Resume uses stable screen identity; removed IDs clamp safely | Existing CMS reload/clamp smoke plus new Node regression for reorder and missing identity. Invalid identity resolves to the first required screen, preventing a skip. |
| Slow hydration, interrupted write, retry, and recovery | Existing participation async adapter tests; new isolated driver test dispatches during slow hydration, simulates one failed write, retries, then verifies cold reload. Guest and new-account transfer paths are outside this player's scope. |
| Canonical challenge IDs and origin namespaces stay separate | Existing CMS/pilot namespace smoke plus new distinct canonical IDs and origin round-trip checks. |
| Keyboard and screen-reader focus; narrow/large text | Existing browser smoke verifies keyboard activation, focus movement, ARIA progress, 375/320 CSS-pixel layouts and large reading text. A true screen-reader/native-device check is not represented by the browser harness. |
| Nine CMS blocks are rendering variations, not completion prerequisites | Existing synthetic fixture renders CB1–CB9. Finish behavior is controlled by required-screen position, not the presence of an optional content block. |

## Envisioned formats that still need decisions

The CMS architecture says **seven Challenge experience types are envisioned**, while their exact names/taxonomy, format-specific schemas, interactions, and intrinsic completion contracts remain unspecified. The current Sanity type union (`teaching`, `discipline`, `reflection`, `memorization`) is not evidence of seven independently implemented experiences. CB1–CB9 are nine supported content block identifiers, not seven formats. No format-specific behavior is assigned here. Aaron and Alexis need to decide the taxonomy and acceptance semantics before those experiences can be claimed or implemented.

## Verification record

Commands run in this workspace:

- `npm run test:native-participation` — passed (3 test files; includes five lifecycle subtests and guest award persistence/recovery).
- `npm run build` — passed (`tsc -b && vite build`). Vite emitted dependency annotation notices from Zod; build completed successfully.
- `npm run lint` — passed.
- `npm run test:smoke` — initial restricted run could not bind its local Vite preview server (`listen EPERM` on `127.0.0.1:0`). Retried with loopback access; all seven configured passes succeeded: 15 public, 4 Developer Studio, 2 ordinary Challenge, 5 participation, 7 released Challenge, 8 gateway Challenge, 8 Month Screen tests (49 total).
- `git diff --check` — passed.

Source inspection and committed prior smoke coverage are not a substitute for reporting new test execution. This document does not assert production-path, native-device, real-account, or full accessibility certification.
