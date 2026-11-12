# Bibleberry R13-0 — Account Reconciliation Contract & Pure Merge Specification

> **Status:** Architecture contract and pure offline reconciliation proof (Issue [#70](https://github.com/ContraPhilosophy/Bibleberry/issues/70))  
> **Verified Repository Baseline:** `ContraPhilosophy/Bibleberry` `main` at `3e9f2261c0c331ebf12b7d4dac48a2b6cc025837` (November 11, 2026)  
> **Scope Boundary:** Design contract + isolated pure reconciliation module (`src/accountSync/**`). Zero live Supabase, authentication, UI, Sanity, Gateway, or accepted V2 participation store modifications are included or authorized by this document.

---

## 1. Purpose and Governing Product Authority

This contract defines the deterministic data reconciliation model for migrating and merging guest participation records into future Supabase-backed reader accounts (**R13**), grounded directly in the currently accepted **V2 guest participation model** on `main` (`3e9f2261`) and the owner-approved product rules in:

- [Approved Reader Experience, Month Screen & Field Notebook](../product/2026-11-08-approved-reader-experience-and-month-screen.md) (§§5.2, 6, 8)
- [Gamification, Achievements & Participation](../product/gamification-and-achievements.md)
- [User Accounts, Authentication & Cross-Device Continuity](user-accounts-and-sync.md)
- [R08A-0 Monthly Publication, Series Identity, and Release Contract](r08a-0-monthly-publication-release-contract.md) (§6)
- [Product & Application Development Roadmap](../product/application-development-roadmap.md)

### Settled Product Requirements Enforced by This Contract

1. **Automatic new-account transfer:** Registering a new account on a guest device automatically transfers the guest's valid participation records (completed Challenges, saved Challenges, saved Scripture, earned awards + dates + presentation flags, in-progress positions, last-opened pointer, and guest Shelf selections).
2. **Automatic existing-account merge:** Signing a guest device into an existing account automatically merges legitimate records from both sides without discarding valid accomplishments from either side.
3. **Existing account Shelf precedence:** When guest and existing-account Shelf selections (`0–3` historical months) conflict, the **existing account's Shelf selections win**. Underlying guest completions, saved Scripture, reading positions, and earned Scripture Cards remain preserved in the Library and Field Notebook.
4. **Set-like union & deduplication:** Challenge completions and saved Scripture union and deduplicate by canonical stable identities (`cms:<publishedSanityBaseId>` and `SavedScriptureKey`).
5. **Unique permanent awards with credible dates:** Each earned award (`card:monthly:YYYY-MM:<slug>`) remains unique, permanent, and non-regressive. Duplicate earned dates collapse to the **earliest credible, server-admissible date** — never blindly accepting an unverified lower client clock claim.
6. **Independent monotonic Card presentation flags:** `hubAnnouncementAcked` (Hub combined announcement) and `cardViewed` (individual Card open state) are strictly independent monotonic facts (`false -> true`). Reconciliation must never un-acknowledge or un-view an award, and must never infer `hubAnnouncementAcked = true` merely because `cardViewed = true` (or vice versa).
7. **Authoritative furthest reading position:** Conflicting partial in-progress positions resolve to the **furthest position** *only* when authoritative Challenge screen ordering (`screen._key[]`) is known. Opaque `screenId` strings are **never** compared lexicographically, and conflicting positions are never resolved solely by client timestamps when ordering is unknown.
8. **Minimal durable records, no compulsory login, no streaks:** No comprehensive behavioral event log, no punitive attendance streaks, and no promise of full offline bidirectional sync.
9. **Clear authority split:** Sanity owns editorial content; Supabase (`auth.uid()` + PostgreSQL + RLS) is the future private account authority; client-supplied account IDs, eligibility claims, and unverified client clocks cannot establish server authority.

---

## 2. Evidence-Based Inventory: Existing V2 Implementation vs. Proposed R13 Structures

> [!IMPORTANT]
> Every item below separates **Existing (Accepted V2 on `main` `3e9f2261`)** from **Proposed (R13 Account Contract — Not Yet Wired to Live Storage or Network)**. Do not treat proposed account/Shelf tables or envelopes as currently deployed infrastructure.

### 2.1 Existing Accepted V2 Participation Inventory (`src/participation/**`)

| Area | Existing Accepted Symbol & File | Verified Behavior on `main` (`3e9f2261`) |
| --- | --- | --- |
| **Durable Guest Envelope** | `GuestParticipationEnvelopeV2` (`schemaVersion: 2`), `ReaderParticipationData` in [types.ts](../../src/participation/types.ts) | Current durable envelope stored under `GUEST_PARTICIPATION_STORAGE_KEY` (`'bibleberry-reader-participation-v1'`) via web `localStorage` or native Capacitor `Preferences` ([defaultGuestStore.ts](../../src/participation/defaultGuestStore.ts)). |
| **Legacy V1 Migration Source** | `GuestParticipationEnvelopeV1` (`schemaVersion: 1`), `ReaderParticipationDataV1` in [types.ts](../../src/participation/types.ts), [persistence.ts](../../src/participation/persistence.ts) | Read-only migration source. `parseParticipationEnvelope` upgrades V1 in memory with `earnedAwards: {}` and keeps V1 intact on disk until the first successful write (`serializeParticipationEnvelope` writes `schemaVersion: 2`). |
| **Schema Version Guard** | `parseParticipationEnvelope` in [persistence.ts](../../src/participation/persistence.ts) | Fails closed with `health: 'unsupportedNewerSchema'` for integer `schemaVersion > 2`, and `health: 'corruptStoredData'` for invalid JSON/shapes. Never overwrites unrecognized newer schemas automatically. |
| **Namespace & Challenge ID** | `ChallengeIdentityNamespace` (`'cms' \| 'pilot'`), `parseStoredChallengeId`, `formatCanonicalChallengeId` in [identity.ts](../../src/participation/identity.ts) | Enforces `cms:<publishedSanityBaseId>` in production; rejects `drafts.*`, whitespace padding, malformed tokens, and forbidden Lab/fixture tokens/prefixes (`fixture-`, `pilot-`, `weekly-pilot-`, `sanity-live`, `sanity-fixture`, `nov-1..3,5`, etc.). |
| **Write Admission & Aliases** | `admitTrustedCatalogChallenge`, `admitReleasedCmsChallenge` in [admission.ts](../../src/participation/admission.ts); `reconcileChallengeAliases` in [model.ts](../../src/participation/model.ts) | Runtime capability token (`ADMITTED_CHALLENGE_BRAND`) plus explicit editorial `previousDocumentIds` alias map (`oldId -> newId`). Cycle-safe alias collapse keeps earliest `completedOn` and `savedOn`, clears redundant `inProgress` if target is completed, and rewrites `lastOpenedChallenge` and `savedScriptures[].sourceChallengeId`. |
| **Completed Challenges** | `CompletedChallengeRecord` (`{ completedOn }`) in [types.ts](../../src/participation/types.ts), [model.ts](../../src/participation/model.ts) | Keyed by `CanonicalChallengeId`. Repeat `completeChallenge` is a no-op that preserves original `completedOn` and deletes any `inProgressChallenges[challengeId]` entry. |
| **In-Progress Challenges** | `ChallengeResumeRecord` (`{ screenId?, updatedOn }`) in [types.ts](../../src/participation/types.ts), [model.ts](../../src/participation/model.ts) | `screenId` is Sanity `screen._key` (opaque string), or `undefined` for single-surface Challenges. Completed Challenges cannot coexist in `inProgressChallenges`. |
| **Saved Challenges** | `SavedChallengeRecord` (`{ savedOn }`) in [types.ts](../../src/participation/types.ts) | Keyed by `CanonicalChallengeId`; local guest toggle `setChallengeSaved` adds/removes the entry (no tombstone history). |
| **Saved Scripture** | `SavedScriptureRecord` (`key`, `reference`, `translation`, `savedOn`, `sourceChallengeId?`), `createSavedScriptureKey` in [identity.ts](../../src/participation/identity.ts) | Deduplicated by `SavedScriptureKey = "<normalizedRef>|<normalizedTranslationOrEmpty>"` (NFC, collapsed whitespace, em/en/minus dashes normalized to `-`, lowercase; `'Not configured'`/blank translation normalizes to `null`). Passage text is never stored. |
| **Last Opened Pointer** | `LastOpenedChallengePointer` (`{ challengeId, openedOn, resumeDismissedOn? }`) in [types.ts](../../src/participation/types.ts) | Single nullable pointer tracking most recently opened Challenge and optional resume-prompt dismissal date. |
| **Earned Awards & Flags** | `EarnedAwardRecord`, `EarnedScriptureCardSnapshot`, `recordEarnedAwards`, `markEarnedCardViewed`, `acknowledgeAwardAnnouncements` in [types.ts](../../src/participation/types.ts), [model.ts](../../src/participation/model.ts), [awards.ts](../../src/participation/awards.ts) | Canonical `awardId`: `card:monthly:YYYY-MM:<slug>` (`kind`: `'fullMonth'` when slug is `'full-month'`, else `'thematic'`; `discoveryId`: `discovery:YYYY-MM:<slug>`). `recordEarnedAwards` preserves prior `earnedOn`, `hubAnnouncementAcked`, `cardViewed`, and valid `earnedCard`/`cardDocumentId` (backfilling missing snapshots only). `validateEarnedCardSnapshot` allows only `https://cdn.sanity.io/images/...` URLs without query/hash and strips passage/Sanity internals. |
| **Store Concurrency & Clear** | `createReaderParticipationStore` in [store.ts](../../src/participation/store.ts) | Serialized FIFO I/O queue with monotonic `epoch` + `AbortSignal` so `clearLocalData()` cannot be undone by an in-flight read or write. |

### 2.2 Proposed R13 Structures (New — Isolated in `src/accountSync/` & Future Supabase Schema)

| Structure | Classification | Purpose & Relationship to V2 |
| --- | --- | --- |
| **`AccountId`** | **Proposed R13** | Branded non-empty canonical account identifier (matching Supabase `auth.users.id` UUID in live integration; validated format without whitespace/control keys in pure proof). |
| **`DateProvenance`** (`'serverVerified' \| 'clientReported'`) | **Proposed R13** | Distinguishes server-attested dates (using `serverNowUtc` + `Option 1C` timezone bounds) from unverified guest device clock claims. |
| **`ProposedAccountShelfState`** & **`ProposedAccountShelfEntry`** | **Proposed R13** | Models the future `0–3` historical month Shelf (`yearMonth: PublicationYearMonth`, `admissionKind: 'readerSelected' \| 'autoAdmitted'`, optional `admittedOn`, optional `activeFocusMonth`). Current V2 guest storage does **not** yet persist Shelf state. |
| **`ProposedAccountParticipationEnvelope`** (`schemaVersion: 1`) | **Proposed R13** | Platform-neutral account snapshot (`accountId`, `namespace`, `revision`, `data`) carrying V2-compatible participation maps plus `DateProvenance` metadata and `shelf` state. |
| **`ReconciliationRequest` / `ReconciliationResult`** | **Proposed R13** | Typed pure merge input/output with explicit `'clean'`, `'reconciledWithUnresolved'`, and `'rejected'` outcomes, `UnresolvedReconciliationItem[]`, `RejectedRecordDiagnostic[]`, and `ShelfConflictResolutionNotice[]`. |
| **`CommitAckReceipt` & `canSafelyClearGuestStorage`** | **Proposed R13** | Idempotency-keyed commit receipt + fingerprint verification ensuring guest local storage is cleared **only** after verified durable commit AND when no new unsubmitted local mutations occurred in flight. |

---

## 3. Proposed Account-Bound Relational Data Model (Supabase PostgreSQL)

The pure proof in `src/accountSync/` operates on immutable in-memory snapshots so it stays platform-neutral and testable offline. When live R13 backend work begins, the snapshots map 1:1 to minimal normalized PostgreSQL tables owned by `account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`:

| Table (Proposed) | Primary Key / Unique Key | Columns & Constraints | Merge / Sync Semantics |
| --- | --- | --- | --- |
| `account_participation_profiles` | `account_id` (PK) | `namespace text CHECK (namespace = 'cms')`, `schema_version int`, `revision bigint`, `last_opened_challenge_id text`, `last_opened_on date`, `resume_dismissed_on date`, `active_focus_month text`, `updated_at timestamptz` | Monotonic `revision` incremented per committed transaction; optimistic concurrency check on updates. |
| `account_completed_challenges` | `(account_id, challenge_id)` | `completed_on date NOT NULL`, `date_provenance text NOT NULL`, `client_claimed_on date`, `first_recorded_at timestamptz NOT NULL` | `ON CONFLICT (account_id, challenge_id) DO UPDATE` only when a more credible or earlier server-verified date supersedes a tentative date; never deletes or inflates count. |
| `account_in_progress_challenges` | `(account_id, challenge_id)` | `screen_id text`, `updated_on date NOT NULL`, `unresolved_conflict boolean NOT NULL DEFAULT false` | Deleted automatically when `(account_id, challenge_id)` exists in `account_completed_challenges`. |
| `account_saved_challenges` | `(account_id, challenge_id)` | `saved_on date NOT NULL` | Union on merge (`LEAST(existing.saved_on, incoming.saved_on)`). Future cross-device unsave requires explicit tombstone design (deferred). |
| `account_saved_scriptures` | `(account_id, scripture_key)` | `reference text NOT NULL`, `translation text`, `saved_on date NOT NULL`, `source_challenge_id text` | Deduplicated by `SavedScriptureKey`; preserves earliest `saved_on` and non-null `source_challenge_id`. |
| `account_earned_awards` | `(account_id, award_id)` | `kind text`, `publication_year_month text`, `discovery_id text`, `earned_on date NOT NULL`, `date_provenance text NOT NULL`, `client_claimed_on date`, `hub_announcement_acked boolean NOT NULL DEFAULT false`, `card_viewed boolean NOT NULL DEFAULT false`, `card_document_id text`, `earned_card_snapshot jsonb` | **Monotonic flags:** `hub_announcement_acked = existing OR incoming`, `card_viewed = existing OR incoming`. Snapshot backfilled if missing; never dropped. `earned_on` keeps earliest credible server-admissible date. |
| `account_shelf_months` | `(account_id, year_month)` | `admission_kind text CHECK (admission_kind IN ('readerSelected','autoAdmitted'))`, `admitted_on date`, `slot_order smallint` | Max 3 rows per `account_id` enforced in merge transaction. Existing account Shelf rows take precedence on guest-merge conflict. |
| `account_reconciliation_receipts` | `(account_id, idempotency_key)` | `mode text`, `guest_payload_digest text NOT NULL`, `committed_revision bigint NOT NULL`, `outcome_status text NOT NULL`, `created_at timestamptz NOT NULL` | Guarantees exact-once effect for retries after network drop. Returns cached receipt when `(account_id, idempotency_key, guest_payload_digest)` matches; rejects key reuse with a different payload digest (`409 Conflict`). |

---

## 4. Deterministic Per-Field Merge Policies

Let `A` be the existing account state (empty for `newAccountTransfer`) and `G` be the incoming guest state, after validating schema versions, namespace, and applying any explicit editorial `challengeAliases` (`reconcileChallengeAliases` semantics):

### 4.1 Challenge Completions (`completedChallenges`)
- **Identity:** `CanonicalChallengeId` (`cms:<publishedSanityBaseId>`), post-alias resolution.
- **Set merge:** `dom(merged) = valid(A) ∪ valid(G)`.
- **Date policy:**
  - Validate bounds if server context supplies `challengeMinReleaseDate[id]` and/or `maxCredibleDateUtcPlus14`: any date `< releaseFloor` or `> maxCredibleDateUtcPlus14` is **inadmissible** and never accepted as authoritative.
  - When both sides have admissible dates:
    - If equal (`dA === dG`): resolved cleanly to `dA`.
    - If both have `'serverVerified'` provenance: resolved cleanly to `min(dA, dG)`.
    - If one is `'serverVerified'` (`dS`) and one is `'clientReported'` (`dC`):
      - If `dC >= dS`: resolved cleanly to `dS`.
      - If `dC < dS`: **do not let an unverified client clock backdate a server-verified record**. Retain `dS` and emit `UnresolvedReconciliationItem` (`kind: 'completionDateProvenanceConflict'`).
    - If both are `'clientReported'` and `dA !== dG`: emit `UnresolvedReconciliationItem` (`kind: 'undecidableCompletionDateProvenance'`) and retain the conservative fallback (`A`'s date in existing-account merge, or `max(dA, dG)` bounded by server ceiling when symmetric) rather than silently fabricating certainty on the lowest client claim.

### 4.2 In-Progress Reading Positions (`inProgressChallenges`)
- **Mutual exclusion:** If `challengeId ∈ merged.completedChallenges`, omit from `inProgressChallenges` (completed always wins).
- **Single-side presence:** Keep the present record.
- **Collision (`A` and `G` both in-progress, uncompleted):**
  - If `A.screenId === G.screenId`: keep `screenId` and set `updatedOn = max(A.updatedOn, G.updatedOn)`.
  - If `A.screenId !== G.screenId`:
    - Check authoritative `screenOrderByChallenge[challengeId]`.
    - **Authoritative order known and both screens present** (or one is `undefined` initial start while the other is a valid `screenId` in `screenOrder`): select the record with the **greater 0-based screen index** (on exact index tie, `max(updatedOn)`).
    - **Authoritative order missing, or either `screenId` is absent from `screenOrder`:** **NEVER compare `screenId` strings lexicographically** and **NEVER break ties by `updatedOn` timestamp**. Retain `A`'s position conservatively (or `G` if `A` absent) and emit `UnresolvedReconciliationItem` (`kind: 'undecidableReadingPosition'`, capturing both `accountPosition` and `guestPosition`) with overall status `'reconciledWithUnresolved'`.

### 4.3 Saved Challenges (`savedChallenges`)
- **Identity:** `CanonicalChallengeId`, post-alias resolution.
- **Set merge:** `dom(merged) = valid(A) ∪ valid(G)`, keeping `min(A.savedOn, G.savedOn)`.
- **Limitation documented:** Because V2 `ReaderParticipationData` does not carry `unsavedAt` tombstones, an unsave performed offline on one device while another still holds the save is treated conservatively as saved (never silently deleting an un-tombstoned save). Cross-device unsave sync is deferred to a future tombstone-aware R13 sync phase.

### 4.4 Saved Scripture (`savedScriptures`)
- **Identity:** `SavedScriptureKey` (`<normalizedReference>|<normalizedTranslationOrEmpty>`), normalized via `createSavedScriptureKey`.
- **Set merge & deduplication:** Union by `key`. On overlap:
  - `savedOn = min(A.savedOn, G.savedOn)`.
  - Preserve non-undefined `sourceChallengeId` (post-alias resolution); if both differ, prefer the entry with earlier `savedOn`, breaking exact date ties deterministically (`A` in existing-account merge, or lexicographical canonical ID).
  - Preserve display `reference` / `translation` deterministically from the winning metadata record.
- **Ordering:** Sorted deterministically by `(savedOn ASC, key ASC)`, preserving V2's earliest-to-most-recent invariant and guaranteeing set-like commutativity.

### 4.5 Earned Awards (`earnedAwards`), Credible Dates & Independent Flags
- **Identity:** `CanonicalAwardId` (`card:monthly:YYYY-MM:<slug>`), strictly checked against `kind`, `publicationYearMonth`, and `discoveryId` via `parseMonthlyAwardIdParts`.
- **Presence:** Union by `awardId`. Valid awards from either side are never revoked or discarded.
- **Independent presentation flags (Monotonic OR):**
  - `merged.hubAnnouncementAcked = A.hubAnnouncementAcked || G.hubAnnouncementAcked`
  - `merged.cardViewed = A.cardViewed || G.cardViewed`
  - Neither flag implies the other; neither flag can regress from `true` to `false`.
- **Card snapshot & document ID:**
  - Snapshots are validated through `validateEarnedCardSnapshot(card, publicationYearMonth)`.
  - Valid snapshots are never dropped; if one side lacks `earnedCard` (or `cardDocumentId`) and the other has a valid one, backfill it (matching `recordEarnedAwards` in [model.ts](../../src/participation/model.ts)). If both carry valid snapshots, preserve `A`'s snapshot (account-authoritative).
- **Earned date (`earnedOn`) & provenance:**
  - Minimum admissible date floor for any monthly card is `${publicationYearMonth}-01` (or `awardMinEarnDate[awardId]` when CMS slot release dates are known). Maximum admissible ceiling is `maxCredibleDateUtcPlus14` (when supplied).
  - Any date `< floor` or `> ceiling` is rejected as inadmissible (`inadmissibleDateClaim`).
  - Between two admissible dates:
    - Equal dates agree cleanly.
    - Two `'serverVerified'` dates resolve cleanly to `min(dA, dG)`.
    - `'serverVerified'` (`dS`) vs `'clientReported'` (`dC`): if `dC >= dS`, keep `dS` cleanly; if `dC < dS`, keep `dS` and emit `UnresolvedReconciliationItem` (`kind: 'awardDateProvenanceConflict'`).
    - Two disagreeing `'clientReported'` dates (`dA !== dG`): **do not blindly award the lowest client clock claim**. Emit `UnresolvedReconciliationItem` (`kind: 'undecidableAwardDateProvenance'`) and hold a conservative fallback (`A`'s date for existing-account merge, or the later bounded date when symmetric) until server provenance/completion history verifies the earlier date.

### 4.6 Last-Opened Challenge (`lastOpenedChallenge`)
- Validate `challengeId` and resolve aliases.
- If only one side is non-null, keep it.
- If both are non-null: select the pointer with the later `openedOn`. On identical `challengeId` and `openedOn`, preserve `resumeDismissedOn` monotonically (`max` if both present, or whichever is present). On different `challengeId` with identical `openedOn`, prefer `A`.

### 4.7 Future Shelf Selections (`shelf`)
- Maximum `3` distinct `PublicationYearMonth` entries (`'readerSelected' | 'autoAdmitted'`).
- **`newAccountTransfer`:** Guest's valid Shelf selections (up to 3, deduplicated) transfer directly to the new account.
- **`existingAccountMerge`:** If the existing account has a Shelf state (`A.shelf !== undefined`), **`A.shelf` takes full precedence** whenever `G.shelf` conflicts. Any guest Shelf months displaced by `A.shelf` are recorded in `shelfConflicts[]` (`{ guestMonth, disposition: 'preservedInLibraryNotOnShelf' }`), and **all** underlying guest completions, saved Scripture, reading positions, and earned Cards for those months remain 100% preserved in `mergedAccount`.

---

## 5. Server Trust Boundaries, Ownership & Supabase RLS Design

In future live R13 integration, client code (React/Capacitor) is **untrusted** for account identity, editorial eligibility, and authoritative timestamps:

1. **Account Ownership (`auth.uid()`):**
   - The client never chooses `accountId` in a writable payload; the Supabase session JWT (`auth.uid()`) is the sole source of `accountId`.
   - Any payload whose embedded `accountId` disagrees with `auth.uid()` is rejected immediately (`accountOwnershipMismatch`).
2. **Row-Level Security (RLS) Design (Conceptual SQL Policies):**
   - Enable `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on every `account_*` table.
   - Standard policy on user-owned tables:
     - `SELECT / INSERT / UPDATE`: `USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid())` (or restrict direct client writes entirely if reconciliation runs exclusively inside a `SECURITY DEFINER` RPC / Edge Function!).
   - **Recommended write boundary:** Execute `reconcile_guest_participation(...)` inside a single **PostgreSQL `SERIALIZABLE` / `READ COMMITTED` + `SELECT ... FOR UPDATE` RPC** (or Supabase Edge Function calling a transactional SQL function) keyed by `(auth.uid(), idempotency_key)` so multi-table invariants (completed vs. in-progress exclusion, award uniqueness, Shelf 3-slot cap, receipt recording) commit atomically.
3. **Namespace & Identity Isolation:**
   - Server reconciliation enforces `namespace === 'cms'` strictly; any `pilot:*`, `drafts.*`, or forbidden Lab/fixture IDs are rejected/quarantined and never written to production user tables.
4. **Client Date & Award Eligibility Authority:**
   - Client `earnedOn` and `completedOn` values from guest mode carry `dateProvenance: 'clientReported'`.
   - The server stamps `serverNowUtc` bounds (`UTC-12` floor to `UTC+14` ceiling per R08A-0 §4.2) and validates Challenge/Discovery existence & release status against Sanity/Gateway metadata before promoting an award or completion date to `'serverVerified'`.
   - Client-supplied `earnedCard` image URLs must still pass `validateEarnedCardSnapshot` (or be refreshed server-side from the Gateway/CMS card projection); raw passage text and Sanity internal fields are always stripped.
5. **Cross-Account Protection:**
   - Switching accounts on a shared device must never merge Account A's cached account state into Account B. Local guest storage clears only after a verified durable commit receipt for the authenticated `accountId`, and signed-in account caches must be partitioned or wiped on sign-out / user change.

---

## 6. Explicit Unresolved / Typed Outcomes

The pure merge engine (`src/accountSync/reconcile.ts`) **never** masks ambiguity by fabricating certainty:

- **Hard Rejection (`ok: false, status: 'rejected'`):**
  - `unsupportedGuestSchemaVersion`: guest `schemaVersion` is not `1` or `2` (e.g. future `schemaVersion >= 3`).
  - `unsupportedAccountSchemaVersion`: account `schemaVersion !== 1` (e.g. future `schemaVersion >= 2`).
  - `invalidAccountId`: empty, malformed, or prototype-unsafe `accountId`.
  - `accountOwnershipMismatch`: `context.expectedAccountId !== account.accountId`.
  - `crossNamespaceConflict`: guest/account/context namespace mismatch (e.g. `'pilot'` vs `'cms'`).
  - `nonEmptyAccountForNewTransfer`: `mode === 'newAccountTransfer'` invoked against an account that already holds participation data.
  - `invalidGuestEnvelope` / `invalidAccountEnvelope`: non-object or structurally corrupt container shapes.
- **Reconciled With Unresolved Items (`ok: true, status: 'reconciledWithUnresolved'`):**
  - Merge completes safely for all decidable records while returning typed `unresolvedItems[]`:
    - `undecidableReadingPosition`: both sides hold different `screenId`s and `screenOrderByChallenge` is absent or missing one of the screen keys.
    - `awardDateProvenanceConflict`: unverified client `earnedOn` precedes a `'serverVerified'` account `earnedOn`.
    - `undecidableAwardDateProvenance`: two `'clientReported'` award dates disagree without server provenance.
    - `completionDateProvenanceConflict` / `undecidableCompletionDateProvenance`: analogous unresolved completion-date provenance conflicts.
    - `inadmissibleDateClaim`: a claimed date falls before month/Challenge availability or after `maxCredibleDateUtcPlus14`.
  - When `unresolvedItems.length > 0`, `guestClearanceEligible` may remain `true` *only* if the server durably persisted the unresolved conflict record (or `false` if client must retain local candidate evidence until resolved). In the pure contract, `guestClearanceEligible` is `true` only when `ok === true`, `unresolvedItems.length === 0`, **and** no guest records were rejected into `rejectedRecords` (`source === 'guest'`), preventing premature deletion of local evidence when provenance is undecidable or omitted guest records need review!

---

## 7. Adversarial Failure Timelines (9 Scenarios)

| # | Scenario | Failure / Concurrency Sequence | Required System Behavior & Invariant |
| --- | --- | --- | --- |
| **1** | **Network interruption after server commit before client ACK** | Guest signs in → server commits transaction and records `receipt(idempotencyKey)` → TCP connection drops before client receives HTTP `200` → guest storage stays intact → client retries with same `idempotencyKey`. | Server sees matching `(account_id, idempotency_key, guest_payload_digest)` and returns `alreadyCommittedDuplicate` (or re-runs idempotent merge yielding zero diff). No duplicate completions, Scripture, or awards. Guest clears local storage only after receiving the retry ACK. |
| **2** | **Duplicate submission / double-tap login** | User double-taps "Continue with Google" → two concurrent merge requests arrive with identical payload. | Transaction lock + `(account_id, idempotency_key)` uniqueness ensures one commit; second request returns the identical committed revision without duplicating rows or reverting `hubAnnouncementAcked` / `cardViewed`. |
| **3** | **Second device concurrency** | Device A (signed in) finishes Day 5 and views Card 1 (`cardViewed: true`, `hubAnnouncementAcked: false`). Device B (offline guest) finishes Day 6, saves `Romans 8:1`, and also earns Card 1 (`cardViewed: false`, `hubAnnouncementAcked: true`). Device B signs into the same account. | Account holds both Day 5 and Day 6 completions, `Romans 8:1`, and **one** Card 1 with `cardViewed: true` AND `hubAnnouncementAcked: true`, using earliest credible `earnedOn`. Neither device's valid work is overwritten. |
| **4** | **Optimistic Hub announcement & Month Screen card view** | Reader earns Card 2 in Library on guest device, taps it on Month Screen (`cardViewed: true`, `hubAnnouncementAcked: false`), signs into existing account where Card 2 was already earned and announced on Hub (`cardViewed: false`, `hubAnnouncementAcked: true`). | Merged Card 2 has `cardViewed: true` and `hubAnnouncementAcked: true`. Conversely, if neither side had `hubAnnouncementAcked: true`, `cardViewed: true` does **not** set `hubAnnouncementAcked: true` — Hub still delivers its one combined announcement if unacknowledged. |
| **5** | **Interrupted login mid-transfer** | Guest initiates 6-digit email verification or OAuth redirect, closes app mid-flow before token exchange completes. | Zero server account writes occurred; local `bibleberry-reader-participation-v1` guest envelope remains untouched on disk. Reopening app restores full guest state cleanly. |
| **6** | **Local guest mutation during in-flight merge** | Client snapshots guest state (`digest = D1`, Challenges A & B) and starts merge RPC. Before ACK returns, user completes Challenge C locally (`digest = D2`). Server ACKs `D1`. | `canSafelyClearGuestStorage` compares current local digest `D2 !== D1` (`committedGuestDigest`), **refuses** blind `clearLocalData()`, preserves Challenge C, and schedules a follow-up sync for C. |
| **7** | **Unsupported future schema version** | App downgrades or shared backup restores a payload with `schemaVersion: 3` (guest) or `schemaVersion: 2` (account) unknown to current client/engine. | Reconciliation fails closed with `status: 'rejected'`, `reason: 'unsupportedGuestSchemaVersion'` (or `'unsupportedAccountSchemaVersion'`), leaves stored data untouched (`guestClearanceEligible: false`), and never coerces unknown fields. |
| **8** | **Cross-namespace / forged account ID / backdated clock** | Untrusted payload contains `pilot:sample-1`, `drafts.challenge-x`, `accountId` mismatching `auth.uid()`, or `earnedOn: "1999-01-01"` for a `2026-11` card. | Envelope-level mismatch rejects immediately (`crossNamespaceConflict` / `accountOwnershipMismatch`). Record-level `pilot:` / `drafts.` entries are quarantined into `rejectedRecords[]` and never admitted. Out-of-bounds `1999-01-01` date is rejected as `inadmissibleDateClaim`, never lowering `earnedOn`. |
| **9** | **Conflicting Shelf + guest completions for evicted month** | Account Shelf holds `[2026-08, 2026-09, 2026-10]` (all `readerSelected`). Guest Shelf holds `[2026-07]` plus 4 completed Challenges and 1 earned Card in `2026-07`. | Merged account keeps Shelf `[2026-08, 2026-09, 2026-10]`; emits `shelfConflicts` notice for `2026-07`; **preserves** all 4 `2026-07` completions and the `2026-07` earned Card in the account's Library/Field Notebook. |

---

## 8. Narrow Staged Implementation Sequence for Future R13 Work

Aligned with Phase 05 (and parallel R13 contract preparation) in the [single canonical roadmap](../product/application-development-roadmap.md) — **not** an authorization to implement any stage below without separate scoped Issues and owner approval:

1. **R13-0 (This Assignment):** Pure reconciliation contract (`docs/architecture/r13-0-account-reconciliation-contract.md`) + pure platform-neutral merge engine (`src/accountSync/**`) + adversarial unit tests (`tests/sanity/accountSyncReconciliation.test.ts`).
2. **R13-1 (Supabase Schema, RLS & Transactional Merge RPC):** Provision relational `account_*` tables, RLS policies, and `reconcile_guest_participation` RPC with `account_reconciliation_receipts` idempotency and server clock bounds (`Option 1C` / `UTC+14`).
3. **R13-2 (Auth Session & Identity Linking Foundation):** Supabase Auth integration (Google, Apple, 6-digit passwordless email OTP), native deep-link callback handling, and strict account-change cache isolation (no silent cross-account mixing).
4. **R13-3 (Account Participation Driver & Guest-to-Account Transfer Wiring):** Wire `ReaderParticipationStore` sync adapter, authoritative screen-order lookup for unresolved reading-position ties, verified-commit-only guest clearance (`canSafelyClearGuestStorage`), and gentle non-teaching-interrupting sign-in prompts.
5. **R13-4 (Shelf Synchronization & Live Multi-Device Acceptance):** Integrate `account_shelf_months` with Phase 05 Shelf/Library UI and run two-device + crash/retry E2E verification.
