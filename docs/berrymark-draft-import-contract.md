# BerryMark → Sanity Draft Import Contract

**Status:** Proposed for Aaron Waid’s review; not approved or implemented  
**Scope:** Contract design and dry-run behavior only  
**Bibleberry baseline:** `main@add0d832c93243168be794e66bec0db2740e3e17`  
**BerryMark baseline:** `main@5b5601f667c5a9243db022912b3ae9b9ebd543cc`  
**Target operation:** A future authenticated, server-side operation that creates or exceptionally updates an **unpublished Sanity draft**

This document does not authorize an importer, a schema migration, a Sanity write, an API token, publication, or reader release. Import eligibility, draft creation, editorial approval, Sanity publication, and reader release are separate states.

## 1. Purpose and non-goals

The future operation converts a faithful BerryMark compilation into one controlled Sanity draft without losing content, inventing metadata, transferring approval, or overwriting human work. It must support a zero-write dry run before any mutation is considered.

The operation must not:

- Publish a Challenge or make it available to readers.
- Treat `ok: true`, local preview success, or source approval metadata as Sanity approval.
- Create a series, invent a sequence/release time, or convert a series slug directly into a document ID.
- Import unresolved prose approximately, omit unsupported blocks, or strip editorial diagnostics.
- Run in the ordinary reader or expose a Sanity credential to browser code.
- Perform routine two-way synchronization. Sanity remains authoritative after import.

## 2. Inspected contracts and current compatibility

The design is based on BerryMark’s compiler contract, compiler implementation, validation rules, deterministic key implementation, and both committed compiled demonstrations; and on Bibleberry’s Studio schemas, published read adapter, strict Challenge mapper, isolated Lab state, and BerryMark local-preview adapter.

The inspected demonstrations match current BerryMark `main`:

- `compiler-all-blocks.compiled.json`: all nine block types, one optional study, two nested Scriptures, proposed CB4–CB8 states, and unresolved series/editorial/URL information.
- `rejoice-always.compiled.json`: 7 screens, 16 top-level Content Blocks, 3 optional studies, 4 nested Scriptures, and 17 editorial annotations. Publishing metadata remains unresolved.
- Both have `ok: true`, `importReady: false`, and `publicationReady: false`. Compilation success is not import or publication readiness.

### Where the systems agree

| Area | Existing agreement to preserve |
| --- | --- |
| Challenge content | Title, authored slug, type, summary, primary Scripture, ordered screens, and CB1–CB9 have concrete Sanity-shaped mappings. |
| Portable Text | Paragraphs, h2/h3, quotations, strong/emphasis, bullet/number lists, and HTTP(S) links use real Portable Text nodes. |
| Structural identity | Authored SCREEN/CB/CARD/STEP/CHOICE and CB8 Scripture IDs become stable `_key` values; order is independent of identity. |
| Generated keys | Portable Text and companion keys are deterministic and content-derived, with collision handling. |
| Scripture consistency | Reference-only text cannot contain a passage; provided text requires passage and rights assertion; configured practice requires eligible provided text. |
| Safe links | Companion and Portable Text links permit HTTP(S), not unsafe schemes. |
| Editorial separation | Source annotations and approval claims remain in the review sidecar, not reader-facing prose. |

### Where they deliberately differ

| Area | BerryMark compiler result | Bibleberry requirement or gap |
| --- | --- | --- |
| Document identity | No `_id`, `_rev`, timestamps, or draft ID | A controlled deterministic ID and duplicate policy are required. |
| Series | Authored series slug is a pending lookup; `series` is omitted | `challenge.series` is a required weak reference to an existing `challengeSeries`. |
| Sequence/release | Values may be absent or explicitly null | Studio marks both required; missing-value draft policy must be explicit. |
| Editorial review | Always writes `adaptationReviewed: false`; source approval stays in the sidecar | Published adapter requires `adaptationReviewed: true` and a valid `reviewedAt`; Studio also requires reviewer attribution when reviewed. |
| Structured blocks | CB4–CB8 always remain `proposed` | Published adapter requires `approved`; local preview alone accepts `proposed`. |
| Provenance | Filename, source SHA-256, revision state, candidate structure, diagnostics, and annotations | Current Challenge schema has no field capable of detecting post-import content edits or storing a complete import lineage. |
| Source author | Preserved in `authoredMetadata` | No `editorialReview.sourceAuthor` destination exists. |
| Review items | Structured annotations and unresolved diagnostics remain in the compilation artifact | No structured per-item warning/annotation disposition exists in Sanity. |
| Read path | Candidate is local and incomplete | `mapPublishedChallenge()` must remain strict and unchanged by draft import work. |

