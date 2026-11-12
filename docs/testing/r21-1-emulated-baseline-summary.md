# R21 Reproducible Emulated Performance Baseline

- **Measured:** 2026-11-12T05:59:04.721Z
- **Git commit:** `0009751fb6caa6439620590565ef4974ca894aac` (branch `perf/122-low-end-android-baseline`, working tree clean)
- **Runtime:** Node v24.22.1, Chromium 156.0.8078.4
- **Host (unprivileged):** linux 7.2.6-arch2-1 (x64), Intel(R) Core(TM) i5-6500 CPU @ 3.20GHz, 4 logical CPUs, 31986 MiB RAM
- **Samples per environment:** 3
- **Scope notice:** Desktop Chromium mobile-viewport emulation only; not Android hardware or Capacitor WebView evidence.

> **Not Android hardware evidence:** All timings below come from headless desktop Chromium mobile-viewport emulation on a local development machine. Physical older/budget Android devices, Android WebView, and installed Capacitor APKs remain unverified until measured on hardware.

## Production Build Assets

Build mode: `production-public` (`dist/`, 12 files).

| Asset / Group | Raw size | Gzip size | Initial entry |
| --- | ---: | ---: | --- |
| `assets/index-DpW-_DHW.js` | 369.83 kB (378,711 B) | 116.27 kB (119,061 B) | Yes |
| `assets/index-D7jdw_ab.css` | 138.72 kB (142,046 B) | 23.13 kB (23,681 B) | Yes |
| **Initial JS + CSS total** | **508.55 kB (520,757 B)** | **139.40 kB (142,742 B)** | Yes |
| **All `dist/` files (12)** | **618.82 kB (633,672 B)** | **224.11 kB (229,489 B)** | Includes deferred & route-specific assets |

## Emulation Environments

- **unthrottled**: 390x844 CSS px, touch enabled, device scale factor 1; CPU throttling 1×; network: No explicit CPU/network throttling
- **constrained**: 390x844 CSS px, touch enabled, device scale factor 1; CPU throttling 4×; network: latency 150 ms, download 1638 kbps, upload 786 kbps

## Measured Metrics (Medians)

| Metric | unthrottled | constrained |
| --- | ---: | ---: |
| Cold visible-reader load (wall clock) | 1,010 ms (range 781 ms–1,393 ms) | 2,757 ms (range 2,530 ms–3,235 ms) |
| Cold First Contentful Paint (FCP) | 744 ms (range 652 ms–1,072 ms) | 2,412 ms (range 2,216 ms–2,416 ms) |
| Cold Largest Contentful Paint (LCP) | 744 ms (range 652 ms–1,072 ms) | 2,412 ms (range 2,216 ms–2,416 ms) |
| Cold DOMContentLoaded | 348 ms (range 339 ms–785 ms) | 1,518 ms (range 1,448 ms–1,756 ms) |
| Cold load event | 354 ms (range 340 ms–785 ms) | 1,540 ms (range 1,448 ms–1,759 ms) |
| Cold same-origin transfer | 143,342 B (range 143,342 B–143,342 B) | 143,342 B (range 143,342 B–143,342 B) |
| Cold JS + CSS transfer | 143,342 B (range 143,342 B–143,342 B) | 143,342 B (range 143,342 B–143,342 B) |
| Cold long-task count | 2 (range 2–3) | 4 (range 3–5) |
| Cold long-task total duration | 186 ms (range 149 ms–407 ms) | 860 ms (range 602 ms–908 ms) |
| Repeat visible-reader load (wall clock) | 515 ms (range 324 ms–606 ms) | 1,230 ms (range 1,096 ms–1,856 ms) |
| Repeat FCP | 428 ms (range 272 ms–440 ms) | 1,120 ms (range 948 ms–1,656 ms) |
| Repeat LCP | 428 ms (range 272 ms–440 ms) | 1,120 ms (range 948 ms–1,656 ms) |
| Repeat same-origin transfer | 600 B (range 600 B–600 B) | 600 B (range 600 B–600 B) |
| Resume saved teaching (Return) | 151 ms (range 141 ms–399 ms) | 708 ms (range 430 ms–834 ms) |
| Navigate to Archive | 139 ms (range 116 ms–181 ms) | 410 ms (range 339 ms–452 ms) |
| Open Archive teaching | 149 ms (range 145 ms–167 ms) | 407 ms (range 355 ms–529 ms) |
| Scripted full-page scroll | 630 ms (range 539 ms–654 ms) | 770 ms (range 718 ms–1,014 ms) |
| Scroll long-task count | 0 (range 0–0) | 1 (range 0–2) |
| Rendered teaching paragraphs | 27 (range 27–27) | 27 (range 27–27) |
| Reported JS heap used (Chromium) | 10,000,000 B (range 10,000,000 B–10,000,000 B) | 10,000,000 B (range 10,000,000 B–10,000,000 B) |

### Runtime Errors and External Requests

- **unthrottled**: console errors=0, page errors=0, failed requests=0, external font stylesheets=https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&family=Poppins:wght@400;500;600&display=swap, https://fonts.gstatic.com/s/lora/v37/0QIvMX1D_JOuMwr7Iw.woff2, https://fonts.gstatic.com/s/poppins/v24/pxiEyp8kv8JHgFVrJJfecg.woff2, https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLGT9Z1xlFQ.woff2, https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLEj6Z1xlFQ.woff2
- **constrained**: console errors=0, page errors=0, failed requests=0, external font stylesheets=https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&family=Poppins:wght@400;500;600&display=swap, https://fonts.gstatic.com/s/lora/v37/0QIvMX1D_JOuMwr7Iw.woff2, https://fonts.gstatic.com/s/poppins/v24/pxiEyp8kv8JHgFVrJJfecg.woff2, https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLGT9Z1xlFQ.woff2, https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLEj6Z1xlFQ.woff2

## Network Interruption Check (Public Production Bundle)

- **Scenario:** 4x CPU + 3G constrained initial load with blocked external fonts, then offline Archive -> Teaching navigation
- **Content source:** `bundled-historical-prototype-in-js` (server-backed Challenge verified: no)
- **Offline Archive -> Teaching open succeeded:** PASS (Rest Requires Trust, 27 paragraphs)
- **Blocked Google Fonts fallback readable:** PASS
- **Uncaught page errors:** 0
- **Interpretation:** Historical prototype teachings are statically bundled in the public JS entry, so Archive reading continues offline once loaded. This does NOT validate live server-backed Gateway Challenge fetches; see tests/performance/network-interruption.test.ts for isolated Gateway request failure and Retry verification.

> **Advisory report only:** No performance budget or threshold is approved or certified by this output.
