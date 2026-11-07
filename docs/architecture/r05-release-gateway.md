# Architecture: Secure CMS Release Gateway (Milestone R05)

**Status:** Approved for Stage 1 Core Implementation  
**Review Status:** Reviewed and accepted by ChatGPT; authorized by Aaron Waid  
**Primary Implementation Agent:** Gemini Flash  
**Parent Roadmap Milestone:** R05 (Secure server-enforced scheduled release)  
**Parent Issue:** [#25](https://github.com/ContraPhilosophy/Bibleberry/issues/25)  

---

## 1. Overview and Purpose

Bibleberry requires a server-enforced content release gateway to support an advance editorial pipeline (roughly 30 days of queued teaching; minimum 14 days) while ensuring readers receive each Challenge only on or after its intended release date.

In Milestone A4.1, client-side release gating verified that the ordinary reader app shell does not render unreleased or unreviewed Challenges. However, client-side gating controls only presentation; because public dataset queries can be inspected in browser network tooling, client gating cannot provide source confidentiality or true embargo protection.

Milestone R05 introduces a **server-authoritative Cloudflare Worker content gateway** that sits between reader clients and a private Sanity dataset. The gateway:
1. Retains server-side read credentials (`SANITY_READ_TOKEN`), ensuring no private tokens ever reach client code.
2. Evaluates release eligibility and editorial review authoritatively on the server using UTC timestamps.
3. Excludes future-scheduled, unreviewed, or withdrawn Challenges entirely from network responses (zero manuscript leakage).
4. Projects and sanitizes payloads, stripping internal review notes, provenance, and draft artifacts.
5. Preserves canonical Challenge identities (`cms:<documentId>`) and screen keys (`_key`) to ensure 100% compatibility with the existing `ChallengePlayer` and A3 guest participation system.

---

## 2. Gateway Endpoints and HTTP Contract

The gateway is a stateless, read-only Cloudflare Worker-compatible request handler accepting only `GET` and `OPTIONS` requests:

- `GET /api/challenges`:
  - Returns a lightweight array of summary records for all published Challenges that are currently released (i.e. `releaseAt <= now`) and editorially reviewed (`adaptationReviewed === true`).
  - Used for catalog indexes, discovery, and availability lists.
  - Future-scheduled, unreviewed, or withdrawn Challenges are strictly omitted from the array.

- `GET /api/challenges/:slug`:
  - Returns the complete reader-safe document for the single Challenge matching `:slug`.
  - If the Challenge exists but is future-scheduled (`releaseAt > now`), unreviewed (`adaptationReviewed !== true`), or missing, the gateway returns `404 Not Found`.
  - Public-facing unavailable responses are deliberately indistinguishable to prevent leaking whether an unreleased slug exists.
  - Response body on 404:
    ```json
    {
      "ok": false,
      "error": {
        "kind": "notFound",
        "message": "Challenge not found"
      }
    }
    ```

- `OPTIONS`:
  - Handles CORS preflight requests with appropriate allow headers.

- Unsupported Methods (`POST`, `PUT`, `DELETE`, `PATCH`):
  - Returns `405 Method Not Allowed` with `Allow: GET, OPTIONS`.

- Unrecognized Paths:
  - Returns `404 Not Found`.

---

## 3. Server-Enforced Release Eligibility and GROQ Queries

### 3.1 Authoritative Server Clock
The gateway computes the current UTC instant on the server:
```ts
const nowUtc = new Date().toISOString()
```
Client-supplied headers (e.g. `Date`, client query parameters) are ignored for release gating.

### 3.2 Parameterized GROQ Queries
Queries are parameterized to prevent injection and ensure server-side filtering:

**Catalog Query (`GET /api/challenges`):**
```groq
*[_type == "challenge"
  && !(_id in path("drafts.**"))
  && editorialReview.adaptationReviewed == true
  && defined(releaseAt)
  && dateTime(releaseAt) <= dateTime($nowUtc)
  && count(screens[].blocks[_type in ["comparisonBlock", "visualCardsBlock", "connectedSequenceBlock", "reflectionBlock", "optionalStudyBlock"] && reviewStatus != "approved"]) == 0
] | order(releaseAt asc) {
  _id,
  _type,
  title,
  "slug": slug.current,
  challengeType,
  "series": series->{
    _id,
    title,
    "slug": slug.current
  },
  sequence,
  releaseAt,
  summary,
  primaryScripture{
    reference,
    translation,
    textStatus,
    passage,
    usageRightsConfirmed,
    practiceStatus
  },
  "editorialEligibility": {
    "adaptationReviewed": editorialReview.adaptationReviewed,
    "reviewedAt": editorialReview.reviewedAt
  },
  "unapprovedBlockCount": count(screens[].blocks[_type in ["comparisonBlock", "visualCardsBlock", "connectedSequenceBlock", "reflectionBlock", "optionalStudyBlock"] && reviewStatus != "approved"])
}
```

**Single Challenge Query (`GET /api/challenges/:slug`):**
```groq
*[_type == "challenge"
  && !(_id in path("drafts.**"))
  && slug.current == $slug
  && editorialReview.adaptationReviewed == true
  && defined(releaseAt)
  && dateTime(releaseAt) <= dateTime($nowUtc)
  && count(screens[].blocks[_type in ["comparisonBlock", "visualCardsBlock", "connectedSequenceBlock", "reflectionBlock", "optionalStudyBlock"] && reviewStatus != "approved"]) == 0
][0] {
  _id,
  _type,
  title,
  "slug": slug.current,
  challengeType,
  "series": series->{
    _id,
    title,
    "slug": slug.current
  },
  sequence,
  releaseAt,
  summary,
  primaryScripture{
    reference,
    translation,
    textStatus,
    passage,
    usageRightsConfirmed,
    practiceStatus
  },
  "screens": screens[]{
    _key,
    _type,
    screenLabel,
    heading,
    "blocks": blocks[]{
      _key,
      _type,
      scripture{
        reference,
        translation,
        textStatus,
        passage,
        usageRightsConfirmed,
        practiceStatus
      },
      body,
      text,
      label,
      left{title, body},
      right{title, body},
      footer,
      cards[]{_key, _type, title, body},
      steps[]{_key, _type, title, body},
      cycle,
      returnCaption,
      conclusion,
      question,
      choices[]{_key, _type, label, prompt},
      closing,
      title,
      scriptures[]{
        _key,
        _type,
        reference,
        translation,
        textStatus,
        passage,
        usageRightsConfirmed,
        practiceStatus
      },
      paragraphs,
      reviewStatus
    }
  },
  "companionLinks": companionLinks[]{
    _key,
    _type,
    provider,
    label,
    description,
    url,
    availability
  },
  "editorialEligibility": {
    "adaptationReviewed": editorialReview.adaptationReviewed,
    "reviewedAt": editorialReview.reviewedAt
  }
}
```

### 3.3 Server-Side Post-Validation and Deep Allowlist Projection
Before returning any payload to the client, the gateway performs secondary validation and recursive field allowlisting:
1. Re-verifies `editorialEligibility.adaptationReviewed === true`.
2. Re-verifies `Date.parse(releaseAt) <= Date.now()`.
3. Verifies that all structured editorial blocks requiring review (`comparisonBlock`, `visualCardsBlock`, `connectedSequenceBlock`, `reflectionBlock`, `optionalStudyBlock`) have `reviewStatus === 'approved'`. If any unapproved block is present (or `unapprovedBlockCount > 0`), the Challenge fails closed.
4. Enforces a strict, deep allowlist across every nesting level (series, scriptures, screens, blocks, portable text, companion links). Any unexpected upstream fields (e.g. injected accounting codes, confidential reviewer notes, internal flags, `_rev`, `_system`, or `importProvenance`) are dropped during projection.

---

## 4. Stage 1 Caching Specification

For **Stage 1**, all successful content responses and error responses return:
```http
Cache-Control: no-store
```
- **Rationale:** Prevents caching of embargo boundaries during initial integration, eliminates stale-release risk, and simplifies testing. Stale-while-revalidate and fixed-window caching are deliberately omitted in Stage 1.
- **Future Caching Considerations (Post-Stage 1):**
  - Edge caching with short TTL (e.g. `s-maxage=60`) bounded by `Math.min(60, secondsToNextRelease)`.
  - Immediate withdrawal mechanism via Sanity webhook or Cloudflare API purge on unpublish/edit.
  - Upstream query caching (Cloudflare KV or cache API).

---

## 5. Private-Dataset Testing Considerations

- **Sanity Behavior Correction:** An unauthenticated request to a private Sanity dataset does **not** necessarily return HTTP 401 or 403; Sanity documents that private dataset reads without a token or with insufficient permissions may return HTTP 200 with an empty `result: []` array.
- **Stage 1 Testing Strategy:** Stage 1 tests rely on deterministic, mock upstream responses simulating:
  - Valid token with released documents.
  - Valid token with future-scheduled documents.
  - Token authentication failures / upstream HTTP errors (401, 403, 500, 503).
  - Empty results.
  - Upstream network errors and malformed JSON payloads.
- Testing against the live private dataset is deferred to the authorized infrastructure stage (Stage 3).

---

## 6. Compatibility and Stage 2 Integration Contract

### 6.1 Data Contract and Identity Preservation
The gateway output conforms to the foundational data contract established in Milestone B1 (`src/cms/sanity/`):
- `_id` is preserved as the canonical Sanity document ID.
- `slug` is preserved as the reader presentation slug.
- `screens[]._key` is preserved for screen/step identity.
- Field values for scripture, blocks, and series are mapped cleanly to the reader domain types.
- Durable participation storage keys remain strictly `cms:<documentId>` in `bibleberry-reader-participation-v1`, with unforgeable capability tokens minted by `admitReleasedCmsChallenge`.

### 6.2 Catalog vs. Detail Integration Contract (Stage 2 Integration Clarification)
An important architectural distinction exists between the gateway's catalog endpoint and the existing A4.1 reader provider:
- `GET /api/challenges` returns **lightweight catalog summaries** (`GatewayCatalogSummary`), omitting `screens` and manuscript blocks to minimize payload size and eliminate any possibility of manuscript leakage during catalog indexing.
- Because `mapPublishedChallengeBatch` expects full Challenge documents containing `screens`, the catalog index response cannot be piped directly into `mapPublishedChallengeBatch` without adaptational plumbing.
- **Stage 2 Implementation Strategy:**
  1. The Stage 2 gateway catalog provider (`createGatewayCatalogProvider`) will decouple catalog availability discovery from full challenge rendering:
     - Catalog queries (`GET /api/challenges`) populate available listings.
     - Single Challenge detail queries (`GET /api/challenges/:slug`) fetch the complete reader-safe document containing `screens` and `blocks` when the reader navigates to `#/challenge/:slug`.
  2. Alternatively, the reader catalog provider interface will be extended to support lazy loading of individual challenge screens upon navigation.
- **Stage 1 Boundary:** A4.1's shipped `defaultPublishedCatalogProvider` in `src/cms/reader/catalogProvider.ts` remains completely untouched during Stage 1. No reader application code or routes are modified in this milestone.

### 6.3 Stage 2A Ordinary Reader Detail Integration
In Milestone R05 Stage 2A, the ordinary reader Challenge route (`#/challenge/:slug`) is connected to the secure release gateway via `ChallengeDetailProvider`:
1. **Detail Provider Boundary (`src/cms/reader/challengeDetailProvider.ts`):**
   - Connects to `GET /api/challenges/:slug` via same-origin relative path or configured `VITE_RELEASE_GATEWAY_ORIGIN`.
   - Validates gateway response envelopes and runs documents through `mapPublishedChallenge()`.
   - Maps 404 responses to a neutral `{ status: 'notFound' }` state without manuscript leakage.
   - Maps 500/502 and network failures to `{ status: 'requestError' }` with recoverable retry.
   - Fails closed on malformed JSON or invalid schema with `{ status: 'validationError' }`.
2. **Build-Time Gateway Feature Flag:**
   - Active when `VITE_ENABLE_RELEASE_GATEWAY_SOURCE === 'true'`.
   - When gateway mode is active, `ReleasedChallengeHost` consumes `defaultGatewayChallengeProvider` and **never silently falls back to direct Sanity reads**.
   - When gateway mode is inactive, `ReleasedChallengeHost` uses `adaptCatalogProviderToDetailProvider(defaultPublishedCatalogProvider)`, preserving full backward compatibility for A4.1 regression testing.
3. **Stale Response and Slug Cancellation:**
   - `useEffect` in `ReleasedChallengeHost` tracks `slug`, triggers `AbortController.abort()` on slug changes, resets state to loading, and ignores stale promises.
   - `deriveReleasedChallengeDetailState` validates `challenge.id === slug` before admitting.
4. **Participation Preservation:**
   - Capability admission (`admitTrustedCatalogChallenge` on the gateway path, `admitReleasedCmsChallenge` on the catalog path) and `PersistedChallengeHost` continue to store durable records under canonical `cms:<documentId>`.
5. **Release Clock Authority Distinction:**
   - **Gateway Source (`source: 'gateway'`): Server-Authoritative Release Gate.** When the Cloudflare Worker responds with HTTP 200, the server's evaluated release schedule is authoritative. The client verifies document mapping, slug match, editorial review confirmation (`adaptationReviewed === true`), release timestamp syntax, and mints capability admission via `admitTrustedCatalogChallenge(challenge)`. A desynchronized or incorrectly set client device clock (e.g. running slow/behind `releaseAtUtc`) cannot veto or delay server-authorized releases.
   - **Legacy Catalog Source (`source: 'catalog'`): Client-Authoritative Release Gate.** Direct Sanity catalog reads bypass the Worker gateway and continue to evaluate `evaluateChallengeReleaseEligibility(challenge, now)` and `admitReleasedCmsChallenge(challenge, now)` against client device time. Arbitrary catalog results cannot bypass the client release gate.

### 6.4 Stage 2B1 Released Challenge Catalog Provider Specification
In Milestone R05 Stage 2B1, the reader-facing catalog data boundary for `GET /api/challenges` is established via `ReleasedCatalogProvider` (`src/cms/reader/releasedCatalogProvider.ts`):
1. **Catalog Provider Boundary (`createGatewayCatalogProvider`):**
   - Connects to `GET /api/challenges` using same-origin relative path or configured `VITE_RELEASE_GATEWAY_ORIGIN` / `VITE_GATEWAY_ORIGIN`.
   - Supports injectable `fetchImpl`, configured origin, same-origin fallback, and `AbortSignal` cancellation.
   - Kept distinct from the A4.1 `ChallengeCatalogProvider` to decouple lightweight catalog summaries from complete `CmsChallenge` screen trees.
2. **Typed Catalog Summary Contract (`ReleasedCatalogSummary`):**
   - Strictly projects discovery-safe fields only: `id` (slug), `slug`, `documentId` (canonical Sanity document ID), `title`, `summary`, `challengeType`, `sequence`, `releaseAt`, `releaseAtUtc`, `series` (`documentId`, `id`, `title`), and `primaryScripture` (`id`, `reference`, `translation`, `textStatus`, `practiceStatus`, `usageRightsConfirmed`, `passage`).
   - Deep allowlist projection excludes private editorial artifacts, `screens`, `blocks`, `unapprovedBlockCount`, `_type`, `_rev`, and `importProvenance`.
3. **Explicit Result States:**
   - `{ status: 'ready', challenges, source: 'gateway' }`: fully validated catalog summary list.
   - `{ status: 'empty', source: 'gateway' }`: valid empty catalog response.
   - `{ status: 'requestError', message, source: 'gateway' }`: HTTP 4xx/5xx errors or network fetch failure.
   - `{ status: 'validationError', message, issues, source: 'gateway' }`: malformed JSON, invalid response envelope, or schema validation failures (fails closed without partial leakage).
4. **Validation and Identity Safety:**
   - Enforces non-draft document ID (`_id` must not start with `drafts.`).
   - Detects and rejects duplicate document IDs or duplicate slugs across the catalog.
   - Validates explicit UTC offset and timestamp syntax; validates primary Scripture rights and text status invariants.
   - Never falls back to direct Sanity queries when gateway calls fail.
5. **Server-Authoritative Release Eligibility:**
   - No client-clock embargo check is performed by the catalog provider. The secure gateway's evaluated release schedule is authoritative.
6. **Detail-Reader and Participation Integration:**
   - Provides `loadChallengeDetailForSummary(summary, detailProvider)` enabling a selected summary's slug to be resolved through the existing `ChallengeDetailProvider`.
   - Full Challenge documents (with screens and blocks) are loaded only upon explicit selection.
   - Preserves canonical `cms:<documentId>` participation identity and capability token admission (`admitTrustedCatalogChallenge`).
