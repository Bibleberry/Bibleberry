# R21-0 — Reader Performance Baseline

**Measured:** November 10, 2026  
**Scope:** Existing public React/Vite reader, production build, desktop Chromium mobile-viewport emulation  
**Purpose:** Record a repeatable starting point and evidence for follow-up profiling. This is not a performance budget, an Android hardware acceptance test, or authorization to implement the candidate optimizations below.

## Summary

The public build has one initial JavaScript entry of **377.78 kB (116.17 kB gzip)** and one CSS entry of **141.76 kB (23.58 kB gzip)**. Together they accounted for **140,351 bytes** of same-origin resources in the browser's initial-load resource timing. Three cold-context runs produced a median visible-reader load of **185 ms unthrottled** and **1,593 ms with 4× CPU throttling and the constrained network profile**. The constrained samples varied from 1,452 to 2,117 ms on this shared runner.

The tested 27-paragraph November 5 teaching sample opened and resumed successfully. No page JavaScript exceptions occurred. The harness observed long tasks during some constrained cold starts, but none during the measured scroll intervals. It did not establish a sustained scrolling or memory problem. The browser could not resolve the external Google Fonts host, so those font requests failed in every run; this is an environment limitation, not evidence that production font delivery fails for readers.

## Environment and method

- **Host:** Ubuntu 24.04.3 LTS container, x86_64, 2 visible vCPUs on a shared AMD EPYC 9V74 host. This is not an Android device.
- **Runtime:** Node 26.12.1, npm 11.20.0, Vite 7.3.7, Playwright 1.64.1, headless Chromium 156.0.8078.4.
- **Artifact:** Standard `npm run build` public bundle, served locally with `vite preview`; testing flags were off. No Sanity/gateway request is part of this fixture-based reader.
- **Viewport:** 390 × 844 CSS pixels, touch enabled, device scale factor 1. Browser/device emulation only.
- **Unthrottled:** No explicit CPU or network throttling.
- **Constrained:** Chromium DevTools Protocol CPU rate 4×; 150 ms simulated latency, 200 KiB/s download (about 1.64 Mbit/s), and 96 KiB/s upload (about 0.79 Mbit/s).
- **Repetitions:** Three per condition. Each run uses a fresh browser context for the initial load, then reloads the same page/context for the repeat-load sample.
- **Flow/content:** Seed browser-local resume state, load Today, reload, use Return to resume the November 3 Sabbath entry, navigate to Archive, open the first listed November 5 teaching (“God’s Will for Our Lives”), and scroll its 27 rendered paragraphs through about 4,975 vertical pixels. The resume assertion checks the existing `bibleberry-prototype-v1` localStorage record.
- **Timing:** Initial/repeat load is measured from navigation start until the teaching heading is visible and two animation frames have passed. Paint values come from the browser Performance API. Navigation/resume/open timings measure Playwright click-to-visible completion. Scroll timing includes synthetic 600 px wheel events and a 40 ms dwell per step; it is not a natural-scroll frame-rate benchmark.
- **Commands:**

  ```sh
  npm ci
  npx playwright install chromium
  npm run build
  npm run perf:baseline
  ```

  Run `PERF_RUNS=5 npm run perf:baseline` for five samples per condition. The runner prints build-file sizes, per-run browser metrics, medians, console errors, page errors, failed requests, and asset requests as JSON. It requires the public `dist/` output from `npm run build`.

## Build and delivery measurements

| Public build item | Raw size | Gzip size | Initial request |
| --- | ---: | ---: | --- |
| Main JavaScript entry | 377.78 kB | 116.17 kB | Yes |
| Main CSS entry | 141.76 kB | 23.58 kB | Yes |
| Initial JS + CSS | 519.54 kB | 139.75 kB | Yes |
| All files in `dist/` | 610.25 kB | — | No; includes route-specific public assets |
| Worksheet preview PNG | 84.24 kB | — | No; used by the worksheet fixture |

The initial resource-timing total was 140,351 bytes, including the JS/CSS transfer and small same-origin resources. On repeat load, JS/CSS were served from browser cache; same-origin resource timing reported 600 bytes. The app has feature-gated lazy chunks for development/pilot/CMS routes, but the ordinary reader's initial JS is one entry. No images or font binaries were successfully transferred in these app runs.

## Browser results

Times are medians of three runs unless a range is shown. Cold-load wall time is reported separately from FCP because paint timing was unavailable in one unthrottled run.