Studio validation is an editorial guardrail, not proof of authorization or a substitute for the import contract. The existing public published-read path is not an embargo mechanism.

## 3. State model and gates

| State | Required evidence | Does not imply |
| --- | --- | --- |
| **Compilation valid** | `ok: true`, faithful supported content, no error diagnostics | Schema completeness, rights verification, approval, or import eligibility |
| **Import eligible** | Complete trusted artifact, strict target validation, supported content, consistent Scripture, required provenance, and no blocking conflict | Permission to publish; publishing metadata may remain unresolved under the proposed incomplete-draft policy |
| **Draft created/updated** | Authenticated server performed an explicit draft-only mutation after fresh preflight | Editorial approval, publication, or reader release |
| **Editorially approved** | A truthful human review recorded with actual approver and timestamp; applicable CB4–CB8 review completed | That Sanity publication already occurred |
| **Sanity published** | Authorized editor deliberately publishes the document | That future-dated or otherwise restricted reader delivery is safe |
| **Reader released** | Existing/future reader availability rules permit retrieval at the intended instant | A backdated approval or import event |

For ministry teaching, Alexis’s editorial authority remains unchanged. Aaron’s separately documented ability to approve harmless technical test records must not be generalized into approval of Alexis’s teaching. The current Alexis-only Studio labels and the known Aaron-or-Alexis policy correction remain a separate editorial/schema decision; import always uses the conservative unapproved state.

## 4. Accepted input and trust boundary

### 4.1 Complete artifact

The input is a complete compiler result, not `sanityCandidate` alone:

```text
{
  ok: true,
  mode: "experimental-pure-sanity-compilation",
  sanityCandidate: { ... },
  reviewReport: { ... },
  diagnostics: [ ... ]
}
```

The import validator must reject, rather than strip or repair:

- `ok !== true`, a different mode, a null candidate, or missing result sections.
- Any error-severity diagnostic.
- `reviewReport.importReady !== false` or `publicationReady !== false` in the compiler artifact.
- Candidate-supplied `_id`, `_rev`, `_createdAt`, `_updatedAt`, `series`, reviewer fields, review notes, or approval fields not emitted by the compiler.
- `editorialReview.adaptationReviewed !== false` or any CB4–CB8 `reviewStatus !== 'proposed'`.
- Unknown block types, unknown target fields, invalid/missing keys, duplicate sibling keys, unsafe URLs, malformed Portable Text, or inconsistent Scripture states.
- Missing or inconsistent source digest, slug, structural counts/inventory, metadata states, unresolved items, controlled mappings, pending lookups, skipped fields, compatibility information, or report diagnostics.
- A target-schema compatibility assertion that does not match the schema version used by the importer.

Validation must recompute structural counts and candidate/provenance hashes rather than trusting report totals. Unlike the local preview, import validation must reject unknown fields instead of allowing schema parsing to discard them.

### 4.2 Source binding

A browser-supplied JSON artifact is not trusted evidence for a write. The recommended future request includes the exact BerryMark source and the compilation. The authenticated server must:

1. Recompute SHA-256 over the exact source and compare it with `reviewReport.source.sha256`.
2. Recompile with the pinned BerryMark compiler and compare the candidate and relevant review-report fields with the supplied artifact.
3. Reject any mismatch as `BM_IMPORT_ARTIFACT_MISMATCH`.

