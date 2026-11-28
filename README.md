# Bibleberry

> **November 19 status reconciliation:** [Application Development Roadmap](docs/product/application-development-roadmap.md) remains the **single authoritative six-phase implementation sequence**. [Current Project Status](docs/project/current-status.md) now records later merged work, and [Internal Alpha Readiness](docs/project/internal-alpha-readiness.md) distinguishes local implementation from fully verified integrated/hosted behavior. [Roosting Falcon #260](https://github.com/Bibleberry/Bibleberry/issues/260) tracks the GitHub backlog and project-level acceptance. The [approved reader experience](docs/product/2026-11-08-approved-reader-experience-and-month-screen.md) and [CMS architecture](docs/architecture/content-management-and-publishing.md) retain their product/editorial authority. Dated prototypes and older priorities below are historical.

A mobile-first biblical formation prototype built with React, TypeScript, Vite, and CSS. **Bibleberry is a temporary app-name placeholder.** Realigned is Alexis Waid’s podcast, and Spiritually Hungry is the business entity.

## Project handoff and development roadmap

**Start here when resuming Bibleberry with any AI assistant:**

1. [**Current Project Status**](docs/project/current-status.md): latest accepted build, verified staging evidence, limitations and next recommended assignment; verify fresh GitHub refs/Issues/PRs.
2. [**Single Product & Application Development Roadmap**](docs/product/application-development-roadmap.md): the **only authoritative implementation sequence**, organized into six dependency phases while preserving workstream IDs R01–R21 and R08A.
3. [**Approved Reader Experience**](docs/product/2026-11-08-approved-reader-experience-and-month-screen.md): product behavior for Hub, Month Screen, Shelf, Library, monthly discoveries, Scripture Cards, Finish and announcements.
4. [**CMS Content Management & Publishing Architecture**](docs/architecture/content-management-and-publishing.md): editorial schemas/workflows and all 80 November 9 decisions; its original Phase A–G planning outline does **not** supersede the canonical roadmap.
5. [**R08A-0 Technical Architecture (Revision 2)**](docs/architecture/r08a-0-monthly-publication-release-contract.md): documented month/series identity, local-day release contract, API payloads and six proposed implementation assignments, starting with consumer-first R08A-1.
6. [**AI Development Protocol**](docs/ai-development-protocol.md): branch/PR/review discipline, document authority and how agents continue without relying on a chat history.

The initial [November 5, 2026 status baseline](docs/project/status-history/2026-11-05.md) remains a historical snapshot. [Planning Issue #34](https://github.com/Bibleberry/Bibleberry/issues/34) is **closed**; scoped Issues and pull requests track actual engineering work. Accepted private staging proof: [R05 #62](https://github.com/Bibleberry/Bibleberry/issues/62) and [#63](https://github.com/Bibleberry/Bibleberry/issues/63). R08A-0 design [Revision 2](docs/architecture/r08a-0-monthly-publication-release-contract.md) has been drafted and independently reviewed. **Current engineering handoff (November 19):** R08A-1 and subsequent monthly publishing/reader slices have since merged. For the actual present-day gaps, use [Roosting Falcon #260](https://github.com/Bibleberry/Bibleberry/issues/260), [Current Project Status](docs/project/current-status.md), and the [Internal Alpha Readiness register](docs/project/internal-alpha-readiness.md). Do not treat the November 9 R08A-1 proposal as the current queue.

## Run locally

The active reader is the **R06 shell** in [`src/readerShell/`](src/readerShell/README.md). Start it with one command:

```bash
npm ci
npm run dev:r06
```

Open http://localhost:3000/. `dev:r06` sets `VITE_ENABLE_R06_SHELL=true` and `VITE_ENABLE_RELEASE_GATEWAY_SOURCE=true`. A fresh browser profile shows the first-use Introduction. After that, Today, Library, Collections and More are available.

R06 loads published content only from the release gateway. It requests `/api/…` from the same origin by default, and the Vite dev server has no `/api`. With no gateway, Today reports "Today's teaching is unavailable", and the other content screens show their unavailable states. To load content, point the reader at a release gateway you are authorized to use. Its `ALLOWED_ORIGINS` must include `http://localhost:3000`:

```bash
VITE_RELEASE_GATEWAY_ORIGIN=https://<gateway-host> npm run dev:r06
```

The automated R06 browser suite runs the same entry against synthetic gateway fixtures and needs no network.

### Legacy prototype (frozen)

`npm run dev` without the flag starts the legacy prototype in `src/App.tsx`. That shell is bug-fix-only until its planned retirement (WP-11 in the [R06 audit](docs/project/r06-production-implementation-audit.md)). Land reader fixes and features in `src/readerShell/`. Its Developer Studio and Interactive Challenge Lab are testing tools. Ordinary production builds exclude them.

## Build and check

```bash
npm run build
npm run preview
```

```bash
npm run lint
```

```bash
npm run test:reader-shell
```

```bash
npx playwright test --config tests/readerShell/playwright.config.ts
```

`npm run lint` reports no findings; keep it clean. `npm run build` compiles TypeScript and builds the default bundle. Build the R06 bundle with `VITE_ENABLE_R06_SHELL=true npm run build`. The release preflight is in [R06 staging preflight](docs/release/r06-staging-preflight.md). The DOM inspector, which adds `code-path` attributes, runs only in the dev server and is absent from every `vite build`. The Sanity Studio is a separate workspace: `cd studio && npm ci && npm run typecheck && npm run build`. CI (`.github/workflows/`) runs these and the other suites on pull requests.

## Historical prototype documentation

The Version 3–4.1 change logs, the Interactive Challenge Lab notes, legacy content configuration and the earlier acceptance reports are in [Legacy prototype README material](docs/project/status-history/legacy-prototype-readme.md). They describe the frozen legacy shell and are kept for the record.
