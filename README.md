# Bibleberry

> **November 9 project guidance:** [Application Development Roadmap](docs/product/application-development-roadmap.md) is the **single canonical six-phase implementation sequence**, integrating [November 8 approved reader behavior](docs/product/2026-11-08-approved-reader-experience-and-month-screen.md) and [November 9 CMS publishing architecture (80 decisions)](docs/architecture/content-management-and-publishing.md). [Current Project Status](docs/project/current-status.md) records verified progress, including **accepted R05 private staging Stage 3C**. Dated prototypes and older priorities elsewhere in this README are historical, not parallel instructions or evidence of completed production features.

A mobile-first biblical formation prototype built with React, TypeScript, Vite, and CSS. **Bibleberry is a temporary app-name placeholder.** Realigned is Alexis Waid’s podcast, and Spiritually Hungry is the business entity.

## Project handoff and development roadmap

**Start here when resuming Bibleberry with any AI assistant:**

1. [**Current Project Status**](docs/project/current-status.md): latest accepted build, verified staging evidence, limitations and next recommended assignment; verify fresh GitHub refs/Issues/PRs.
2. [**Single Product & Application Development Roadmap**](docs/product/application-development-roadmap.md): the **only authoritative implementation sequence**, organized into six dependency phases while preserving workstream IDs R01–R21 and R08A.
3. [**Approved Reader Experience**](docs/product/2026-11-08-approved-reader-experience-and-month-screen.md): product behavior for Hub, Month Screen, Shelf, Library, monthly discoveries, Scripture Cards, Finish and announcements.
4. [**CMS Content Management & Publishing Architecture**](docs/architecture/content-management-and-publishing.md): editorial schemas/workflows and all 80 November 9 decisions; its original Phase A–G planning outline does **not** supersede the canonical roadmap.
5. [**R08A-0 Technical Architecture (Revision 2)**](docs/architecture/r08a-0-monthly-publication-release-contract.md): documented month/series identity, local-day release contract, API payloads and six proposed implementation assignments, starting with consumer-first R08A-1.
6. [**AI Development Protocol**](docs/ai-development-protocol.md): branch/PR/review discipline, document authority and how agents continue without relying on a chat history.

