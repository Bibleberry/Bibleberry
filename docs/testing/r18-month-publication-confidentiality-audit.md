# R18 / R08A: Offline Monthly Publication Confidentiality Audit

**Issue:** [#187](https://github.com/Bibleberry/Bibleberry/issues/187)  
**Branch:** `feat/r18-month-publication-audit`  
**Contract Authority:** [R08A-0 Revision 2](../architecture/r08a-0-monthly-publication-release-contract.md), [November 8 Approved Reader Experience](../product/2026-11-08-approved-reader-experience-and-month-screen.md), [Canonical Roadmap Phases 01–04](../product/application-development-roadmap.md)

> [!NOTE]
> This is an **offline, repeatable quality and confidentiality audit utility** using synthetic fixtures and the approved gateway projection modules (`src/gateway/monthlyProjection.ts`, `src/gateway/projection.ts`, `src/gateway/localRelease.ts`, `src/gateway/handler.ts`). It is **not** a replacement for actual Cloudflare Worker gateway security controls and **never** performs live environment scans or network calls.

---

## 1. Owned Files

- `scripts/releaseAudit/types.ts` — Audit contract IDs, report/finding types, and fixture bundle interfaces
- `scripts/releaseAudit/redaction.ts` — Secret/embargoed sentinel redaction and leak-marker scanner
- `scripts/releaseAudit/fixtures.ts` — Synthetic audit fixture bundle (built on `src/gateway/fixtures/r08aMonthlyFixtures.ts` with injected confidentiality sentinels) and `validateAuditFixtureBundle`
- `scripts/releaseAudit/auditor.ts` — `runMonthlyPublicationAudit()` executing all 15 confidentiality and release-authority checks offline
- `scripts/releaseAudit/reporter.ts` — Concise machine-readable JSON (`formatAuditReportJson`) and human-readable (`formatAuditReportHuman`) reporters
- `scripts/releaseAudit/cli.ts` — CLI entrypoint supporting `--format human|json|both`
- `tests/releaseAudit/monthlyPublicationAudit.test.ts` — Focused unit and negative-detection tests

---

## 2. How to Run

### Run the Offline Audit CLI

```bash
# Human-readable + machine-readable JSON report (default)
node --experimental-strip-types scripts/releaseAudit/cli.ts

# Human-readable summary only
node --experimental-strip-types scripts/releaseAudit/cli.ts --format human

# Machine-readable JSON report only
node --experimental-strip-types scripts/releaseAudit/cli.ts --format json
```

Exit code is `0` when all 15 checks pass (`report.ok === true`) and `1` if any check fails, fixtures are invalid, or authorization context is missing.

### Run Focused Audit Tests

```bash
node --experimental-strip-types --test tests/releaseAudit/*.test.ts
```

---

## 3. Audited Contracts (15 Checks)

| Check ID | Contract ID | What It Verifies |
| --- | --- | --- |
| `auth-context` | `AUTHORIZATION_CONTEXT_REQUIRED` | Fails closed if `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_READ_TOKEN`, or `serverNowUtc` is missing/invalid. |
| `fixture-integrity` | `FIXTURE_INTEGRITY_VALIDATION` | Fails closed if the synthetic fixture bundle is missing required documents or markers. |
| `advance-preview-allowlist` | `ADVANCE_PREVIEW_ALLOWLIST` | Advance preview exposes only theme/intro subset (`previewScreens`), dates, and permitted future titles; strips `welcomeScreen`, `discoveries`, `fullMonthCard`, `slug`, `challengeId`, and bodies. |
| `embargoed-challenge-body` | `EMBARGOED_CHALLENGE_BODY_LEAK` | Future-dated Challenge endpoints return `404` and catalog excludes unreleased Challenges without body/passage leakage. |
| `hidden-discovery-mappings` | `HIDDEN_DISCOVERY_MAPPING_LEAK` | Month detail and progress strip `qualifyingChallenges`/`qualifyingChallengeIds` and ignore unreleased Challenge IDs in `POST /progress`. |
| `unrewarded-card-artwork` | `UNREWARDED_CARD_ARTWORK_LEAK` | Unearned discoveries expose title and numeric progress only; `earnedCard` URL, alt text, and transcriptions are withheld. |
| `unauthorized-asset-references` | `UNAUTHORIZED_ASSET_REFERENCE_LEAK` | Non-Sanity/unauthorized asset URLs are stripped and unconfirmed Scripture rights fail closed (`404`). |
| `private-participation-data` | `PRIVATE_PARTICIPATION_LEAK` | Internal editorial notes and private participation fields (`completedByUserIds`, `readerEmail`) are stripped across all reader projections. |
| `month-phase-lifecycle` | `MONTH_PHASE_LIFECYCLE` | Active vs. historical month transitions, upcoming month `404` before `YYYY-MM-01`, and Library historical-only filtering. |
| `february-preview-timing` | `FEBRUARY_PREVIEW_TIMING` | Both 28-day (`2098-02`) and 29-day leap (`2096-02`) February advance previews and preview News unlock strictly on Feb 27; ordinary months on the preceding 28th. |
| `withdrawal-unavailable-state` | `WITHDRAWAL_AND_UNAVAILABLE_STATE` | Option 4A immediate and v2-amended Day 18 withdrawals project as `unavailable` without leaking retracted content and preserve `29/29` full-month completion. |
| `direct-slug-guess` | `DIRECT_SLUG_GUESS_PROTECTION` | Embargoed slug probes return byte-identical neutral `404` responses with `Cache-Control: no-store`. |
| `timezone-fallback-and-ceiling` | `TIMEZONE_AUTHORIZATION_FALLBACK` | Blank, offset, oversized, and invalid `X-Bibleberry-Timezone` values fall back to `America/New_York`; client `Date`/query spoofs are ignored; `UTC+14` ceiling holds. |
| `unpublished-content-exclusion` | `UNPUBLISHED_CONTENT_EXCLUSION` | Draft (`drafts.*`), unreviewed (`adaptationReviewed: false`), and unapproved-block (`unapprovedBlockCount > 0`) Challenges fail closed (`404`). |
| `unauthorized-projection-fail-closed` | `UNAUTHORIZED_PROJECTION_FAIL_CLOSED` | Duplicate intra-month slots, foreign-month slots, and missing `SANITY_READ_TOKEN` fail closed (`404` / `500`). |

---

## 4. Log & Redaction Safety

`scripts/releaseAudit/redaction.ts` ensures that sentinel tokens, embargoed manuscript strings, and `SANITY_READ_TOKEN` values are never echoed into human-readable or JSON reports, even when a regression test intentionally triggers a failure.

---

## 5. Remaining Limitations

- **Offline synthetic scope only:** Uses in-memory synthetic fixtures and an offline mock `GatewayFetch`; it does not inspect live Sanity `staging`/`production` datasets or deployed Cloudflare Workers.
- **No CI workflow wiring:** Per assignment boundaries, `.github/workflows/**` and `package.json` were not modified; run via the Node commands above.
