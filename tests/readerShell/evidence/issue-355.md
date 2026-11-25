# Silent Observatory browser evidence

## Before

Reproduced against local `main` at `acc97ecb50bf8b1a8c42dbdca63f8d44c069713d` (the checked-out baseline before this branch's edits), with the R06 flag enabled, a 320px-wide Chromium viewport, and `document.documentElement.style.fontSize = '200%'` (32px root text).

The four navigation buttons were still laid out in four equal columns. Each button was 68px wide and 256px tall; `Today` and `Collections` broke across several lines, including inside the words. The document itself had no horizontal overflow, so an overflow-only check missed the failure. The `Today` announcement's shared `.button` label remained at the fixed 13px declaration while the root text was 32px; `.button--small` was fixed at 12px.

The committed before screenshot replays the baseline declarations in the synthetic browser harness: `repeat(4, minmax(0, 1fr))`, `overflow-wrap: anywhere`, 13px `.button`, and 12px `.button--small`. This keeps the original failure reproducible without restoring broken styles in the test suite.

## After

`responsiveAccessibility.spec.ts` captures the 320px and 375px 200% text navigation, Today announcement, and discoveries gallery screenshots under `test-results/issue-355/`. CI uploads them as `silent-observatory-browser-evidence-<commit SHA>` for 30 days. The tests assert 13px → 26px shared button scaling, 16px → 32px navigation scaling, intact labels, 44px minimum navigation targets, no page-width overflow, keyboard operation, and the Today → View Discoveries → Return to Today path.

These are Chromium browser checks with CSS root-text enlargement emulation. They are not physical-device or actual screen-reader checks.
