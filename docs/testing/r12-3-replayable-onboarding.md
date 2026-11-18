# R12-3: Replayable First-Use Onboarding Foundation — Testing & Verification

**Issue:** [#189](https://github.com/Bibleberry/Bibleberry/issues/189)  
**Branch:** `feat/r12-3-replayable-onboarding`  
**Worktree:** `/home/aaron/Projects/Bibleberry-r12-3`

## 1. Scope & Boundary

This milestone extracts a standalone, replayable onboarding flow and presentation contract without modifying `src/App.tsx`, shared guest storage, existing account code, navigation settings, or other Draft PRs.

Owned deliverables:
- `src/onboardingReplay/**` — types, preserved introductory content contract, pure flow state machine, and no-data-loss state guard (`applyOnboardingResultToReaderState`).
- `src/components/onboardingReplay/**` — standalone accessible `ReplayableOnboarding` component and scoped stylesheet (`ReplayableOnboarding.css`).
- `tests/onboardingReplay/**` — unit/state-boundary tests (`onboardingReplayModel.test.ts`), standalone Vite harness (`harness/`), and Playwright browser suite (`onboarding-replay.spec.ts`).
- `docs/testing/r12-3-replayable-onboarding.md` — this verification record.

## 2. Invariants Verified

1. **Preserved Content Contract:** The three-step teaching introduction (`WELCOME`, `A GENTLE DAILY RHYTHM`, `OPTIONAL DAILY REMINDER`) and `Colossians 3:16` aside match the existing `Onboarding` presentation in `src/App.tsx`.
2. **Two Entry Modes (`first-use` vs `replay`):**
   - `first-use` transitions `onboarded` to `true` on `Finish`, `Continue to Today`, `Not now`, or `Skip`, and persists across page reloads.
   - `replay` displays a `Replaying introduction` indicator and origin-aware return action (`Return to <origin.label>`), and invokes `onReturnToOrigin(origin)` on `Finish`, `Continue to Today`, `Skip`, or `Escape`.
3. **No-Data-Loss Invariants:** Completing, skipping, or interrupting `replay` (including mid-flow page reload) never resets `onboarded` to `false` and never erases reading positions, Saved Scripture, earned awards, preferences, or Shelf membership.
4. **Accessibility & Responsive Reflow:**
   - `role="status"` `aria-live="polite"` step announcements update on every step transition and include replay context when in `replay` mode.
   - `aria-current="step"` tracks the active step; advancing or going back moves focus to the step heading (`tabIndex={-1}`).
   - `Escape` exits `replay` mode cleanly back to the prior destination.
   - Verified at `320x700` mobile viewport and `200%` text zoom (`html { font-size: 200% }`) with zero horizontal overflow (`scrollWidth <= innerWidth`).

## 3. Executed Checks & Results

| Check | Command | Result |
| --- | --- | --- |
| Unit & state-boundary tests | `node --experimental-strip-types --test tests/onboardingReplay/onboardingReplayModel.test.ts` | **5 passed, 0 failed** |
| TypeScript & production build | `npm run build` (`tsc -b && vite build`) | **Passed** |
| ESLint | `npm run lint` (`eslint .`) | **Passed** |
| Standalone Playwright suite | `npx playwright test --config tests/onboardingReplay/playwright.config.ts tests/onboardingReplay/onboarding-replay.spec.ts` | **6 passed, 0 failed** |

### Environments / Untested Scope
- App-shell wiring into `src/App.tsx` is intentionally deferred to a future integration PR per R12-3 scope boundaries; all UI/reload checks were exercised against the standalone Vite harness at `tests/onboardingReplay/harness/index.html`.
- Native iOS/Android Capacitor wrappers were not executed for this standalone web component boundary.
