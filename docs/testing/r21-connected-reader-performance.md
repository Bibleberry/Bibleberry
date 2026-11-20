# R21 connected-reader performance

Birch Falcon measured the feature-gated ordinary reader for [Issue #256](https://github.com/Bibleberry/Bibleberry/issues/256). All six production-build samples completed the journey. The constrained profile reached a usable Today/Continue card in a median 3,302 ms on cold start. It recorded 4–7 cold-start long tasks per sample, totaling 564–918 ms. The connected and prototype results are **not comparable** for regression claims. The methods differ in readiness, cache behavior and network interception.

## Reproduce the measurement

Run from the repository root with locked dependencies and Playwright Chromium installed.

```sh
npm ci
npx playwright install chromium
PERF_RUNS=3 npm run perf:baseline -- --scenario connected --quiet \
  --json-out /tmp/r21-connected.json --md-out /tmp/r21-connected.md
```

- **Measured commit** `cbdbb64173a1240747f231f8921c2d56c10d94d7`, clean working tree, on November 20, 2026 at 01:30 UTC (November 19 at 20:30 Eastern). The evidence commit documents this run.
- **Host and runtime** Arch Linux x86-64, kernel `7.2.15-arch1-1`, four logical CPUs on an Intel Core i5-6500 at 3.20 GHz, 31,986 MiB visible RAM, Node 24.22.3, npm 12.2.2, Vite 7.3.7, Playwright 1.64.1 and headless Chromium 156.0.8078.4.
- **Production build** The connected invocation builds fresh Vite production output in an empty temporary directory and serves it through the R21 loopback preview. Its build ignores ambient `VITE_*` settings and dotenv files. It supplies exactly `VITE_ENABLE_MONTH_SCREEN=true`, `VITE_ENABLE_HISTORICAL_LIBRARY=true`, `VITE_ENABLE_HUB_CONTINUE=true` and `VITE_ENABLE_RELEASE_GATEWAY_SOURCE=true`. Month Screen enables the associated Challenge route. These flags describe the local measurement build.
- **Profiles** Both use a 390 × 844 CSS-pixel touch viewport at scale 1. Unthrottled uses 1× CPU and no network shaping. Constrained uses CDP 4× CPU throttling, 150 ms latency, 200 KiB/s down and 96 KiB/s up. Three fresh contexts per profile, followed by reloads within each context. Playwright routing disables HTTP cache. Repeat loads retain guest state and still transfer build assets.
- **Time and data** The reader date is fixed at November 19, 2026, 12:00 Eastern. Browser performance clocks and timers run normally. The gateway returns an October focus month with 31 slots and a September historical month with 30. October has one released synthetic Challenge. The remaining cells are unavailable. The Library contains both months. Fixtures contain one public-domain WEBP verse and generated layout text. Gateway calls, including month progress and empty preview News, are intercepted. Other requests abort and fail the sample, apart from the exact Google Fonts stylesheet request which the harness deliberately blocks.
- **Timing** For Today loads, timing starts before navigation and ends at the visible Hub Continue action. Route timings start before the relevant Playwright action and end at the visible destination. First month visits include clicking through the fixture introduction. Playwright action and polling overhead contribute to the results. Asset and paint snapshots are separate from the UI endpoint and include the startup requests observed by network idle.

## Reader results

Median (minimum–maximum) in milliseconds. Each cell has three samples from the corrected clean commit. The earlier clean checkpoint `9cbb40ead2b975363bcc8432f0e40f546f158557` also completed three runs per profile, with a 2,721 ms constrained cold median (2,577–2,809 ms) and 300–450 ms of cold long tasks. The spread across batches adds uncertainty to individual timings.

| Observation | Unthrottled | Constrained |
| --- | ---: | ---: |
| Cold Today → usable Continue | 657 (607–721) | 3,302 (3,009–3,877) |
| Repeat Today → usable Continue | 551 (488–1,051) | 2,757 (2,693–2,934) |
| Today → October 31-day calendar, with intro | 1,253 (1,243–1,255) | 1,820 (1,580–2,297) |
| Open Challenge → interrupted-request error | 847 (390–849) | 419 (385–568) |
| Retry → long reading visible | 78 (67–97) | 267 (226–401) |
| Advance to second screen | 61 (60–71) | 212 (149–263) |
| Challenge → October calendar | 87 (82–134) | 286 (240–336) |
| October calendar → Today/Resume | 106 (96–113) | 291 (167–593) |
| Today → Archive entry | 354 (331–408) | 513 (513–605) |
| Archive → Historical Library populated | 865 (833–914) | 1,119 (884–1,152) |
| Library → September 30-day calendar, with intro | 479 (365–584) | 1,011 (696–1,062) |
| September calendar → populated Library | 106 (89–168) | 251 (136–291) |
| Add September → protected Shelf membership | 60 (44–114) | 121 (116–216) |
| Library → Shelf shows September | 57 (53–172) | 170 (106–242) |
| Hard reload → Shelf shows persisted September | 550 (450–757) | 2,130 (1,872–2,398) |
| Shelf → Today/Resume | 906 (881–949) | 1,000 (988–1,364) |
| Today/Resume → saved second screen | 845 (826–913) | 602 (424–925) |
| Cold FCP / LCP | 400 (260–444) | 2,340 (2,036–2,480) |
| Repeat FCP / LCP | 228 (200–276) | 1,736 (1,700–1,884) |

For each stage, Chromium recorded the following long-task distributions. Values show median (minimum–maximum). Each later-stage snapshot is cumulative within that document.

| Stage | Unthrottled count | Unthrottled total ms | Constrained count | Constrained total ms |
| --- | ---: | ---: | ---: | ---: |
| Cold Today | 2 (1–2) | 139 (65–196) | 5 (4–7) | 845 (564–918) |
| Repeat Today | 0 (0–0) | 0 (0–0) | 2 (0–3) | 197 (0–211) |
| Through Shelf | 0 (0–0) | 0 (0–0) | 12 (7–18) | 1,109 (656–1,727) |
| Shelf reload through resumed Challenge | 0 (0–1) | 0 (0–53) | 2 (0–4) | 104 (0–372) |

All six runs rendered 32 paragraphs at the large-text setting, spanning 16,612 CSS pixels in the opening block area. Each run observed `ERR_INTERNET_DISCONNECTED` on the first Challenge attempt, the reader error and Retry action, a successful reading after Retry and a second successful detail response on Hub resume. After reload, the app opened the persisted second screen. September remained protected on Shelf, October retained focus, and participation contained zero completions or earned awards. Each run blocked three stylesheet requests and reported zero unexpected network failures, console errors or uncaught exceptions.

## Browser transfer and production footprint

Resource Timing transfer bytes include response overhead. The two profiles and all samples reported the same bytes at each stage.

| Document and observation point | JS | CSS | Other built assets | HTML |
| --- | ---: | ---: | ---: | ---: |
| Cold or repeat Today, after eager requests | 203,695 | 28,996 | 0 | 974 |
| Repeat Today document through first Shelf visit | 230,086 | 30,337 | 0 | 974 |
| Shelf reload document through Challenge resume | 217,694 | 28,996 | 0 | 974 |

Cold or repeat Today fetched seven JS and four CSS files. The entry pair accounts for 194,941 of 232,691 transfer bytes. The nine additional eager chunks account for the remaining 37,750 bytes. Eager modules included Month Preview News, Month Screen model, Hub Continue, Released Challenge, month award reconciliation and guest Shelf state. The JSON lists every observed built asset path with encoded body bytes and transfer bytes, including shared and lazy chunks fetched during startup. The connected build contains 37 files totaling 1,152,214 raw bytes. The sum of per-file gzip measurements is 365,549 bytes. The HTML-linked JS and CSS pair is 714,447 raw bytes and 194,341 gzip bytes.

## Limits and report compatibility

The measurements are advisory and the scenario runs on demand.

- The scoped focus journey opens a historical Month Screen from Today via Hub Continue. Current-month release and the advance-preview lifecycle remain outside the scenario. The 31- and 30-cell calendars use a sparse roster. Library pagination, rich media, editorial data, award issuance and account sync are outside the fixture.
- Vite serves static assets over loopback. Synthetic gateway responses are fulfilled in Chromium routing, so Retry timing includes UI recovery and synthetic delivery. These measurements leave gateway/CDN latency, production caching and offline-first behavior unverified. The stylesheet block exercises fallback fonts. The fixture provides no production font or media transfer data.
- The report measures a long reading layout and browser long tasks. Scrolling frame rate, device memory, low-RAM behavior, physical older Android and native WebView are still unverified. Physical-device qualification remains under [Issue #37](https://github.com/Bibleberry/Bibleberry/issues/37).
- Default `perf:baseline` still reads the standard `dist/` and emits `r21-baseline-v1`. Connected mode emits `r21-connected-v1` JSON with two `environments` and validates required observations before writing any report. Its Markdown output uses the connected schema. `perf:compare` continues to compare prototype `r21-baseline-v1` documents and rejects connected reports.

## Prototype reference

The [R21-0 report](r21-low-end-android-performance-baseline.md) measured the earlier public prototype on Ubuntu with a shared AMD EPYC host. It reported cold/repeat medians of 185/128 ms unthrottled and 1,593/610 ms constrained. Its bundled prototype journey and host differ from Birch Falcon.

The default prototype runner also completed on this host, with the same Chromium, viewport and CDP profiles, from the same clean commit. It used the standard build and waited for the prototype teaching header. Its repeat loads could use the browser cache. The connected run waited for the async Hub Continue action and disabled cache for request isolation. **The timings and transfer observations are not comparable** across these methods.

| Prototype reference only | Unthrottled | Constrained |
| --- | ---: | ---: |
| Cold prototype load, ms | 367 (365–632) | 1,975 (1,971–2,068) |
| Repeat prototype load, ms | 145 (128–158) | 761 (672–774) |
| Cold startup JS + CSS transfer, bytes | 185,577 | 185,577 |
| Repeat same-origin resource transfer, bytes | 600 | 600 |

The prototype recorded zero failed requests or uncaught page errors in the six regular runs. The legacy comparison succeeded on the prototype report and rejected the connected report at the schema boundary.

```sh
npm run build
PERF_RUNS=3 npm run perf:baseline -- --quiet \
  --json-out /tmp/r21-prototype.json --md-out /tmp/r21-prototype.md
npm run perf:compare -- /tmp/r21-prototype.json /tmp/r21-prototype.json
```

## Verification

| Command or check | Result |
| --- | --- |
| `npm run lint` | Passed after correcting the fixture date assignment caught by lint. |
| `npm run build` | Passed. Vite reported Rollup annotation and large-chunk warnings. |
| `npm run test:performance` | 13 passed, including both network-interruption browser tests and the new fixture and schema contracts. |
| Connected benchmark | 3/3 completed per profile on the clean source commit. |
| Default benchmark and `perf:compare` | 3/3 completed per profile. Prototype self-comparison passed. A prototype-to-connected invocation exited 1 as expected. |
| `npm run test:smoke` | 49 passed across seven builds, including all eight Month Screen smoke cases. |
| `npm run test:library-shelf -- --output /tmp/birch-falcon-library-artifacts` | 7 model and 32 browser tests passed. |
| `npx playwright test --config tests/hubContinue/playwright.config.ts --output /tmp/birch-falcon-hub-artifacts` | 21 passed. The desktop legacy ResumeCard case captured late requests from its preceding enabled phase. A focused Chromium rerun of that case passed. |
| `git diff --check` | Passed. |

The first concurrent browser-suite attempt shared Playwright's default artifact directory and failed during trace cleanup. The rerun used separate artifact directories. The PR paths match reader CI's tooling and test patterns. They fall outside the native iOS and Android PR path patterns. See the [PR checks](https://github.com/Bibleberry/Bibleberry/pull/258/checks) for the latest pushed head.