A future trusted build pipeline may substitute a server-generated artifact for source recompilation, but that is a separate implementation decision. Artifact-only structural validation is sufficient for local preview, not for an authenticated write.

## 5. Field and metadata contract

### 5.1 Importer-owned content fields

On initial creation, the importer may populate only fields traceable to the validated candidate:

- `title`, `slug`, `challengeType`, `summary`
- `primaryScripture`
- `screens` and all nested content
- `companionLinks`
- `editorialReview.sourceTitle`, optional `sourceRevision`, and `adaptationReviewed: false`
- Approved internal import-provenance fields described below

The importer preserves exact strings, arrays, `_key` values, Portable Text marks/links, optional-versus-required semantics, and absent optional fields. It does not serialize the review sidecar into reader content.

### 5.2 Publishing metadata

- **Series:** Resolve the authored series slug through a fixed server-side query. Exactly one existing published `challengeSeries` must match before a reference can be emitted. Use its actual base document `_id`; never use the slug as `_ref`, never reference `drafts.*`, and never create a series. Zero matches, multiple matches, or draft-only matches remain unresolved/conflicting.
- **Sequence:** Preserve a supplied positive integer. Do not infer the next value or silently resolve a sequence collision. A colliding sequence within the resolved series is a human-review conflict.
- **Release:** Preserve a supplied timezone-aware instant exactly. Never substitute import time, current time, or a guessed editorial date.
- **Missing values:** Recommended policy, requiring Aaron’s acceptance: an **unpublished incomplete draft** may omit unresolved `series`, `sequence`, and `releaseAt`, with every omission prominent in the dry run and Studio review. These omissions block publication and live-reader eligibility. If Aaron instead selects strict draft completeness, the same conditions block creation; the implementation must not choose silently.

When metadata is supplied later by a human in Sanity, it is human-owned and must survive any permitted draft update.

## 6. Document identity and duplicate prevention

For the validated lowercase slug `s` (BerryMark already restricts it to 1–96 lowercase alphanumeric/hyphen characters), propose:

```text
canonicalId = "berrymark-challenge-" + s
draftId     = "drafts." + canonicalId
```

The compiler continues to omit `_id`; only the authenticated import planner derives these values. The authored slug remains immutable. No title-based renaming or random UUID is introduced.

Before create or update, authenticated read access must check:

1. The canonical published ID and exact draft ID.
2. Any other Challenge with the same `slug.current`, including published and draft versions.
3. Import provenance for an existing draft.
4. For a complete publishing plan, sequence collisions within the resolved series.

Outcomes:

- No matching document: `create` is permissible after all other gates pass.
- Same deterministic draft, same source and unchanged imported content: `none` (idempotent no-op).
- Same deterministic draft, eligible revised source: `update` only under Section 7.
- Existing published canonical document: conflict; never overwrite or update it through BerryMark import.
- Same slug under another ID, or an existing draft without matching BerryMark provenance: conflict.
- Lookup unavailable/not authorized: proposed action is `unknown`, never `create`.

The write path must repeat these checks immediately before mutation and use `createIfNotExists` for the exact draft ID or an equivalent transaction with an expected revision. A dry-run result is not a reservation. `createIfNotExists` prevents overwriting the same draft but does not by itself prove global slug uniqueness, so the slug check remains necessary.

## 7. Revised manuscripts and update policy

The default remains **create-only, one-way handoff**. A revised manuscript is not authorization to replace an existing draft.

A revised import may update an existing unpublished draft only when all conditions hold:

1. The operator supplies `expectedPreviousSourceSha256`, matching the draft’s last imported source digest.
2. The draft’s provenance identifies BerryMark and the same deterministic identity.
3. A hash of the current importer-owned content equals `lastImportedContentSha256`; otherwise Sanity edits have occurred and the operation conflicts.
4. No published canonical version exists.
5. The draft remains editorially unapproved and every CB4–CB8 remains proposed. An approved draft requires human intervention; import must not reset or silently carry forward approval.
6. Fresh validation, series/duplicate checks, and dry-run review pass.

