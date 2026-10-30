# Bibleberry Sanity Studio — Milestone A

Standalone Sanity Studio for project **`80016lrq`**, dataset **`production`**. This workspace contains only the Studio content foundation and the November 2 draft template. The existing Bibleberry React application, fixtures, routes, styling, and reader state were not modified. **Milestone B has not started.**

## Launch and access

### Requirements

- Node.js **22.12 or newer** and npm.
- Access to the Sanity account/project with permission to edit project `80016lrq`.
- The local Studio origin allowed in the project’s CORS settings.

### 1. Allow the local Studio origin

In [Sanity Manage](https://sanity.io/manage), open project `80016lrq`, then go to **Settings → API → CORS Origins**. Add:

```text
http://localhost:3333
```

Enable **Allow credentials** for this origin. If you deliberately open Studio through `http://127.0.0.1:3333` instead, add that origin separately.

CLI alternative, using the account authorized for this project:

```bash
cd /mnt/agents/output/app/studio
npx sanity login
npx sanity cors add http://localhost:3333 --credentials
```

Do not use a wildcard origin, and do not place a write token in the Studio or React application.

### 2. Start Studio

```bash
cd /mnt/agents/output/app/studio
npm install
npm run dev
```

Open **http://localhost:3333** and sign in with the Sanity account that has access to project `80016lrq`.

The Studio is configured in `sanity.config.ts` and `sanity.cli.ts`; no additional project should be created.

### 3. Open the November 2 pilot

In the left navigation, select **November 2 pilot setup**:

1. **1 · Gratitude Challenge series** opens the fixed series document `26-day-biblical-gratitude-challenge` with its title and slug prefilled. Confirm those values. When ready for references to resolve outside draft-only editing, publish only this non-sensitive series container; it contains no devotional manuscript.
2. **2 · Rejoice Always draft** opens the fixed Challenge document `2026-11-02-rejoice-always` with all seven screens prefilled. Reopening this item returns to the same document rather than creating duplicates.

The initial validation messages are intentional. The Challenge is not ready to publish until its release time, editorial review, and structured-block approvals are completed. Do not publish the November 2 Challenge during Milestone A.

No dataset documents were created or published by the implementation process because the CLI in this environment is not authenticated. The fixed drafts initialize through Studio after the account sign-in and CORS steps above.

## Editing guide

- **Reorder teaching:** Under **Challenge content → Guided screens**, drag screens into the intended order. Open a screen to add, remove, or reorder its content blocks. There is no fixed screen-count rule.
- **Edit prose:** Use **Rich teaching text** for paragraphs, emphasis, lists, headings, quotations, and verified external links.
- **Preserve meaningful presentations:** Use **Visual cards** for the Gospel statements and **Connected teaching sequence** for the done/doing/promised argument rather than flattening them into generic paragraphs.
- **Reflection/practice:** Choices contain only labels and revealed prompts. They do not represent private journal storage and will not become completion requirements in the app integration.
- **Optional deeper study:** Keep proposed research in **Optional deeper study** blocks with **Proposed — needs Alexis’s review** selected. It must not be treated as approved manuscript copy.
- **Approve editorial adaptations:** Only after Alexis reviews a structured block should its **Editorial review status** change to **Approved by Alexis**. The initial B2 comparison, B4 card presentation, B5 sequence, B6 reflection, and all three optional studies are deliberately marked proposed.
- **Complete document review:** Under **Editorial review**, record the reviewer and review time, then enable **Adaptation reviewed by Alexis** only after the whole adaptation is approved.
- **Set release availability:** Under **Series & release → Reader release time**, choose the actual release time and explicit offset with Aaron/Alexis. The initial draft intentionally has no guessed release time. This field is not an embargo or automatic scheduler.
- **Scripture text and rights:** The initial NIV record is reference-only. Before adding passage text, change text availability to **Text provided** and confirm **App usage rights confirmed**. Memorization practice cannot be configured without provided, rights-cleared text.
- **Companion material:** Social and Patreon material remains related metadata under **Series & release**, never a required teaching step. No unverified URLs are included.

**Preview limitation:** The real Bibleberry app preview is part of Milestone B and is not connected yet. Milestone A provides Studio’s form editor and structural previews only. Do not expect a text correction to appear in the React app yet.

## Schema inventory and renderer mapping

| Sanity type | Important fields / validation | Existing app mapping planned for Milestone B |
|---|---|---|
| `challengeSeries` document | Required title and slug; optional description, catalog dates, cover image; end date cannot precede start date | Monthly series identity and catalog metadata |
| `challenge` document | Required title, immutable slug, type, series, positive integer sequence, release time, primary Scripture, and nonempty screens | `InteractiveChallenge`; slug becomes the canonical identity with legacy-ID migration |
| `challengeScreen` object | Stable `_key`; optional label/heading; nonempty ordered block array | `LabScreen`; `_key` maps to stable screen identity |
| `scriptureReference` object | Reference, translation, text/practice availability, optional passage, usage-rights confirmation | `LabScripture`; supports reference-only records without pretending text or practice exists |
| `scriptureBlock` | One required Scripture object | Existing `scripture` block |
| `richTextBlock` | Required Portable Text with paragraphs, headings, quotations, lists, emphasis, and safe links | Existing `teachingText`, with a Portable Text renderer adapter |
| `statementBlock` | Required short statement and optional label | Existing `teachingText.pullQuote` presentation |
| `comparisonBlock` | Two labeled Portable Text explanations, optional footer, review status | Existing `contrast` block |
| `visualCardsBlock` | Nonempty cards with headings/explanations and review status | Existing `visualCards`; retained for November 2’s Gospel screen |
| `connectedSequenceBlock` | Two or more ordered steps, optional cycle/caption/conclusion, review status | Existing `connectedSequence`; retained for done/doing/promised |
| `reflectionBlock` | Question, optional choice/prompt pairs, closing, review status | Existing `reflectionChoice`; no private response field |
| `optionalStudyBlock` | Title, Portable Text, optional Scripture references, review status | Existing `optionalExploration`; remains optional for completion |
| `prayerBlock` | One or more authored paragraphs | Existing `prayer`; November 2 prayer is preserved in full |
| `companionLink` | Provider, label, source wording, optional verified URL and availability | Existing related-resource metadata after completion |
| `editorialReview` | Source metadata, adaptation approval, reviewer/time, internal notes | Editorial provenance only; excluded from future public projections |

Only the block types needed by the November 2 guided pilot are included. No generic embed system, arbitrary iframe HTML, complete diagram framework, bulk importer, account system, or additional Challenge reader experience was added.

## Publication safeguards

- Required document fields and nonempty teaching screens.
- Positive integer series sequence; adjacency is not inferred from dates.
- Document-level publication errors while the whole adaptation is unreviewed or any structured editorial block remains proposed.
- Reviewer name and review timestamp required when adaptation review is marked complete.
- Passage text requires consistent availability and explicit app usage-rights confirmation.
- Configured memorization requires provided, rights-cleared passage text.
- Cyclic sequences require a return caption.
- URLs are limited to HTTP(S); no executable embed HTML is stored.

Sanity draft/publish state remains separate from these editorial fields. A public dataset must be treated as publicly queryable: do not upload the complete source manuscript, private research, private links, or sensitive assets.

## November 2 draft boundaries

- Seven existing screens with stable keys `b1` through `b7` and 16 top-level content blocks.
- Complete core devotional argument, including suffering, the Gospel, redemption, circumstances, thanksgiving, and application.
- Complete original closing prayer.
- Reference-only 1 Thessalonians 5:16–18 NIV metadata; no passage text or memorization configuration.
- Three existing optional-study drafts, all marked proposed.
- No supplemental Walking Reel/Greek research in reader-facing content.
- No guessed release time, fabricated media URL, imported source document, or additional November Challenge.

Canvas mapping was not tested in this unauthenticated environment. No JSON importer was built; the fixed Studio initial-value template is the manual pilot path.

## Verification

Completed with Node.js **22.23.4**:

- `npm run typecheck` — passed.
- `npm run build` — passed; production Studio bundle generated in `dist/`.
- `npx sanity schema extract` — passed; 32 compiled schema entries and every November 2 block type present.
- Draft-content assertions — passed for seven ordered screens, exact prayer, 63 unique stable keys, reference-only Scripture, absent release time, and excluded supplemental research.
- Validation assertions — passed for the initial publication blocks, fully reviewed adaptation state, Scripture rights consistency, and memorization prerequisites.
- Development-server smoke check — Studio served successfully at the local origin. The unauthenticated browser run also confirmed that the local origin must be added to project CORS before sign-in can proceed.

Not independently verified: account-authenticated Studio editing, dataset draft creation, Canvas mapping, scheduled publishing, or React app integration. Those depend on account sign-in and/or Milestone B.

## Dependency security

Reviewed and updated on **2026-10-30** without changing Sanity 6.21.0 or the Bibleberry application:

- The original `js-yaml`, `smol-toml`, `undici`, and `typeid-js`/`uuid` findings were in Node-side CLI, build, and deployment dependency branches. Their package markers are absent from the production browser assets.
- Targeted `overrides` in `package.json` resolve `js-yaml` 3.15.2, `smol-toml` 1.9.1, `undici` 7.30.1, and `uuid` 11.1.1 for `typeid-js` only.
- Both `npm audit` and `npm audit --omit=dev` report **0 vulnerabilities** after a clean install.
- TypeScript and the Studio production build pass with the updated lockfile. `typeid-js` CommonJS and ESM UUID round-trip checks also pass.
- Do not use `npm audit fix --force`; its proposed Sanity 5.14.1 downgrade is unnecessary.

## File inventory

- `sanity.config.ts` — project/dataset connection, Structure tool, schemas, and initial templates.
- `sanity.cli.ts` — CLI project/dataset configuration.
- `structure.ts` — November 2 pilot setup plus ordinary Challenges and Series navigation.
- `schemaTypes/documents/` — `challengeSeries` and `challenge` documents.
- `schemaTypes/objects/` — screens, Scripture, editorial review, companion metadata, and all nine pilot block concepts plus their nested objects.
- `schemaTypes/fields.ts` — shared Portable Text and editorial-review fields.
- `schemaTypes/index.ts` — schema registration.
- `initialValues/nov2.ts` — fixed November 2 content, identities, and editorial boundaries.
- `initialValues/templates.ts` — fixed series and November 2 initial-value templates.
- `package.json`, `package-lock.json`, `tsconfig.json` — standalone Studio dependencies, scripts, and TypeScript configuration.
