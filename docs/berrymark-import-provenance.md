# BerryMark import provenance schema

## Scope

`importProvenance` is reusable, non-sensitive technical lineage for a future authenticated BerryMark importer. Assignment 04E-A defines the Studio schema and regression coverage only. It does not implement an importer, perform Sanity writes, deploy Studio, or change publication behavior.

Challenge documents may omit `importProvenance`. Existing and manually authored Challenges therefore remain valid. They must not receive synthetic provenance: without a verified BerryMark import event, source digest, candidate digest, and importer/operator identity, backfilling this object would fabricate technical history. When supplied, the object is shown in Challenge’s **Technical provenance** group and is read-only in the ordinary Studio editor. This is a UI safeguard, not API-level write authorization.

Provenance is not editorial approval. It never satisfies Alexis’s adaptation review, CB4–CB8 structured-block review, Scripture rights checks, Sanity draft/publish state, release timing, series/sequence rules, or reader-facing content validation.

## Field contract

| Field | Required when supplied | Contract |
| --- | --- | --- |
| `sourceSystem` | Yes | Controlled value: `berrymark`. |
| `compilerContract` | Yes | Reviewed BerryMark compiler contract/version used for the candidate. |
| `compilerMode` | Yes | Controlled value: `experimental-pure-sanity-compilation`. |
| `canonicalId` | Yes | Deterministic `berrymark-challenge-<slug>` identity, not a draft ID. |
| `sourceFilename` | Yes | Non-sensitive logical filename or relative path; absolute local paths and `file:` values are rejected. |
| `sourceSha256` | Yes | Lowercase 64-character hexadecimal digest of the exact source manuscript. |
| `sourceRevision` | No | Authored source revision/location claim; not a Sanity revision or approval. |
| `candidateSha256` | Yes | Lowercase SHA-256 of the validated compiled candidate under the recorded compiler contract. |
| `lastImportedContentSha256` | Yes | Lowercase SHA-256 of importer-owned content after the last successful import. |
| `lastImportAction` | Yes | `create` or exceptional `update`; a no-op is not a new lineage event. |
| `importedBy` | Yes | Non-sensitive importer/operator identifier, not an approver, email, or credential. |
| `importedAt` | Yes | Explicit datetime of the successful import. |
| `previousSourceSha256` | For updates | Exact previous manuscript digest; required for `update` and forbidden for `create`. |

Do not store manuscript text, compiled artifacts or review reports, annotation bodies, private notes, credentials, tokens, absolute local paths, personal email or sensitive operator details, licensing documents, or privileged rights records in this object.

## Ownership and digest boundaries

The future importer owns and writes technical provenance. Alexis and other editors continue to own authored content, editorial review, rights evidence, and publication decisions through their existing fields and workflows.

The three required digests answer different questions:

- **`sourceSha256`** identifies the exact manuscript bytes verified by the importer.
- **`candidateSha256`** identifies the validated compiled candidate under `compilerContract` and `compilerMode`. Its computation remains governed by the BerryMark compiler contract.
- **`lastImportedContentSha256`** identifies the importer-owned Challenge field set after the last successful write, allowing a later planner to detect subsequent human edits.

This assignment deliberately does **not** define the content-hashing algorithm. Before an importer writes `lastImportedContentSha256`, a later contract must formally define the covered fields, normalization and serialization rules, key ordering, treatment of absent values, and digest encoding. Until then, the field is only schema capacity, not evidence that such an algorithm exists.

## Reader and dataset visibility

`PUBLISHED_CHALLENGE_QUERY` and the reader mapper intentionally omit `importProvenance`; the public Challenge structure is unchanged. Regression tests cover both query exclusion and defensive mapper exclusion.

The Sanity `production` dataset is publicly queryable. Projection exclusion reduces reader exposure but does not make provenance secret. Only non-sensitive technical metadata belongs in this object.

## Future BerryMark lookups

The authenticated online planner may use `sourceSystem`, `canonicalId`, `sourceSha256`, and `lastImportedContentSha256` to identify the canonical Challenge, verify manuscript lineage, and distinguish an unchanged import from human-edited content. Those lookups remain future importer behavior; this schema change adds no synchronization or mutation path.

An exceptional update still requires the existing pre-approved-draft conditions and explicit unapproved-review evidence. `previousSourceSha256` supplies lineage evidence only and does not authorize an update.

## Unresolved decisions

- The importer-owned content field set and deterministic hashing algorithm for `lastImportedContentSha256` remain unspecified.
- The protected location and retention policy for import-run history, review reports, credentials, and privileged rights evidence remain unresolved. This object is not that storage location.
- Importer authentication, API authorization, draft mutations, apply CLI behavior, and deployment require separate design and authorization.