A permitted update replaces only importer-owned content and updates provenance. It preserves human-owned publishing assignments and internal review notes. It does not change the canonical/draft ID, author-supplied structural keys, publication state, or approval state.

If the source is unchanged, return a no-op without a write. If the source differs but the expected previous digest is absent/mismatched, content was edited in Sanity, or approval exists, return `BM_IMPORT_REVISION_CONFLICT` or `BM_IMPORT_APPROVED_DRAFT_CONFLICT`. Do not force-update, duplicate, revert approval, or merge content automatically.

This exceptional pre-approval update path does not establish ongoing BerryMark↔Sanity synchronization.

## 8. Editorial approval and annotations

- Always create with `adaptationReviewed: false` and CB4–CB8 `reviewStatus: 'proposed'`.
- Never map source `approvalStatus`, `approvedBy`, or `approvedAt` into Sanity approval automatically, even when present and truthful in the source.
- Preserve those claims in the returned import report as source claims, not destination facts.
- `EDITORIAL NOTE`, `TODO`, and `REVIEW REQUIRED` items remain exact, located, and unresolved in the dry-run/import report.
- Recommended draft policy: unresolved editorial annotations may accompany an unpublished draft for human review, but they block publication. They must be explicitly counted and acknowledged; none may disappear because Sanity lacks a structured destination.
- Do not put annotations, source-author metadata, diagnostics, warning overrides, or fingerprints into public teaching prose.
- A scoped warning-override syntax and structured Sanity review-item disposition remain unapproved. No importer may invent them.

## 9. Scripture rights contract

Structural consistency is necessary but not sufficient:

- Reference-only Scripture may be imported with no passage text and no inferred practice availability.
- `usageRightsConfirmed: true` remains an author assertion, not independent license evidence.
- Before any passage text is included in an import, a human-verified rights record must identify the translation/edition, permitted app-use scope, verifier, and verification date. The exact durable location and evidence format require Aaron’s decision.
- If that evidence is absent or inconsistent, reject the import with `BM_IMPORT_RIGHTS_EVIDENCE_REQUIRED`; do not silently delete the passage or downgrade it to reference-only.
- Configured memorization continues to require eligible provided text. Import never configures practice merely because passage text exists.
- The future public query must continue to exclude internal rights evidence and editorial notes.

## 10. Provenance and import history

Current `editorialReview.sourceRevision` is insufficient for safe reimport. A separately reviewed schema addition should store a minimal, non-reader-facing `importProvenance` object containing:

- `sourceSystem: 'berrymark'` and compiler contract/mode.
- Source filename, source SHA-256, and optional authored source revision.
- Canonical SHA-256 of the imported candidate and `lastImportedContentSha256` over importer-owned fields.
- Last import action (`create` or `update`), authenticated importer identity, and server-recorded import timestamp.
- Previous source SHA-256 for an update, when applicable.

`importedBy` is the system operator, not an editorial approver. Server timestamps are permitted here, but never in the deterministic compiler.

The complete compilation/report and each dry-run/apply result should be retained as protected operational artifacts or an auditable import-run record. The durable retention location is unresolved. Do not store the full editorial sidecar in the current public Challenge document. Fields excluded from Bibleberry’s reader projection are still potentially retrievable from a public dataset by direct query; provenance stored in Sanity must therefore be non-sensitive.

## 11. Dry-run contract

Dry run is the default and only offline operation. It performs **zero Sanity writes**, whether it runs entirely locally or uses authenticated read-only lookups.

### 11.1 Result shape

```text
{
  mode: "dry-run",
  writesAttempted: 0,
  importEligible: boolean,
  source: { filename, sha256, revision },
  proposedIdentity: { slug, canonicalId, draftId },
  lookup: { status: "offline" | "complete" | "failed", dependencies: [...] },
  proposedAction: "create" | "update" | "none" | "reject" | "unknown",
  readyFields: [{ path, source, resolution }],
  missingRequiredMetadata: [{ path, state, blocksPublication: true }],
  unresolvedEditorialDecisions: [...],
  unresolvedLookups: [...],
  conflicts: [...],
  errors: [...],
  warnings: [...],
  provenanceChanges: {...},
  target: { projectId, dataset, schemaRevision }
}
```

