# R21-1 — Low-End Android Acceptance Matrix, Risk Register, and Decision Handoff

**Date:** November 12, 2026  
**Branch:** `perf/122-low-end-android-baseline`  
**Related Issues:** [#122](https://github.com/ContraPhilosophy/Bibleberry/issues/122), umbrella [#37](https://github.com/ContraPhilosophy/Bibleberry/issues/37)  
**Supporting Artifacts:**
- Machine-readable emulated baseline: [r21-1-emulated-baseline.json](r21-1-emulated-baseline.json) (recorded at commit `0009751fb6caa6439620590565ef4974ca894aac`)
- Human-readable baseline summary: [r21-1-emulated-baseline-summary.md](r21-1-emulated-baseline-summary.md)
- Reproducible baseline runner: `scripts/performance-baseline.ts` (`PERF_RUNS=3 npm run perf:baseline`)
- Advisory comparison CLI: `scripts/performance/compare-r21-baselines.ts` (`npm run perf:compare`)
- Performance & network-interruption tests: `tests/performance/compare-r21-baselines.test.ts`, `tests/performance/network-interruption.test.ts` (`npm run test:performance`)

> **Qualification status:** This milestone establishes reproducible emulated measurement, comparison, and network-resilience tooling plus a qualification plan. **It does NOT certify older/inexpensive Android hardware or Capacitor WebView launch readiness.** All real-device cells below remain **UNVERIFIED** until tested on physical hardware.

---

## 1. Device and Network Acceptance Matrix (For Aaron's Approval)

| Tier | Target Device / Profile | Hardware / OS / WebView | Network & CPU Condition | Status |
| --- | --- | --- | --- | --- |
| **Tier 1 (Launch-gating low-end Android)** | Inexpensive / older Android phone (~2 GB RAM class, e.g., entry-level Android Go or older Android 10–12 handset) | Exact model, Android version, and Android System WebView version: **UNVERIFIED (to be recorded during physical test)** | Slow cellular / constrained Wi-Fi + mid-load airplane-mode interruption & recovery | **UNVERIFIED** |
| **Tier 2 (Representative mainstream Android)** | Current/recent mid-range Android phone (4–8 GB RAM) | Exact model, Android version, and Android System WebView / Chrome version: **UNVERIFIED (to be recorded during physical test)** | Standard cellular/Wi-Fi + throttled/interrupted transition | **UNVERIFIED** |
| **Tier 3A (Emulated constrained desktop Chromium)** | Headless Chromium 156.0.8078.4 mobile viewport (`390×844`, touch, DPR 1) on Linux x64 (`i5-6500`, 4 logical CPUs) | Desktop Chromium emulation only (not Android WebView or Capacitor APK) | CDP 4× CPU throttling; 150 ms latency, 1,638 kbps down, 786 kbps up | **MEASURED (emulation only)** |
| **Tier 3B (Emulated unthrottled desktop Chromium)** | Headless Chromium 156.0.8078.4 mobile viewport (`390×844`, touch, DPR 1) on Linux x64 (`i5-6500`, 4 logical CPUs) | Desktop Chromium emulation only (not Android WebView or Capacitor APK) | Local `vite preview`, no explicit CPU/network throttling | **MEASURED (emulation only)** |

### Emulated vs. Real-Device Interpretation Notes

1. **Desktop emulation ≠ Android WebView:** Emulation on an x86_64 desktop CPU with 31 GiB RAM cannot reproduce mobile thermal throttling, eMMC/UFS flash latency, 2 GB RAM background-process eviction, or Android System WebView cold-start overhead.
2. **Concurrent host load affects timing:** On this shared 4-CPU development host, multi-workspace tasks running concurrently increased unthrottled/constrained timing variance (for example, constrained cold visible-reader load median was `2,757 ms` at commit `0009751` vs `5,218 ms` during heavy concurrent host load earlier in the session, while build asset byte counts remained identical at `142,742 B` initial JS+CSS gzip). Use build byte metrics as deterministic signals and treat single-machine timings as noisy ranges.
3. **Public prototype vs. server-backed Challenge:** In the standard public build (`npm run build`), historical prototype teachings are statically bundled into `assets/index-*.js`, so Archive teachings continue to open offline once loaded. By contrast, a true server-backed Challenge (`VITE_ENABLE_RELEASED_CHALLENGE_ROUTE=true`, `VITE_ENABLE_RELEASE_GATEWAY_SOURCE=true`) fetches `GET /api/challenges/:slug` from the release gateway and surfaces an explicit `Unable to load Challenge` alert with a `Retry` button when interrupted (verified in `tests/performance/network-interruption.test.ts`).

---

## 2. Key Future Manual Real-Device Tests (Tier 1 & Tier 2)

Run these checks on the approved physical Android devices (browser + installed Capacitor Android APK) and record exact device model, Android OS version, Android System WebView version, observed latency/jank, and pass/fail evidence:

1. **Open Hub (Today) — Cold & Repeat Start:** Launch from killed app/tab state and again warm; verify Today renders cleanly without blank screen hangs or uncaught errors.
2. **Open Challenge (Gateway-backed & Bundled):** Open a released Challenge from Hub/Month/deep link; confirm loading indicator appears promptly and transitions cleanly to Screen 1.
3. **Long Rich Teaching:** Open a full-length teaching (e.g., 27+ paragraphs with pull quotes, reflection, prayer, and optional media panels) without truncating Alexis's teaching; confirm layout and scroll remain responsive.
4. **Resume & Reload Continuity:** Leave mid-Challenge or mid-teaching, reload or reopen the app, and confirm Today resume card and `ReleasedChallengeHost` screen-ID resume restore the expected position without duplicating completion.
5. **Large Text Accessibility:** Enable `Large` reading text in `More -> Appearance & reading` (and system font scaling on Android); verify readable wrapping, zero horizontal overflow, and responsive controls on narrow screens (`320–390 px`).
6. **Saved Scripture:** Save/unsave Scripture references and open Saved Scripture collection; verify smooth list rendering and persistence across restart.
7. **Touch Scroll:** Perform natural fling and slow reading scrolls through long teachings, Archive, and Month screens; inspect for dropped frames or input lag.
8. **App Background / Foreground Lifecycle:** Background the Capacitor Android app mid-reading for 30+ seconds and under memory pressure (opening other apps), then foreground; verify WebView state does not crash, freeze, or lose saved progress.
9. **Interrupted & Recovering Network:** Drop connectivity mid-request when opening a server-backed Challenge or Month screen; verify understandable retry UI (`Unable to load Challenge` + `Retry`), then restore connectivity and verify `Retry` recovers cleanly without leaking embargoed content or falling back to direct Sanity reads.

---

## 3. Prioritized Performance Risks (Evidence-Backed)

| Priority | Risk & Evidence | Likely Impact on Older/Budget Android | Recommended Next Investigation (No Unapproved Changes Yet) |
| --- | --- | --- | --- |
| **P1 (High)** | **Eager public JS+CSS payload & cold-start main-thread work.** Current public build (`0009751`): main JS entry is `378,711 B` raw (`119,061 B` gzip) + CSS `142,046 B` raw (`23,681 B` gzip) = `520,757 B` raw (`142,742 B` gzip). Emulated constrained cold load triggered `3–5` long tasks totaling `602–908 ms` and `2,530–3,235 ms` wall-clock load. (Initial JS also grew from `113,435 B` gzip in R21-1 on Nov 10 to `119,061 B` gzip as new features merged.) | Parse/compile/hydration of a ~379 kB JS bundle is disproportionately expensive on low-core ARM CPUs and 2 GB RAM WebViews, risking >3 s blank/unresponsive startup. | Profile module contributors inside the main entry (e.g. Zod locales/schemas, statically imported fixture sets, Lucide/Router/feature code) and lazy-load non-initial routes/features without altering teaching text. |
| **P1 (High)** | **Unverified ~2 GB RAM WebView memory & background/foreground retention.** Headless Chromium reported a capped constant `10,000,000 B` for `performance.memory.usedJSHeapSize`, providing zero real memory signal. | Android System WebView OOM kills or page reloads when backgrounded on ~2 GB RAM devices cannot be detected in desktop Chromium. | Capture real Android `adb shell dumpsys meminfo` / Chrome DevTools memory snapshots during Tier 1 manual tests across Hub, long teachings, Month Screen, and Saved Scripture. |
| **P2 (Medium)** | **Third-party Google Fonts stylesheet (`Lora` and `Poppins` in `src/index.css`).** Observed 5 external requests (`fonts.googleapis.com` CSS + 4 `.woff2` files) on initial load when online, and repeated DNS failures in air-gapped environments (documented in R21-0). | Extra DNS/TLS round-trips and layout/font swap jitter on high-latency 3G, plus wasted connection attempts offline. | Test real-network Android font loading vs fallback readability; if needed, evaluate self-hosting only required weights with `font-display: swap` after Aaron/Alexis review. |
| **P2 (Medium)** | **Cumulative growth as Month Screen, Saved Scripture, and Field Notebook ship.** Current public build has flags off; enabling gateway/month/collection features will change initial vs lazy chunk boundaries. | Unmonitored bundle growth could push initial transfer well past budget-Android comfort before launch. | Run `npm run build && npm run perf:baseline` + `npm run perf:compare` manually at milestone checkpoints to track initial JS/CSS gzip deltas. |
| **Low (Observed non-issue so far)** | **Long-form reading scroll performance.** Emulated unthrottled scroll produced `0` long tasks (`0 ms`), and constrained scroll produced `0–2` minor long tasks on a 27-paragraph teaching (`4,975 px`). Images (`sabbath-development-study.svg`, `weekly-rhythm-pilot-journal.png`) were not loaded on initial Today render. | Low risk for current text-first teaching layout. | Re-verify only when rich illustrated Scripture cards or large image galleries are rendered in real device tests; do not add list virtualization or shorten teaching prematurely. |

---

## 4. Proposed Thresholds (**PROPOSALS ONLY — NOT APPROVED OR PASSED**)

The figures below are **unapproved starting proposals** for discussion after Tier 1 physical Android measurements exist. **No threshold is currently approved, enforced, or certified as passing.**

| Metric | Current Emulated Constrained Median (`0009751`) | Proposed Draft Target (Unapproved) | Rationale |
| --- | ---: | --- | --- |
| Initial eager JS entry (gzip) | `119,061 B` (`116.27 kB`) | **Proposal:** `≤ 130 kB` gzip (`≤ ~133,000 B`) | Keeps cold-start parse/compile bounded on low-end ARM WebViews while allowing core reader + participation logic. |
| Initial eager JS + CSS total (gzip) | `142,742 B` (`139.40 kB`) | **Proposal:** `≤ 160 kB` gzip | Keeps critical-path same-origin transfer under ~1 s wire time on 1.6 Mbps 3G before RTT/TLS overhead. |
| Tier 1 real-device cold Today visible | **UNVERIFIED** (emulated: `2,757 ms`) | **Proposal:** `≤ 3,500 ms` on slow 3G / `≤ 2,000 ms` on Wi-Fi | Prevents abandonment without demanding flagship hardware speeds. |
| Tier 1 interaction response (Archive / Resume / Challenge open) | **UNVERIFIED** (emulated: `407–708 ms`) | **Proposal:** `≤ 500 ms` tap-to-visible | Preserves calm, responsive navigation for in-memory or cached views. |
| Uncaught `pageerror`s during load, scroll, and network retry | `0` (emulated) | **Proposal:** `0` | Hard correctness requirement across all network conditions. |

---

## 5. CI-Cost and Workflow Implications

- **GitHub Actions compute constraint:** The team recently hit its GitHub Actions monthly included compute allowance.
- **Decision for this milestone:** **Do NOT add an automated Playwright performance benchmark job to `.github/workflows/ci.yml` on every PR.** Multi-run Chromium CPU/network throttling runs add substantial runner minutes per PR while still producing noisy shared-VM timings rather than real Android evidence.
- **Recommended workflow:** Keep performance measurement **manual/offline** at meaningful milestones or bundle-affecting PRs:
  1. `npm run build`
  2. `PERF_RUNS=3 npm run perf:baseline -- --json-out docs/testing/r21-<milestone>.json --md-out docs/testing/r21-<milestone>-summary.md`
  3. `npm run perf:compare -- docs/testing/r21-1-emulated-baseline.json docs/testing/r21-<milestone>.json`
  4. `npm run test:performance` (verifies comparison parser/flags and isolated network interruption/retry fixtures)

Only introduce a lightweight build-size check later if Aaron explicitly approves a non-browser bundle-size check after budgets are ratified.