| Measurement | Unthrottled | Constrained |
| --- | ---: | ---: |
| Initial visible-reader load | 185 ms (159–327) | 1,593 ms (1,452–2,117) |
| Initial FCP | 234 ms (2/3 samples; 168–300) | 1,520 ms (1,348–2,000) |
| Repeat visible-reader load | 128 ms (85–159) | 610 ms (595–675) |
| Repeat FCP | 72 ms (40–112) | 544 ms (500–636) |
| Navigate to Archive | 58 ms (33–83) | 84 ms (75–139) |
| Resume saved teaching | 68 ms (64–78) | 168 ms (116–218) |
| Open Archive teaching | 79 ms (46–84) | 107 ms (58–164) |
| Scripted full-page scroll | 443 ms (441–475) | 458 ms (438–521) |

On constrained cold loads, Chromium reported 1–3 long tasks per run, with total long-task duration of 204–596 ms. No long tasks were observed during the measured scrolling intervals. Every run rendered the same 27 teaching paragraphs and completed the saved-resume assertion. There were no uncaught page errors.

The CSS imports Lora and Poppins from Google Fonts. Requests to `fonts.googleapis.com` failed with `ERR_NAME_NOT_RESOLVED` in this environment (two failed attempts per run, covering initial and repeat navigation); no font payload was measured. Text remained readable using fallback fonts. `performance.memory.usedJSHeapSize` returned a constant 10,000,000 bytes in Chromium, so it is not useful as a heap measurement here. No process/RSS or retained-memory profile was collected.

## Findings and follow-up candidates

1. **Profile and reduce ordinary-reader initial JavaScript where practical.** The single main JS entry is 377.78 kB raw / 116.17 kB gzip and is requested before the ordinary reader appears; some navigation/content modules are statically imported by `src/App.tsx`. The constrained cold-load samples also contain main-thread long tasks. Consider measuring module contributions, then splitting non-initial destinations or content data without removing or shortening teaching. Likely files: `src/App.tsx`, `src/data/content.ts`, `src/data/sabbathFixtures.ts`, `src/data/formationFixtures.ts`, and `src/components/FormationViews.tsx`. Expected benefit: less initial transfer and JavaScript work. Regression risk: direct teaching links, resume, Archive/Foundations behavior, and exclusion of testing-only code. Acceptance: compare the same cold-load/transfer measurements and run existing public navigation, deep-link, resume, and build-isolation smoke tests.

2. **Verify external font delivery on a real network before changing it.** `src/index.css` imports Google Fonts, but this run could not resolve the host and measured no font bytes. If this is reproducible on supported reader connections, evaluate self-hosting only the used font weights or otherwise keeping the fallback path non-blocking. Likely file: `src/index.css` (plus licensed font assets only if approved). Expected benefit: fewer third-party requests and more predictable typography availability; no benefit is claimed from this failed-network measurement alone. Regression risk: font licensing, visual metrics, and layout changes. Acceptance: repeat online and unavailable-network tests on Android/browser, verify fallback readability, and compare font transfer and first-paint timings.

No third optimization is recommended from this baseline: the tested scroll did not produce long tasks, images were not part of initial delivery, and the available heap metric was capped/uninformative. Avoid adding virtualization or limiting teaching length without new evidence.

## Verification checks

| Command | Result |
| --- | --- |
| `npm ci` | PASS; installed the locked dependencies. npm reported 7 moderate dependency advisories; no dependency was added or changed. |
| `npm run build` | PASS; standard public production build completed. Vite emitted upstream Zod annotation warnings. |
| `npm run lint` | PASS. |
| `npm run perf:baseline` | PASS; three runs completed in each of the two environments and produced the measurements above. |
| `npm run test:smoke` | FAIL in Pass 1: 2 passed, 9 failed, so later build passes did not run. The failures were uncaught `SecurityError` exceptions while existing Playwright `addInitScript` callbacks access `localStorage` in a `chrome-error://chromewebdata/` document. A focused reproduction traced that document to the embedded external podcast request failing in this network-restricted environment. The browser test's init script runs on every document and assumes web-origin storage. No application or smoke-test source was changed in this assignment; this remains a test-harness limitation, and the full smoke suite is NOT verified. |

## Limits and next evidence

This is a desktop Chromium simulation in a shared Linux container, not physical low-end Android, Android WebView, a low-RAM device, a screen-reader test, or an installed app. CPU/network emulation is an approximation; timing noise is visible in the constrained samples. The localhost preview does not represent production hosting/CDN behavior. External Google Fonts were unreachable, and browser heap reporting was not useful. No performance threshold or CI gate is proposed.

The next acceptance step should repeat this flow on at least one actual older/budget Android phone and a representative mainstream Android device, recording Android/browser versions and measured memory/network conditions. Investigate the two candidates above only after those results confirm user-visible benefit.