The initial [November 5, 2026 status baseline](docs/project/status-history/2026-11-05.md) remains a historical snapshot. [Planning Issue #34](https://github.com/ContraPhilosophy/Bibleberry/issues/34) is **closed**; scoped Issues and pull requests track actual engineering work. Accepted private staging proof: [R05 #62](https://github.com/ContraPhilosophy/Bibleberry/issues/62) and [#63](https://github.com/ContraPhilosophy/Bibleberry/issues/63). R08A-0 design [Revision 2](docs/architecture/r08a-0-monthly-publication-release-contract.md) has been drafted and independently reviewed. The next **proposed, not automatically authorized** coding scope is **R08A-1: Consumer Compatibility**.

## Run locally

```bash
npm install
npm run dev
```

Create and preview the production build:

```bash
npm run build
npm run preview
```

## Interactive Challenge Lab — current development prototype

A developer-only lab now contains four playable Biblical Teaching Challenges built from Alexis Waid’s supplied November manuscripts:

| Challenge | Required screens | Primary guided structure |
|---|---:|---|
| Nov 1 — God’s Will: Three Commands | 5 | Encounter → Understand → Consider → Reflect → Pray |
| Nov 2 — Rejoice Always | 7 | Encounter → Distinguish → Clarify → Gospel → Hope → Practice → Pray |
| Nov 3 — Pray Continually | 8 | Encounter → Rethink → Notice → Reflect → Reorient → Understand → Practice → Pray |
| Nov 5 — God’s Will for Our Lives | 8 | Encounter → Remember → Practice intentionally → Discern → Connect → Respond → Apply → Pray |

### Access and isolation

1. Use local development or build with `VITE_ENABLE_DEVELOPER_STUDIO=true npm run build`.
2. Open **More → Developer Studio → Interactive Challenge Lab**.
3. Select Nov 1, Nov 2, Nov 3, or Nov 5. Use Back, Continue, and Complete Challenge to move through the required sequence.
4. Optional deeper studies expand in place. **Save Challenge** and **Add to My Scripture** are independent collections. Open **My Scripture** from the lab home to remove references or practice the configured 1 Thessalonians 5:16–18 passage.

The lab reuses the existing `MemorizationTool`; it does not create another reveal engine. Reference-only optional studies explicitly report unconfigured text and practice, and the November 3 Realigned episode remains a non-playing reference with no invented URL.

Lab positions, completion, bookmarks, and Scripture saves use the separate `bibleberry-interactive-challenge-lab-v1` browser-local namespace. They do not enter `bibleberry-prototype-v1`, Journey, last-opened history, weekly releases, Today, Archive, Foundations, or ordinary preferences. Data remains only in this browser and does not sync across devices.

The same Developer Studio build flag gates a lazy-loaded lab module. A normal public `npm run build` contains no lab chunk or fixture strings and exposes no lab route. No Sanity, CMS, account, backend, analytics, or production publishing work was started.

### Lab files and verification

- Added `src/data/interactiveChallenges.ts` — typed four-Challenge fixtures, nine reusable block concepts, Scripture identity normalization, and the configured memorization fixture.
- Added `src/components/InteractiveChallengeLab.tsx` — guided renderer, selection, resume, completion, optional studies, Saved Challenges, My Scripture, and reuse of the existing memorization component.
- Modified `src/App.tsx`, `src/components/DeveloperStudio.tsx`, and `src/App.css` — gated access, studio entry, and responsive Field Notebook lab styling.
- Added `INTERACTIVE_CHALLENGE_LAB_HANDOFF.md` — full conceptual fidelity tables, editorial additions, test results, and screenshot inventory.

The testing-enabled build passed **186 Chromium assertions**. A separate public production build passed **7 browser checks**, with no lab module in its JavaScript output. Both builds compiled successfully. The checks covered all 28 required screens, complete prayers, progress, optional ARIA behavior, independent saves, normalized deduplication, removal, resume after reload, completion, reference-only availability, memorization controls, Challenge switching, 320–1440 px overflow checks, 44 px lab touch targets, light/dark/system appearance, large reading text, and existing Wednesday/Saturday/Sunday smoke tests. No browser console/page errors or same-origin 404s occurred.

`npm run lint` remains at the same **11 pre-existing findings (10 errors, 1 warning)** in legacy `App.tsx` effects and unused shadcn/ui scaffold files; the lab adds no new finding. Physical iPhone/Android hardware and native screen-reader testing were not independently performed. See the full handoff for the editorial review list and phone-width screenshots.

## Version 4.1 change log — Developer Studio consolidation

- Added **More → Developer Studio**, a dedicated testing interface organized into **Date & Content Preview**, **Component Testing**, **Reader Simulations**, and **Reset & Restore**.
- Moved the former Today date/simulation panel and all pilot, component, and returning-reader scenario controls into the studio. Added direct buttons for each of the seven pilot entries and the existing guided discipline, journal/PDF, memorization, one-phrase, and teaching-media tests.
- Removed reader-facing development controls, simulation banners, draft/prototype badges, development pilot notices, and fixture-oriented labels from the application shell, Today, Foundations, Archive, teaching/media, guided discipline, journal, memorization, and library screens.
- Regenerated the Saturday PDF and uncropped PNG with reader-facing labels. All five prompts remain exactly aligned with the on-screen prompts, and the PDF remains a genuine one-page file.
- Added a visible studio status summary for reader mode, effective date, content selection, and temporary last-opened history. Opening More preserves an active date preview so it can be inspected and adjusted in the studio.
- Added **Return to reader view** to preserve the active scenario and **Return to Normal App View** to clear temporary date, content, and simulated-history state while preserving genuine reading history, explored Foundations, appearance, reading size, and other browser-saved preferences.
- Added explicit build gating: Developer Studio is available in Vite development and in deliberately enabled testing builds, but its More entry and testing controls are excluded from ordinary public production builds.
- Preserved the four weekly content experiences, ordered navigation, Archive, resume behavior, announcements, Foundations, media, themes, reading sizes, local history, and fixture structure. No Sanity integration, accounts, backend, or unrelated visual refinement was added.

### Development and build availability

```bash
# Local development: Developer Studio is available.
npm run dev

# Deliberately enabled testing build: Developer Studio is available.
VITE_ENABLE_DEVELOPER_STUDIO=true npm run build

# Ordinary public production build: Developer Studio is excluded.
npm run build
```

The saved Version 4.1 preview uses the explicitly enabled testing build so the studio can be evaluated. Publishing a normal `npm run build` production bundle does not expose the studio entry or its state-changing testing controls.

### Developer tool inventory

| Located tool or capability | Version 4.1 location |
|---|---|
| Test-date input and Preview date | Developer Studio → Date & Content Preview |
| Simulate Today with ordinary content | Developer Studio → Date & Content Preview |
| Open seven-day pilot and individual pilot entry selection | Developer Studio → Date & Content Preview |
| Simulate selected pilot date | Developer Studio → Date & Content Preview |
| Guided spiritual discipline test | Developer Studio → Component Testing |
| Journal companion, preview, and PDF test | Developer Studio → Component Testing |
| Scripture memorization and one-phrase edge case | Developer Studio → Component Testing |
| Existing teaching-media component access | Developer Studio → Component Testing |
| Ordinary returning-reader / Welcome Back scenario | Developer Studio → Reader Simulations |
| Wednesday, Saturday, and Sunday resume scenarios | Developer Studio → Reader Simulations |
| Exit preview/simulation and use ordinary fixtures | Consolidated into Developer Studio → Reset & Restore → Return to Normal App View |
| Current simulation and temporary history state | Developer Studio → Current simulation state |

### Version 4.1 testing workflow

1. Open **More → Developer Studio**. The studio shows whether the app is in normal view, a date preview, or a simulated Today.
2. Select a date, content preview, component, or returning-reader scenario. The app returns to the ordinary reader interface without persistent testing banners.
3. Exercise the scenario through Today, Archive, Previous/Next, Welcome Back, and the relevant formation experience.
4. Reopen **More → Developer Studio** to inspect or adjust the active simulation. Date-preview state is retained when opening More.
5. Select **Return to reader view** to keep testing, or **Return to Normal App View** to restore the actual date and ordinary content without erasing genuine browser-saved preferences or history.

### Version 4.1 files modified

- `src/components/DeveloperStudio.tsx` — new consolidated testing interface and current-state summary.
- `src/App.tsx` — studio routing, More entry, build gate, state-preserving restore flow, old Today panel removal, and reader-facing label cleanup.
- `src/components/FormationViews.tsx` — removed development labels from guided, library, and related-session views.
- `src/App.css` — studio layout and responsive styling; existing reader visual system retained.
- `src/data/formationFixtures.ts` — reader-facing series, worksheet-alt, and memorization labels cleaned without changing the fixture schema or passage.
- `src/data/sabbathFixtures.ts` — reader-facing series, image, caption, and excerpt labels cleaned without changing teaching structure.
- `src/data/content.ts` — older sample-entry introductions cleaned without changing the authentic November 5 teaching.
- `src/data/announcements.ts` — existing announcement retained with reader-facing copy and the same destinations.
- `public/worksheets/weekly-rhythm-pilot-journal.pdf` and `.png` — clean one-page worksheet and full-page preview with identical prompts.
- `README.md` — Version 4.1 handoff, inventory, testing, and acceptance documentation.

### Version 4.1 acceptance report

The deliberately enabled testing build passed TypeScript and Vite compilation. Chromium acceptance testing completed **145 passing browser assertions** with no browser console errors, uncaught page errors, or same-origin 404 responses. A separate ordinary `npm run build` public production build passed, followed by **4 passing public-build checks** confirming that Developer Studio and scattered testing controls are absent, all seven ordinary More destinations remain, and no console or page errors occurred.

The checks covered the complete tool inventory; studio state visibility; clean reader screens; all seven pilot entries; Wednesday guidance and library resources; Saturday PDF preview/download and exact prompt matching; Sunday keyboard and one-phrase behavior; all returning-reader scenarios; date availability; Previous/Next and Archive; genuine preference/history preservation; original teaching and media; announcements; light/dark/system themes; large reading text; and 320/375/390 px layouts with no horizontal overflow. The regenerated PDF also passed rendered-page inspection with no clipping, blank-page, or content warnings.

`npm run lint` still reports **11 existing findings (10 errors, 1 warning)** in legacy `App.tsx` effects and the unused shadcn/ui scaffold. The new Developer Studio component adds no lint finding. These existing findings do not prevent the successful TypeScript/Vite builds or browser checks above. No other unverified Version 4.1 acceptance item is known.

## Version 4 change log

- Added a typed four-part challenge entry model: `teaching`, `guidedDiscipline`, `worksheet`, and `memorization`.
- Added an isolated, development-only **Weekly Rhythm Pilot** for November 2–8, 2026. It reuses four existing Sabbath teaching fixtures under new pilot entry IDs and adds new Wednesday, Saturday, and Sunday entries. The original Sabbath series and authentic November 5 gratitude teaching were not changed.
- Added Wednesday’s reusable guided spiritual discipline template and a complete Sabbath & Rest practice with five ordered steps, biblical grounding, optional journal/prayer prompts, and a non-coercive exit.
- Added a permanent **Spiritual Disciplines Library** inside Foundations, with evergreen Sabbath & Rest, Prayer, and Solitude resources. Wednesday links to the evergreen Sabbath resource; dated sessions and library resources are separate records.
- Added Saturday’s journal companion with a genuine one-page development PDF, an uncropped full-page PNG preview, working View/Download actions, and the same five prompts on screen. There is no journal editor, response collection, automatic saving, or cloud sync.
- Added Sunday’s keyboard- and touch-accessible reveal tool with editor-defined WEBP segments, Reveal next, Reveal all, Start again, screen-reader state announcements, and a one-phrase development edge-case fixture.
- Generalized Previous/Next, Archive opening, and last-opened resume behavior across all four entry types. The resume card still records opens—not completion—and adapts its final action to “Jump to today” for non-teaching entries.
- Added an explicit developer-only pilot selector, simulated pilot dates, a one-phrase test, and one-click Wednesday/Saturday/Sunday resume scenarios. No system-date or localStorage editing is needed.
- Preserved the Field Notebook visual system, four-tab navigation, light/dark/system themes, reading sizes, Foundations behavior, ordinary Archive, announcements, original teaching data, pull quotes/images, November 5 media fixtures, Journey, sharing, reminder preferences, and existing developer controls. No Sanity integration or general redesign was included.

## Version 4 content schema and fixture locations

- `src/data/formation.ts` — `EntryType`, `ChallengeEntry`, `DisciplineResource`, guided session, worksheet, and memorization contracts; entry-type labels; whitespace-normalized passage validation.
- `src/data/formationFixtures.ts` — all new development copy, evergreen discipline resources, pilot teaching clones, Wednesday/Saturday/Sunday entries, and the one-phrase edge fixture. Memorization segments are checked at module initialization against the exact full passage.
- `src/data/challenges.ts` — explicit editorial order for both the original Sabbath challenge and the separate `weekly-rhythm-pilot-2026` challenge.
- `src/components/FormationViews.tsx` — reusable guided practice, worksheet, memorization, library browse/detail, and formation sequence components. Optional PDF, thumbnail, prompt, library-link, Scripture, and closing-reflection areas render only when supplied.
- `src/App.tsx` — content-set selection, date availability, cross-type navigation, Archive, library routing, and resume history.
- `public/worksheets/weekly-rhythm-pilot-journal.pdf` — real development-only worksheet.
- `public/worksheets/weekly-rhythm-pilot-journal.png` — corresponding full-page preview.

The four reused pilot teachings are new records cloned from November 2, 3, 5, and 6 in `sabbathFixtures.ts`; they do not mutate or overwrite the source fixtures. `Weekly Rhythm Pilot` is selected only through development controls or an internal pilot route. Ordinary real-date Today continues to use the ordinary entry collection, so duplicate dates do not create another ambiguous official Today.

## Version 4 testing instructions (historical entry points)

1. Open **Today → Development Tool**.
2. Choose **Open seven-day pilot**. Monday, November 2 opens directly. Use **Next** at the bottom to traverse Tuesday → Wednesday → Thursday → Friday → Saturday → Sunday. Use **Previous** to reverse the same order.
3. **Wednesday:** confirm the five guided steps and optional prompts. Select **Learn more about this discipline** to open Sabbath & Rest. Use **Back to the Disciplines Library** to browse Prayer and Solitude. The library is also independently available under **Foundations → Spiritual Disciplines Library**.
4. **Saturday:** compare the full-page preview with the five on-screen prompts. Use **View PDF** or **Download PDF**; the downloaded file is a real one-page PDF. No response field is provided—use a physical journal or print the page.
5. **Sunday:** begin with all phrases hidden. Exercise **Reveal next phrase**, **Reveal all**, and **Start again**. Keyboard users can Tab to a control and press Enter or Space. The reference and WEBP label remain visible above the phrases.
6. In the developer tool, choose **Test one-phrase passage** and repeat the reveal/reset checks.
7. With the pilot selected, open **Archive** to see all seven entries and all four content-type labels. Open entries to confirm that each uses the correct template. **Return to ordinary Archive** leaves the pilot.
8. For availability testing, enter a date and choose **Simulate selected pilot date**. On November 2, ordinary navigation does not expose November 3 or later. **Open seven-day pilot** is the intentional full-sequence preview.
9. For resume testing, choose **Resume from Wednesday**, **Resume from Saturday**, or **Resume from Sunday**. These set up a past open and return on simulated November 10. Test **Return**, the challenge-ordered **Continue** where available, and **Jump to today**. Sunday correctly omits Continue because it is the final entry.
10. Use **More → Appearance & reading** to verify light, dark, system, and reading-size behavior. Browser-local settings and ordinary Journey history remain prototype-only and do not sync across devices.

## Version 4 acceptance report

The production build passed. Chromium testing against the built app completed **92 passing browser assertions**, followed by real Simplecast playback and settings-persistence checks. There were no browser console errors, uncaught page errors, or same-origin 404 responses. A cold production load completed with four measured resource requests and approximately 494 KB transferred in the test environment. The five prompts extracted from the PDF exactly matched the structured on-screen prompts.

| # | Acceptance area | Result |
|---|---|---|
| 1 | Existing Mon/Tue/Thu/Fri teaching content and presentation preserved; cross-type integration fixed | Pass |
| 2 | Wednesday shows five ordered instructions with reliable reading and navigation | Pass |
| 3 | Wednesday opens evergreen Sabbath detail; library independently browses three resources | Pass |
| 4 | Real PDF serves/downloads; full-page preview renders uncropped | Pass |
| 5 | PDF and on-screen prompts match; no personal-response input or storage | Pass |
| 6 | Reveal next, Reveal all, Reset, final states, keyboard operation, and one-phrase case | Pass |
| 7 | Reference/translation visible; ordered segments reproduce exact John 1:3 WEBP passage | Pass |
| 8 | Four types appear in one pilot and are identified in its Archive | Pass |
| 9 | Previous/Next traverses all seven entries in explicit challenge order | Pass |
| 10 | Return/Continue/Jump tested for Wednesday, Saturday, and Sunday history | Pass |
| 11 | Ordinary simulated dates withhold future entries; full preview remains intentional | Pass |
| 12 | 320/375/390 px, light/dark/system, large reading text, touch targets, and overflow | Pass |
| 13 | Announcements, Foundations, Archive, media, original fixtures, themes, and developer controls | Pass |
| 14 | Build, browser console, PDF text, playback, and limitations documented | Pass |

Simplecast playback was exercised on a 390 px viewport: the player displayed Pause, its audio element reported `paused: false`, and playback time advanced. YouTube insertion and external podcast links also remained available.

### Known boundaries and lint note

- All new copy and worksheet assets are development-only and are not represented as Alexis-approved publication material.
- The optional practice-by-hiding experiment was deliberately omitted; required Reveal mode is complete. No scoring, timer, quiz, audio synthesis, or memorization tracking was added.
- The PDF is a prebuilt fixture, not a generated publishing workflow. Sanity, authentication, CMS administration, cloud storage, accounts, and cross-device persistence remain unimplemented.
- Pilot preview/simulation state is intentionally temporary. Ordinary prototype settings/history remain in browser localStorage and can be lost when browser data is cleared.
- `npm run lint` is not clean: it reports the existing synchronous-state effects in legacy `App.tsx` and existing rules in the unused shadcn/ui scaffold. The new memorization component avoids that pattern by resetting through its entry key. These lint findings did not prevent the successful TypeScript/Vite production build or the browser checks above.

## Version 3 change log

- Added the inline **Pick up where you left off** card with Return, challenge-ordered Continue, and same-day Jump dismissal behavior.
- Added a configurable, time-bounded Today announcement strip with internal and external destinations.
- Added Previous/Next navigation within the same ordered Scripture Challenge, filtered by real-date availability outside developer preview.
- Added reusable ordered paragraph, pull-quote, and image teaching blocks.
- Added coordinated Reflection and Prayer callout styling while retaining Response/Practice and full written Prayer as distinct sections.
- Added a clearly labeled development study graphic with alt text, caption, lazy loading, and contain presentation.
- Added isolated simulated-Today controls and a one-click returning-reader demo for testing the complete three-action resume card without changing the device clock.
- Preserved the existing navigation design and colors, Field Notebook visual system, onboarding, Foundations, Archive, media fixtures, appearance controls, reading sizes, Journey, sharing, and development date-preview tooling.

## Content structure and configuration

Structured content remains separate from screen components. Authentic teaching and generated draft copy have distinct labels and attribution. The seven Sabbath entries are synthetic development content, not Alexis Waid’s approved writing. Optional reflections, practices, prayers, truth lines, and text-only short-form concepts collapse when absent. Supplied media items are component fixtures and are not presented as editorially related to any daily teaching.

### Challenges and availability

`src/data/challenges.ts` defines each challenge’s explicit reading order. Daily entries reference that challenge through `challengeId` in `src/data/sabbathFixtures.ts`.

```ts
{
  id: 'seven-days-sabbath-2026',
  title: 'Seven Days of Sabbath',
  orderedEntryIds: [
    'sabbath-2026-11-01',
    'sabbath-2026-11-02',
    // Additional entry IDs in editorial order
  ],
}
```

Previous, Next, and Continue use this order rather than adding one calendar day. Ordinary navigation only includes entries whose fixture date is available through the reader’s local date. Intentional developer date previews can traverse the supplied fixture sequence without changing ordinary resume history.

### Announcements

`src/data/announcements.ts` is the dedicated editable source. Set `enabled` to `false` or remove an item to deactivate it; no Today layout edit is needed. One active announcement is supported.

```ts
{
  id: 'sabbath-fixture-review',
  enabled: true,
  startAt: '2026-10-27T00:00:00-04:00',
  endAt: '2026-11-03T00:00:00-05:00',
  timezone: 'America/New_York',
  title: 'Development announcement',
  body: 'Review the November 3 Sabbath fixture.',
  links: [
    { label: 'Open fixture', route: '#/teaching/sabbath-2026-11-03' },
    { label: 'Open episode', url: 'https://realigned.simplecast.com/' },
  ],
}
```

The explicit UTC offsets determine activation, and the IANA timezone records editorial intent. The browser rechecks the active window every 60 seconds. This is client-side display logic, not a server-side publishing scheduler. When no announcement is active, no container is rendered.

### Pull quotes and images

Teaching bodies in `src/data/content.ts` and `src/data/sabbathFixtures.ts` contain ordered blocks. Editors choose the exact excerpt and insertion point; the app does not generate quotes or insert them into Alexis’s authentic writing.

```ts
{
  type: 'pullQuote',
  text: 'An exact editor-selected excerpt from the development teaching.',
  label: 'Development excerpt',
}

{
  type: 'image',
  src: '/images/sabbath-development-study.svg',
  alt: 'Development study graphic contrasting six days of work with the seventh day of rest.',
  caption: 'Optional development caption.',
  fit: 'contain', // 'cover' is also supported
  aspectRatio: '1200 / 760',
}
```

Development image assets are imported into `public/images/`. Images support landscape, portrait, or diagram aspect ratios through the same block model. `contain` is the default so study-graphic labels are not cropped. Entries without image blocks render no placeholder.

## Developer date controls (original Version 3/4 location)

Before Version 4.1, these controls opened through **Today → Development Tool → Preview or simulate a test date**. Use the consolidated **More → Developer Studio** workflow above for the current application.

- **Preview date** retains the original single-fixture preview, including intentional future-fixture access.
- **Simulate Today** applies the selected local calendar date to Today selection, entry availability, Previous/Next navigation, announcement activation, and resume-card date comparisons.
- **Set up returning-reader demo** loads the exact test scenario: last opened **Remember the Sabbath** on November 3, returning on simulated **November 8**. Today displays **Rest Requires Trust** from November 7, and the card offers **Return to November 3**, **Continue with November 4**, and **Jump to today’s reading**.
- **Exit simulation** or reloading the page restores real-date behavior.

Simulation history is temporary React state, separate from the browser-saved ordinary `lastOpened` and dismissal fields. Opening readings or dismissing the card during simulation does not rewrite ordinary resume history. No device-clock change or console script is required.

## Resume history and browser boundaries

Prototype state is stored under `bibleberry-prototype-v1` in this browser’s `localStorage`. Resume history stores only the last explicitly opened entry ID, challenge ID, and timestamp, plus the current-day card dismissal date. Automatic Today rendering, rendering resume links, and developer previews do not update last-opened history. No completion, scrolling position, streak, or progress is inferred.

Data does not sync across devices and may disappear when browser data is cleared. Use **More → Privacy & local data → Reset prototype** to erase it. This is not a production persistence layer. Accounts, cloud sync, a CMS, native notification scheduling, production offline support, deferred deep links, and store behavior remain unimplemented. Sharing uses browser capabilities and internal prototype routes only.

## Acceptance report

All twelve Version 3 scenarios passed in Chromium through 95 browser assertions, with no console errors, page errors, or same-origin 404 responses. Real Simplecast audio playback was also verified (`paused: false`, advancing playback time, and a visible Pause control). The simulated-date update added 27 passing scenario checks and 24 passing ordinary-mode regression checks, again with no console/page errors or app 404s.

| # | Scenario | Result |
|---|---|---|
| 1 | First-time reader has no resume card; Today works | Pass |
| 2 | November 3 history on November 8 offers Return, Continue with November 4, and Jump | Pass |
| 3 | Jump dismisses for the local day, preserves prior history, and adds no completion state | Pass |
| 4 | Opening yesterday or today suppresses the unnecessary card | Pass |
| 5 | Final available entry has no broken Continue or Next action | Pass |
| 6 | Archive browsing does not change date-based Today or challenge order | Pass |
| 7 | Announcement window, internal/external links, expiry, and empty-state collapse | Pass |
| 8 | Pull quotes and Reflection/Prayer callouts in light, dark, and system themes at compact and large reading sizes | Pass |
| 9 | November 1 image alt/caption/loading/contain behavior; November 2 has no empty image block | Pass |
| 10 | Full seven-day Previous/Next sequence and no ordinary future-entry leakage | Pass |
| 11 | 320, 375, and 390 CSS px layouts have no horizontal overflow or clipped resume actions | Pass |
| 12 | Navigation, Archives, both November 5 records, media, preview controls, and appearance regressions | Pass |

The current fixture-only Today selector still chooses one latest available entry by date. If multiple entries share that date, source order breaks the tie; therefore the authentic gratitude teaching is selected on November 5, while **The Sabbath as a Sign** remains a separate Archive and challenge entry. A production publishing model should make that choice explicit rather than rely on fixture ordering.

## Later CMS requirements

A true editorial interface would need authenticated author/admin access and role permissions; server-backed challenge, entry, block, and announcement records; validated editing and preview; explicit publish-at scheduling; image upload to object storage with alt/caption metadata; and revision/editorial approval workflows. Production Scripture source and licensing review would remain part of publishing. Cross-device resume history would additionally require accounts and a server synchronization policy. None of that admin infrastructure is included in this iteration.

## Main source files

- `src/App.tsx` — application flows and reusable view components
- `src/App.css` — responsive Field Notebook visual system
- `src/index.css` — palette, typography, and theme tokens
- `src/data/content.ts` — authentic sample, older draft fixtures, Foundations, media, and teaching-block types
- `src/data/sabbathFixtures.ts` — seven complete supplied synthetic development entries
- `src/data/challenges.ts` — ordered challenge relationships
- `src/data/announcements.ts` — time-bounded announcement configuration
- `public/images/sabbath-development-study.svg` — original development-only test asset
