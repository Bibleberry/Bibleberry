# R14-3: Durable Guest Earned Scripture Card Records & V1→V2 Migration

**Issue:** `#101` (`R14-3` / Phase 04)  
**Baseline `main`:** `633bc77`  
**Scope:** Guest participation types, canonical award identities, pure gateway progress admission & selectors, monotonic store reducers, lossless V1→V2 persistence migration, and regression tests (`src/participation/{types,identity,awards,model,persistence,store}.ts`, `tests/participation/**`, `tests/sanity/**`, `tests/smoke/participation-pilot.spec.ts`, and this document).

---

## 1. Domain Model & Canonical Identity Contract

- **Extended `ReaderParticipationData` ([`src/participation/types.ts`](../../src/participation/types.ts)):**
  - Adds `earnedAwards: Readonly<Record<string, EarnedAwardRecord>>` alongside unchanged `completedChallenges`, `inProgressChallenges`, `savedChallenges`, `savedScriptures`, and `lastOpenedChallenge`.
  - Canonical monthly award IDs are strictly:
    - `card:monthly:YYYY-MM:<discovery-slug>` (`kind: 'thematic'`)
    - `card:monthly:YYYY-MM:full-month` (`kind: 'fullMonth'`)
  - Malformed IDs, invalid calendar months (`YYYY-MM`), invalid slugs, unexpected namespaces (e.g. `card:foundation:...`, `cms:...`, `pilot:...`), and prototype/lab aliases (`pilot-*`, `lab-*`, `prototype-*`, `fixture-*`, `sanity-lab*`, `sanity-fixture*`, `weekly-pilot-*`, `interactive-challenge-lab`, `nov-1..5`) are rejected.
  - Editorial `cardDocumentId` (`card-<slug>`, no `drafts.`) is stored separately from `awardId`.
  - Each `EarnedAwardRecord` stores `earnedOn` (`YYYY-MM-DD`, immutable first valid observed earning date), distinct monotonic flags `hubAnnouncementAcked` and `cardViewed` (both default `false`, strictly independent), optional `cardDocumentId`, and optional `earnedCard` (`EarnedScriptureCardSnapshot`).

- **Display Snapshot Validation & Non-Loss Policy ([`src/participation/awards.ts`](../../src/participation/awards.ts), [`src/participation/model.ts`](../../src/participation/model.ts)):**
  - `validateEarnedCardSnapshot` enforces the R14-2 `GatewayEarnedScriptureCard` allowlist: HTTPS `cdn.sanity.io/images/...` URL (no credentials, query, or fragment), valid `cardDocumentId`, matching `publicationYearMonth`, valid `assetRevision`, non-empty and distinct `illustrationAlt` and `accessibleTranscription`, `scripture` (`book`, `reference`, `translation`), `attribution`, `rightsStatus`, `shareEligible`, and optional deduplicated `theologicalThemes` / `keywords`.
  - Any unapproved fields (e.g. Bible passage `passage` text or raw Sanity internals) are stripped.
  - An award can be earned even when `earnedCard` is absent or fails validation (`earnedCard` is omitted without fabricating a Card).
  - **Snapshot revision policy (deferred for owner approval):** Repeated earning never drops an already-captured valid `earnedCard` when a later response omits or invalidates it, and backfills `earnedCard` only when previously absent. Silently overwriting an already-captured valid `earnedCard` snapshot when editorial/asset metadata is revised is **deferred pending owner product approval** (preserving the first valid captured keepsake deterministically).

---

## 2. Gateway Admission & Combined Progress Selectors

- **`admitGatewayMonthProgressAwards` ([`src/participation/awards.ts`](../../src/participation/awards.ts)):**
  - Accepts only `ok: true` responses with valid `monthId` (`YYYY-MM`), valid `serverContext.authorizedLocalDate` (`YYYY-MM-DD`), and `discoveries[]` entries where `isEarned === true`, `kind` matches `discoveryId` and `awardId` (`fullMonth` ↔ `full-month`), and `awardId` / `discoveryId` belong to `response.monthId`.
  - Deduplicates repeated discovery/award entries within the same response.
  - Uses `serverContext.authorizedLocalDate` directly as `earnedOn` (never `Date.now()`, Challenge `releaseAt`, or `publicationYearMonth` inference), preserving distinction between `publicationYearMonth` and `earnedOn` for historical months.
- **`combineGatewayProgressWithStoredAwards` ([`src/participation/awards.ts`](../../src/participation/awards.ts)):**
  - Computes `effectiveEarned = gatewayDiscovery.isEarned || hasStoredAward(awardId)` so stateless gateway recomputation (`isEarned: false` due to history, roster amendment, or emergency withdrawal) never revokes a stored award.
  - Never leaks `awardId`, `earnedOn`, `cardDocumentId`, or `earnedCard` for unearned discoveries (`effectiveEarned: false`).
  - Reports `hasCardDisplay: false` when an earned award has no valid display snapshot, without fabricating artwork.

---

## 3. In-Place, Lossless V1→V2 Persistence Migration

- **Storage key & drivers preserved:** Continues using `bibleberry-reader-participation-v1` (stable storage key, not a schema indicator) through `KeyValueStorageDriver` (`createWebLocalStorageDriver` and `createCapacitorPreferencesDriver`), `createEnvelopePersistenceAdapter`, and `createReaderParticipationStore`.
- **Read-preserving migration on first write ([`src/participation/persistence.ts`](../../src/participation/persistence.ts)):**
  - `parseParticipationEnvelope` accepts both `GuestParticipationEnvelopeV1` (`schemaVersion: 1`, migrating in memory with `earnedAwards: {}` and preserving all completions, resume pointers, saved Challenges, and saved Scripture) and `GuestParticipationEnvelopeV2` (`schemaVersion: 2`).
  - Reading a V1 envelope does **not** mutate storage. Migration to `GuestParticipationEnvelopeV2` (`schemaVersion: 2`) happens atomically on the first successful `flushCommands` write (`driver.setItem`).
  - If the migration write fails (`writeFailed` / `storageUnavailable`), the original V1 payload remains intact on disk (no partial V2), pending commands remain queued for retry, and a cold restart continues reading V1 cleanly.
- **Fail-closed protection:** Unknown future schemas (`schemaVersion >= 3` → `unsupportedNewerSchema`), corrupt JSON, structurally invalid V2 envelopes (e.g. non-object `earnedAwards`), and driver read errors (`storageUnavailable`) are never overwritten by normal commands; only explicit user `clearLocalData()` removes stored data.

---

## 4. Trust Boundary & Non-Scope

- **Local guest persistence only:** `POST /api/months/:yearMonth/progress` remains stateless and caller-supplied `completedChallengeIds`-based; `GuestParticipationEnvelopeV2` records local guest accomplishments without cryptographic proof or server-side account authority.
- **Account-authoritative sync deferred to R13:** Multi-device recovery, signed-in conflict resolution, and server-verified award issuance belong to the separate R13 Account Participation & Sync Service (`#70`).
- **UI & Finish wiring deferred:** Challenge Finish-to-progress wiring, Month Screen earned-card viewer, Field Notebook UI, and Hub combined announcements remain separate follow-on work.