`readyFields` describes fields that can be mapped truthfully; it does not claim publication readiness. `missingRequiredMetadata` preserves absent versus explicit null where the compiler report supplies it.

### 11.2 Required behavior

- Offline validation can report `reject` for invalid input without contacting Sanity.
- If all local gates pass but existing-document/series lookup requires unavailable authentication, return `lookup.status: 'offline'` and `proposedAction: 'unknown'`. Never fabricate `create` or `update`.
- An authenticated dry run may read the target dataset but must not create a token, mutate a document, publish, or change a setting.
- `create` requires a completed duplicate/identity lookup; `update` additionally requires the provenance and revision checks in Section 7.
- Missing publishing metadata, unresolved editorial items, rights assertions, and conflicts must remain separately visible rather than collapsing into a generic “ready” label.
- A subsequent apply operation must rerun preflight; it cannot treat an old dry run as authorization.

## 12. Error and conflict reporting

Every machine-readable issue should include severity, stable code, safe message, source filename/line/column when available, source path, destination path, stable screen/block/nested ID when relevant, and related locations for collisions. Internal stacks, credentials, request headers, and privileged response details must not leak to the browser.

Minimum import-specific codes:

| Code | Meaning |
| --- | --- |
| `BM_IMPORT_RESULT_INVALID` | Incomplete, unsuccessful, contradictory, or unknown compiler result |
| `BM_IMPORT_ARTIFACT_MISMATCH` | Source/artifact/recompilation or target-schema binding failed |
| `BM_IMPORT_UNSUPPORTED_BLOCK` | No exact supported target mapping; no partial import |
| `BM_IMPORT_METADATA_REQUIRED` | Required publishing value is unresolved under the accepted draft policy |
| `BM_IMPORT_SERIES_NOT_FOUND` | No eligible published series matches the authored slug |
| `BM_IMPORT_SERIES_CONFLICT` | Multiple/draft-only/otherwise ambiguous series resolution |
| `BM_IMPORT_DUPLICATE_SLUG` | Same Challenge slug exists under an unexpected identity |
| `BM_IMPORT_ID_CONFLICT` | Canonical/draft ID is occupied by incompatible content |
| `BM_IMPORT_LOOKUP_REQUIRED` | Create/update cannot be determined without authenticated read |
| `BM_IMPORT_REVISION_CONFLICT` | Expected source, content hash, or current revision differs |
| `BM_IMPORT_APPROVED_DRAFT_CONFLICT` | Revised import would disturb human approval |
| `BM_IMPORT_RIGHTS_EVIDENCE_REQUIRED` | Passage text lacks the required independent rights confirmation |
| `BM_IMPORT_REVIEW_TRANSFER_FORBIDDEN` | Input attempts to assert destination approval/review state |
| `BM_IMPORT_SCHEMA_INCOMPATIBLE` | Candidate/provenance does not match the current target schema |

Errors block import. Warnings do not imply approval and cannot be broadly ignored. A failed apply must leave no partial Challenge; multi-operation mutations must be atomic.

## 13. Security and execution location

The future operation must run in an authenticated server-side process or protected administrative job, never in the Bibleberry reader, local-preview component, or public browser bundle.

- Browser code must contain no Sanity write token, privileged read token, or secret. A future browser UI may call a protected application endpoint without receiving the credential.
- Credentials belong in the server environment/secret store with least available privilege and a separately authorized lifecycle. Even if Sanity cannot technically scope a token to drafts only, application code must expose only draft mutations and never a publish operation.
- Use fixed project/dataset/query templates and strict request-size limits; never accept arbitrary GROQ or mutation bodies from a client.
- Authenticate and authorize the operator, protect against cross-site/request replay as applicable, rate-limit the administrative endpoint, and record a safe audit event.
- Online dry run and apply use separate explicit modes; apply is never the default.
- CORS is not an authentication boundary. This contract does not change CORS, dataset visibility, hosting, or deployment.
- The existing local file preview remains memory-only and is not an import transport.

