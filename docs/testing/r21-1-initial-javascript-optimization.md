# R21-1 — Initial Reader JavaScript Optimization

**Measured:** November 10, 2026  
**Scope:** Public React/Vite reader build and the R21-0 Chromium performance harness  
**Branch:** `perf/72-r21-1-initial-js`  
**Base:** `main` at `41477bf69351c0456f9d1bd91f5fd0402e28e420`

## Finding and change

The clean public build confirmed that `src/App.tsx` statically imported `FormationViews.tsx`. The ordinary Today flow does not use these views; they are used when opening the Foundations discipline library/resource or a feature-gated formation experience. The public entry contained the formation UI code before the change. The statically imported Developer Studio itself was already removed from the standard public build, so it was rejected as a bundle-size optimization target.

The three `FormationViews` exports are now loaded through React lazy imports when their routes render. A polite, visible status message appears while the chunk loads. The disciplines library and resource remain available from Foundations, and the development-only formation experience remains available through Developer Studio. No teaching, Scripture, styles, or content fixtures were changed.

The optimized public build emits `FormationViews-NKkP0cO_.js` at **19,432 bytes raw / 4,114 bytes gzip**. It is not linked as an initial entry asset and was not requested during initial, repeat, resume, Archive, or long-form reading measurements.

## Before/after build and transfer

Both measurements used a clean public production build, Vite 7.3.7, Chromium 156.0.8078.4, and five runs per environment. Initial entry sizes come from the performance runner; browser transfer is the same-origin initial resource timing.

| Initial public asset/measure | Before | After | Change |
| --- | ---: | ---: | ---: |
| Eager JavaScript entry, raw | 377,780 B | 360,642 B | −17,138 B (−4.5%) |
| Eager JavaScript entry, gzip | 116,170 B | 113,435 B | −2,735 B (−2.4%) |
| Eager JavaScript + CSS, raw | 519,538 B | 502,400 B | −17,138 B |
| Eager JavaScript + CSS, gzip | 139,751 B | 137,016 B | −2,735 B |
| Browser same-origin initial transfer | 140,351 B | 137,616 B | −2,735 B (−1.9%) |
| Entire `dist/` output, all assets | 610,254 B | 612,548 B | +2,294 B |

The all-assets total increases because the deferred chunk is now a separate file. This is not an initial-load cost; the browser harness observed the reduced same-origin transfer, and `index.html` lists only the main JavaScript and CSS entry assets.

## Browser measurements

The tables give median milliseconds followed by all five raw samples. Constrained runs used 4× CPU throttling, 150 ms RTT, 200 KiB/s download, and 96 KiB/s upload. Unthrottled runs had no explicit CPU or network throttling. The reader flow and timings match R21-0.

| Measurement | Before | After |
| --- | --- | --- |
| Cold visible reader, unthrottled | 138 (192, 173, 133, 138, 126) | 145 (160, 129, 160, 130, 145) |
| Repeat visible reader, unthrottled | 82 (81, 93, 82, 81, 82) | 81 (98, 82, 81, 81, 65) |
| Cold FCP, unthrottled | 116 (164, 144, 116, 112, 104) | 120 (132, 108, 132, 112, 120) |
| Repeat FCP, unthrottled | 52 (64, 64, 44, 44, 52) | 48 (68, 44, 52, 48, 44) |
| Cold visible reader, constrained | 1,391 (1,394, 1,391, 1,321, 1,397, 1,350) | 1,358 (2,052, 1,314, 1,358, 1,314, 1,425) |
| Repeat visible reader, constrained | 493 (489, 511, 476, 493, 495) | 494 (570, 477, 476, 510, 494) |
| Cold FCP, constrained | 1,304 (1,336, 1,312, 1,272, 1,304, 1,300) | 1,264 (1,988, 1,256, 1,264, 1,260, 1,336) |
| Repeat FCP, constrained | 456 (460, 448, 456, 480, 420) | 468 (552, 416, 448, 480, 468) |
| Navigate to Archive, constrained | 77.8 (78.2, 84.4, 65.0, 77.8, 76.3) | 74.6 (73.6, 74.6, 76.5, 59.9, 78.2) |
| Resume saved teaching, constrained | 85.7 (93.9, 85.4, 92.2, 83.0, 85.7) | 87.2 (98.4, 90.7, 85.9, 82.1, 87.2) |
| Open Archive teaching, constrained | 72.9 (72.9, 99.6, 57.9, 58.4, 96.0) | 70.6 (95.7, 86.5, 65.1, 70.6, 69.4) |

Cold constrained long-task counts were two in every run both before and after. Total durations were **180, 147, 133, 157, 152 ms** before and **305, 139, 132, 142, 157 ms** after. Every run rendered the same 27 teaching paragraphs and completed the saved-resume check; the harness reported no page JavaScript errors.

The byte reduction is repeatable and is the demonstrated improvement. The constrained timing distributions overlap and include an after-change outlier; five shared-runner samples do not establish a millisecond-level speedup or a long-task improvement. Google Fonts requests failed in both runs because the environment could not resolve the external host.

## Verification

| Command/check | Result |
| --- | --- |
| `npm run build` | PASS for the public production build. |
| `VITE_ENABLE_DEVELOPER_STUDIO=true npm run build` | PASS for the developer-enabled build. |
| `PERF_RUNS=5 npm run perf:baseline` | PASS before and after; identical harness settings and five samples per condition. |
| `npm run lint` | PASS. |
| `npx eslint src/App.tsx tests/smoke/navigation.spec.ts` | PASS. |
| `npx eslint tests/smoke/interactive-lab.spec.ts` | PASS. |
| `npm run test:adapter` | PASS, 176 tests. |
| `npm run test:gateway` | PASS, 67 tests. |
| `PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4175 npx playwright test tests/smoke/navigation.spec.ts` | 1 passed, 5 failed; the Foundations-to-discipline route assertions completed, but all five failures were the spec's global error check reporting the existing external iframe `chrome-error://` localStorage `SecurityError`. |
| `PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4175 npx playwright test tests/smoke/interactive-lab.spec.ts --grep "Developer Studio lazily opens"` | PASS, 1 test; confirms the lazy formation experience opens from Developer Studio in the feature-enabled build. |
| `npm run test:smoke` | FAIL in Pass 1: 2 passed, 10 failed. Failures are existing `SecurityError` exceptions when the embedded external podcast fails and the smoke harness's `addInitScript` accesses `localStorage` on `chrome-error://chromewebdata/`. The suite stops before its later feature-enabled passes. No harness/network workaround was added. |
| `git diff --check` | PASS. |

The smoke-run failure matches the limitation documented in the R21-0 report. The focused public library test's functional assertions completed before that global afterEach error. The public build-isolation checks also reached their final uncaught-error assertion; the environment prevented a fully green smoke result.

## Scope, risks, and remaining validation

Changed files: `src/App.tsx`, `tests/smoke/navigation.spec.ts`, `tests/smoke/interactive-lab.spec.ts`, and this report.

The first visit to the discipline library or a formation experience now waits for the small asynchronous module request and presents the loading status meanwhile. No physical low-end Android device was available; all startup timings are desktop Chromium emulation and are not Android acceptance evidence. The constrained timing results should be treated as noisy, not as a claimed time improvement. No dependency, service, CMS, publication, participation, or account-sync files changed.
