# BerryMark Local Preview

## Scope

BerryMark Local Preview is a development-build-only bridge for visually reviewing a complete BerryMark compiler result in the existing CMS Challenge presentation. It does not import, approve, publish, or persist a Challenge.

The preview accepts a JSON object with:

- `ok: true`
- `mode: "experimental-pure-sanity-compilation"`
- `sanityCandidate`
- `reviewReport`
- `diagnostics`

Malformed JSON, unsuccessful compilations, missing result sections, invalid candidates, unsafe URLs, invalid Scripture states, duplicate keys, and unknown block types are rejected with path-specific diagnostics.

## Local reproduction

Use Node.js 24 or newer so the TypeScript adapter tests can run directly.

```bash
npm ci
npm run test:adapter
npm run build
npm run lint
npm run dev
```

1. Complete or bypass the ordinary onboarding using the existing reader flow.
2. Open **More → Developer Studio → Open Interactive Challenge Lab**.
3. Select **BerryMark Local Preview**. This source option exists only in development builds and is not enabled by `VITE_ENABLE_DEVELOPER_STUDIO`.
4. Choose a complete `.compiled.json` file. No manuscript or editorial sidecar is bundled with Bibleberry.
5. Review the compilation/source/counts/unresolved/approval/annotation report separately from the reader content.
6. Navigate with **Back** and **Continue**. Open optional studies and reflection choices as needed.
7. Use **Clear local preview** or **Finish and clear preview** to discard the file and reset navigation.

For the real manual demonstration, select the locally generated `examples/rejoice-always/rejoice-always.compiled.json` from the separate BerryMark working copy. Do not copy that file or its manuscript into Bibleberry assets.

## Isolation contract

- The selected file is read with the browser File API into component memory only.
- The file, review report, and navigation position are never written to localStorage, IndexedDB, or a remote service.
- No Sanity mutation client, privileged token, or write path is introduced.
- The preview does not enter the reader catalog, Saved Challenges, My Scripture, completion history, or persistent progress.
- The existing `mapPublishedChallenge()` remains the strict published-content boundary. The local adapter is separate and permits unresolved publishing metadata and proposed structured blocks without inventing values.
- The reader always remains under **LOCAL UNPUBLISHED PREVIEW — NOT APPROVED OR IMPORTED**.
- Scripture save buttons and Challenge save/completion controls are not rendered in local preview mode.

## Remaining pre-importer decisions

This preview deliberately leaves these decisions unresolved:

1. How an authored series identifier is resolved to an existing Sanity series reference.
2. Who assigns and approves sequence and release metadata when they are absent.
3. How Sanity document IDs are assigned and how compiled stable keys are handled by a future importer.
4. Which authorized editorial workflow records adaptation review, approver, and approval time.
5. How unresolved companion URLs are supplied and reviewed.
6. How Scripture passage text and app usage rights are confirmed before publication.
7. How a future, separately authorized importer writes drafts and handles recompilation or updates.

None of these decisions is inferred by the local preview.