## 14. Recommended implementation sequence after approval

No more than three small PRs should implement this contract. Each requires its own assignment and remains unmerged until Aaron accepts it.

### PR 1 — Pure import planner and offline dry run

**Boundary:** Strict complete-artifact validation, source/artifact binding, deterministic identity proposal, field-readiness report, machine-readable issues, and offline `unknown` action. No network, schema change, browser UI, or writes.

**Regression coverage:** All CB1–CB9 and nested structures; malformed/false-readiness/unknown-field rejection; counts and hashes; stable IDs; missing metadata; series pending lookup; rights states; editorial separation; deterministic repeat reports; explicit assertion of zero network/write calls.

**Acceptance:** Synthetic valid/invalid artifacts produce accurate reports; the real demonstrations remain truthful and are not bundled into production; no application behavior changes.

### PR 2 — Reviewed provenance schema and authenticated read-only online dry run

**Boundary:** Add only the accepted non-sensitive provenance fields; implement server-side authenticated lookup for series, IDs, slugs, provenance, and revision state. Resolve `create`/`update`/`none`/`unknown` without mutations. Approval-label/policy corrections remain separate unless Aaron expressly includes them.

**Regression coverage:** Series zero/one/multiple/draft-only matches; draft versus published collisions; same-source no-op; edited/approved draft conflicts; sequence conflicts; credential exclusion from client bundles; zero writes with mocked and authorized development reads.

**Acceptance:** Schema review and compatibility are documented; the server can produce a truthful online plan; no Sanity document is created or changed.

### PR 3 — Controlled draft-only apply

**Boundary:** Authenticated server-side create/no-op/exceptional update using fresh preflight and atomic `createIfNotExists`/expected-revision behavior. Return draft identity and review report. No publish, reader release, general sync, or public UI.

**Regression coverage:** Successful new draft; idempotent same-source no-op; permitted unchanged/unapproved draft update; every conflict path; no partial writes; no approval transfer; no editorial leakage; no credential exposure; published adapter remains strict; production bundle isolation.

**Acceptance:** A separately authorized harmless synthetic draft demonstrates the path in a development dataset/environment. Human editorial review and publication remain manual, distinct, and unperformed by the importer.

## 15. Decisions and risks requiring explicit review

1. **Incomplete drafts:** Confirm whether unresolved series/sequence/release may enter an unpublished draft. Recommendation: allow visible incomplete drafts; always block publication.
2. **Identity convention:** Approve `berrymark-challenge-<slug>` and the immutable-slug rule before implementation.
3. **Exceptional updates:** Approve the bounded pre-approval update path and content-hash conflict detection, or retain strict create-only behavior.
4. **Provenance storage:** Approve the schema fields and protected import-run retention location. Do not treat excluded reader fields as private in a public dataset.
5. **Editorial annotations:** Confirm that unresolved annotations may accompany a draft while blocking publication, and decide their durable review/disposition mechanism.
6. **Approval policy/schema:** Reconcile Aaron-or-Alexis technical approval with Alexis’s ministry editorial authority and current Alexis-only labels. Import itself never transfers approval.
7. **Rights evidence:** Select the durable human verification record required before passage text can be imported.
8. **Warning overrides:** Syntax, storage, and revision-sensitive disposition remain unapproved and are not needed for a conservative first implementation.
9. **Publication enforcement:** Studio validation is not a server authorization boundary. Publication policy and future server-authoritative release/embargo work remain separate gates.
10. **Concurrency:** Deterministic IDs plus fresh checks reduce duplicate risk, but uniqueness across differently identified documents is not guaranteed by `createIfNotExists` alone; retain slug checks and conflict reporting.

Until these decisions are accepted as needed for implementation, this document is a reviewable technical proposal—not evidence that any draft import is ready, authorized, or operational.
