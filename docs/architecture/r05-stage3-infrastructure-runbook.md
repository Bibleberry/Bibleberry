# Infrastructure Runbook: Secure Release Gateway Deployment & Sanity Integration (Milestone R05 Stage 3)

**Document:** `docs/architecture/r05-stage3-infrastructure-runbook.md`  
**Status:** Preflight Infrastructure Runbook (Stage 3A local verification complete; reviewed by ChatGPT)  
**Primary Implementation Agent:** Gemini Flash  
**Review Agent:** ChatGPT (independent review completed on PR #55)  
**Acceptance Authority:** Aaron Waid  
**Theological/Editorial Authority:** Alexis Waid  
**Parent Roadmap Milestone:** R05 (Secure server-enforced scheduled release)  
**Parent Issue:** [#25](https://github.com/ContraPhilosophy/Bibleberry/issues/25)  
**Governing Protocols:** `docs/ai-development-protocol.md`, `docs/architecture/r05-release-gateway.md`

---

## 1. Executive Summary & Purpose

Bibleberry requires a server-authoritative release gateway to maintain an advance editorial pipeline (target: 30 days of queued teaching; minimum: 14 days) while guaranteeing readers receive each Challenge only on or after its intended release date.

Client-side gating (Milestone A4.1) verified that the ordinary reader app shell does not render unreleased or unreviewed Challenges. However, client-side gating only controls UI presentation. If reader clients communicate directly with a public Sanity dataset, raw manuscripts can be queried via browser developer tools or direct HTTP requests, defeating advance embargoes and manuscript confidentiality.

Milestone R05 introduces a **server-authoritative Cloudflare Worker content gateway** positioned between reader clients and a private Sanity dataset. The gateway:
1. Retains upstream read credentials (`SANITY_READ_TOKEN`) strictly on the server in Cloudflare Worker secrets.
2. Evaluates release eligibility and editorial review authoritatively on the server using UTC timestamps.
3. Completely excludes future-scheduled, unreviewed, or withdrawn Challenges from responses (zero manuscript leakage).
4. Recursively projects reader-safe fields only, stripping internal review notes, provenance, and draft artifacts.
5. Emits `Cache-Control: no-store` on all responses to prevent premature edge/client caching across release boundaries.
6. Preserves canonical Challenge identities (`cms:<documentId>`) and screen keys (`_key`) to remain 100% compatible with the guest participation system (`bibleberry-reader-participation-v1`).

This preflight runbook documents the current deployment architecture, the proposed staging arrangement, environment variable contracts, Sanity dataset requirements, verification procedures, rollback plans, and exact decisions requiring Aaron's explicit authorization.

---

## 2. Architecture: Verified Facts vs. Account-Level Assumptions

To maintain engineering discipline and prevent false claims, this section clearly distinguishes independently verified repository facts from assumptions requiring live account inspection.

### 2.1 Verified Facts (From Repository Source & Merged Main)

1. **Static Worker Baseline:** The existing repository configuration in `wrangler.jsonc` defines:
   - Worker name: `bibleberry-lab`
   - Compatibility date: `2026-11-01`
   - Assets directory: `./dist`
   - Not found handling: `single-page-application`
   - No `main` entrypoint is specified; it currently acts as a pure static asset service.
2. **Deployed Lab Host:** `bibleberry-lab.aw-e44.workers.dev` is the active testing host under Issue #21. Verified Cloudflare account subdomain is `aw-e44`.
3. **Sanity Studio:** Deployed at `bibleberry-editor.sanity.studio`, targeting Sanity project ID `80016lrq` and dataset `production`.
4. **Sanity Dataset Visibility:** The `production` dataset was established as public during Milestones B1–B3, containing initial test documents and the verified November 3 test Challenge (`Bibleberry CMS Integration Test` under series `Bibleberry Development Tests` with reference-only Psalm 23:1).
5. **Gateway Implementation:**
   - Gateway core request handler is merged at `src/gateway/handler.ts`.
   - Reader detail provider is merged at `src/cms/reader/challengeDetailProvider.ts` (behind `VITE_ENABLE_RELEASE_GATEWAY_SOURCE`).
   - Reader catalog provider is merged at `src/cms/reader/releasedCatalogProvider.ts`.
   - Worker runtime entry point is implemented at `src/gateway/worker.ts`.
   - Staging Wrangler configuration is created at `wrangler.staging.jsonc`.
6. **Isolated Bundling:** Automated checks confirm that `src/gateway/` and `SANITY_READ_TOKEN` are completely excluded from browser application bundles and trees.

### 2.2 Assumptions Requiring Account-Level Inspection

1. **Cloudflare Account ID & Workers Subdomain:** The specific Cloudflare account owning `aw-e44.workers.dev` must be active and authenticated in Aaron's local environment via `wrangler login` or `CLOUDFLARE_API_TOKEN`.
2. **Sanity Plan & Dataset Quotas:** Project `80016lrq` dataset quota (whether Free tier allows additional datasets or private dataset visibility toggles).
3. **Staging Dataset Status:** Dataset `"staging"` configured in `wrangler.staging.jsonc` is **contingent on Aaron's explicit creation and authorization**; it has **not** been verified to exist in Sanity Manage.
4. **Existing Token Inventory:** Whether any Viewer tokens exist in Sanity Manage (`sanity.io/manage/project/80016lrq/api/tokens`).
5. **Cloudflare Access Policies:** Whether the staging Worker host will be gated by Cloudflare Access (Zero Trust) or public with CORS origin restrictions. Note that CORS is not access control (see Section 5.5).

---

## 3. Proposed Cloudflare Worker Deployment Arrangement

Bibleberry employs the **Cloudflare Workers Static Assets with Selective Worker-First Routing** model.

### 3.1 Routing Architecture

```
                                  Incoming Request
                                         │
                                         ▼
                         ┌───────────────────────────────┐
                         │   Cloudflare Edge Router      │
                         └──────────────┬────────────────┘
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 │ Path matches `/api/*`?                      │
                 ▼ YES                                         ▼ NO
    ┌─────────────────────────┐               ┌─────────────────────────────────┐
    │ Worker Script           │               │ Cloudflare Static Asset Service │
    │ (`src/gateway/worker.ts`)               │ (`./dist`)                      │
    └────────────┬────────────┘               └────────────────┬────────────────┘
                 │                                             │
                 ├────────────────────────┐                    ├────────────────────────┐
                 ▼                        ▼                    ▼                        ▼
        `/api/challenges`        `/api/challenges/:slug`   Static Asset Found       Asset Not Found
                 │                        │               (`/assets/*.js`,         (`/today`, `/archive`)
                 │                        │                `/index.html`)               │
                 ▼                        ▼                    │                        ▼
     `handleGatewayRequest()` `handleGatewayRequest()`         ▼                 `index.html` (SPA)
                 │                        │              200 OK (Static)          200 OK (Client App)
                 ▼                        ▼
          Sanity Private Dataset (via `SANITY_READ_TOKEN`)
```

### 3.2 Selective Routing Mechanics

In `wrangler.staging.jsonc`:
- `main`: `"src/gateway/worker.ts"` defines the entry point.
- `assets.directory`: `"./dist"` provides the compiled React SPA.
- `assets.binding`: `"ASSETS"` binds the asset fetcher to the Worker.
- `assets.not_found_handling`: `"single-page-application"` routes client paths to `index.html`.
- `assets.run_worker_first`: `["/api/*"]` directs API routes to the Worker runtime before asset evaluation.

### 3.3 Gateway Ingress Safeguards

1. **Worker API Isolation:** When `/api/*` is requested, the Worker evaluates `handleGatewayRequest()` directly. It never passes API requests to `env.ASSETS`, ensuring that missing API routes return a clean gateway JSON 404 rather than serving `index.html`.
2. **Worker Static Asset Fallback:** If a non-API request reaches `handleWorkerRequest()` (e.g. during standalone testing or custom origin routing), the Worker forwards the request to `env.ASSETS.fetch(request)`, preserving static file and SPA delivery.
3. **Zero Mutation of Production Configuration:** `wrangler.jsonc` remains completely unmodified, ensuring existing Cloudflare preview deployments for GitHub PRs remain intact.

---

## 4. Required Environment Variables and Secret Names

> [!IMPORTANT]
> Never commit secret values or private tokens to source control. Secrets are configured strictly through `wrangler secret put` or the Cloudflare Dashboard.

### 4.1 Variables (Non-Secret, in `wrangler.staging.jsonc`)

| Variable Name | Type | Description | Example / Staging Value |
| --- | --- | --- | --- |
| `SANITY_PROJECT_ID` | String | Sanity project identifier | `"80016lrq"` |
| `SANITY_DATASET` | String | Sanity target dataset name (contingent on Aaron's creation/approval) | `"staging"` (or `"production"`) |
| `SANITY_API_VERSION` | String | Sanity GROQ API date version (aligned with query/reader default) | `"2026-11-01"` |
| `ALLOWED_ORIGINS` | String | Comma-delimited CORS allowlist for browser clients | `"https://bibleberry-staging.aw-e44.workers.dev,http://localhost:3000,http://127.0.0.1:3000"` |

### 4.2 Secrets (Confidential, Cloudflare Secret Store Only)

| Secret Name | Type | Description | Storage Location |
| --- | --- | --- | --- |
| `SANITY_READ_TOKEN` | String | Private Sanity read-only Viewer token | Cloudflare Worker Secret Store (`wrangler secret put`) |

---

## 5. Sanity Private Dataset & Token Requirements

### 5.1 Why a Private Dataset Is Mandatory for Embargo Security

1. **Public Dataset Limitations:** Any query against a public Sanity dataset can be executed without authentication. Even if the reader client hides a Challenge via client-side gating (A4.1), any user inspecting network traffic or running GROQ queries against `https://80016lrq.api.sanity.io/v2026-11-01/data/query/production` can read all future-dated manuscripts.
2. **Private Dataset Security:** In a private dataset, Sanity rejects unauthenticated queries. Only requests presenting a valid `Authorization: Bearer <SANITY_READ_TOKEN>` header can query the dataset. Because the token is held exclusively by the Cloudflare Worker, client browsers have zero direct access to private content.

### 5.2 Token Provisioning & Permissions

1. **Token Scope:** The token must be generated in Sanity Manage (`https://www.sanity.io/manage/project/80016lrq/api/tokens`).
2. **Permission Level:** Strictly **"Viewer"** (read-only).
3. **Least Privilege Enforcement:**
   - **DO NOT** grant "Editor", "Administrator", or "Deploy Studio" permissions.
   - The token will only execute GROQ `GET` queries.
   - If the token were ever compromised, a "Viewer" token cannot modify, delete, or inject content into the dataset.

### 5.3 Sanity Private Dataset Query Nuance

Sanity's API returns specific response patterns when querying private datasets:
- **Unauthenticated query:** Sanity may return HTTP 200 with an empty array (`{ "result": [] }`) or HTTP 401/403 depending on endpoint configuration.
- **Authenticated query with Viewer token:** Returns matching documents (`{ "result": [ ... ] }`).
- **Gateway Handling:** If Sanity returns 401, 403, 500, or 502, `handleGatewayRequest()` returns HTTP 502 `upstreamError` to the client. If Sanity returns an empty result, the gateway cleanly returns 404 for single challenge queries or `{ ok: true, challenges: [] }` for catalog queries, leaking zero manuscript data.

### 5.4 Existing Dataset and Consumer Considerations

1. **Impact on Studio:** The hosted Sanity Studio (`bibleberry-editor.sanity.studio`) requires users to log in with Sanity accounts. If `production` is toggled to private, authenticated editors in Studio will continue to have access based on their Sanity account permissions.
2. **Impact on Legacy Preview Builds:** Any existing preview builds or local environments relying on unauthenticated browser queries to `production` will receive empty results if `production` becomes private without the gateway.
3. **Recommendation:** For Stage 3B staging proof, either:
   - **Option A (Preferred):** Create a dedicated private dataset named `staging` or `bibleberry-private`, populate it with synthetic test fixtures, and connect the staging Worker to it.
   - **Option B:** Toggle `production` to private only after confirming that Aaron and Alexis's Studio logins are operational and that all client reads flow through the gateway.

### 5.5 CORS vs. Perimeter Access Control: Critical Distinction

> [!WARNING]
> **CORS is not access control.** The `ALLOWED_ORIGINS` setting and `Access-Control-Allow-Origin` headers are enforced only by compliant web browsers. Any HTTP client (`curl`, Postman, Python scripts, automated scrapers) completely ignores CORS headers and can fetch endpoints freely if the host is publicly addressable.

- **Private Staging Requirement:** If staging is intended to be confidential (e.g. testing unpublished manuscripts or sensitive authoring pipelines before public release), `ALLOWED_ORIGINS` alone does not secure it. Cloudflare Access (Zero Trust) must be configured in front of `bibleberry-staging.aw-e44.workers.dev` to enforce identity authentication (e.g. Google or email OTP).
- **Eventual Production Architecture:** In contrast, Bibleberry's eventual production release gateway will be intentionally public to serve all web and mobile readers without requiring user login. The production gateway secures embargoed content not through network gates or CORS, but through **server-authoritative evaluation**: the Worker inspects `releaseAt <= now` and `adaptationReviewed === true`, returning HTTP 404 for any unreleased slug regardless of caller identity.

---

## 6. Verification of Public vs. Private Dataset Access

Before deploying the Worker, execute this two-step verification using `curl` to prove dataset privacy:

### Step 1: Prove Unauthenticated Query Is Blocked / Empty
```bash
# Query the private dataset without an authorization header
curl -s "https://80016lrq.api.sanity.io/v2026-11-01/data/query/staging?query=*\[_type==\"challenge\"\]" | jq .
```
- **Expected result:** Either HTTP 401/403 or `{ "result": [] }`. No Challenge documents returned.

### Step 2: Prove Authenticated Query Succeeds with Token
```bash
# Query the private dataset with the Viewer token
curl -s -H "Authorization: Bearer <SANITY_READ_TOKEN>" \
  "https://80016lrq.api.sanity.io/v2026-11-01/data/query/staging?query=*\[_type==\"challenge\"\]" | jq .
```
- **Expected result:** HTTP 200 with `{ "result": [ { "_id": "...", "title": "..." } ] }`.

---

## 7. Step-by-Step Staging Deployment Procedure

This procedure is for authorized deployment to a staging Worker service.

### Step 7.1: Pre-Deployment Build and Local Verification
On branch `feat/r05-3a-worker-runtime-integration`:
```bash
# 1. Run all unit and integration test suites
npm run test:gateway
npm run test:adapter

# 2. Run linter and TypeScript compiler check
npm run lint
npx tsc -b

# 3. Run automated regression smoke suite across all 6 passes
npm run test:smoke

# 4. Compile application assets to dist/
# Option A: Standard production build (clean public baseline)
npm run build

# Option B: Staging-specific reader acceptance build
# (enables reader challenge route and directs ReleasedChallengeHost to gateway source)
VITE_ENABLE_RELEASED_CHALLENGE_ROUTE=true VITE_ENABLE_RELEASE_GATEWAY_SOURCE=true npm run build

# 5. Non-deploying Wrangler dry-run compilation test (uses actual built assets in dist/)
npm run check:staging
```
Verify that all checks exit with code 0, `dist/` contains `index.html` and static assets, and the dry-run check outputs:
`✨ Read 10 files from the assets directory ... --dry-run: exiting now.`
Note: `npm run check:staging` compiles the Worker via esbuild and verifies asset bindings against actual built assets in `./dist`. Routine unit tests (`npm run test:gateway`) remain completely offline-capable and do not invoke Wrangler or create synthetic build directories.

### Step 7.2: Perimeter Security & Cloudflare Secret Installation Sequencing (Aaron Action)

> [!CAUTION]
> **Immediate Deployment Warning:** Per Cloudflare documentation (https://developers.cloudflare.com/workers/configuration/secrets/), running `npx wrangler secret put <KEY>` immediately creates and deploys a new active Worker version on an existing service. It is **not** a dormant or passive pre-deployment step.

To prevent an unprotected staging window:

1. **Step 7.2A: Configure Cloudflare Access Policy (Zero Trust) Ahead of Deployment:**  
   If staging access must be restricted to Aaron and authorized reviewers, configure the Cloudflare Access Application on `bibleberry-staging.aw-e44.workers.dev` in the Cloudflare Zero Trust dashboard (`Access -> Applications -> Add an application -> Self-hosted -> Application Domain: bibleberry-staging.aw-e44.workers.dev`) **before** deploying code or installing secrets.  
   *Implementation distinction:* Hostname-level Access in Zero Trust can and must be prepared before the Worker service exists. In contrast, the per-Worker Access tab in the Workers & Pages dashboard requires an already-existing Worker; relying on that would create a vulnerability window during initial deploy.

2. **Step 7.2B: Initial Worker Code & Asset Deployment:**  
   ```bash
   npx wrangler deploy --config wrangler.staging.jsonc
   ```
   *Behavior note:* Prior to secret installation, requests to `/api/*` will invoke `handleGatewayRequest()` which detects missing `SANITY_READ_TOKEN` and fails safely with HTTP 500 `serverConfigurationError`, preventing any unauthenticated upstream access.

3. **Step 7.2C: Install Sanity Read Token Secret:**  
   ```bash
   npx wrangler secret put SANITY_READ_TOKEN --config wrangler.staging.jsonc
   # (When prompted, paste the private Sanity read-only Viewer token securely)
   ```
   *Behavior note:* This immediately deploys an updated Worker version with `env.SANITY_READ_TOKEN` bound, activating live gateway operations behind Cloudflare Access.  
   *(Alternative for staged releases: `wrangler versions secret put SANITY_READ_TOKEN --config wrangler.staging.jsonc` can be used within Cloudflare's Gradual Deployments workflow).*

### Step 7.3: Live Staging Acceptance Checks

Staging acceptance is divided into two distinct verification phases:

#### Phase 7.3A: Unauthenticated Perimeter Verification (Proving Access Block)
Execute requests without Access credentials to confirm that Cloudflare Access intercepts anonymous traffic before it reaches the Worker runtime:

1. **Unauthenticated Root Request:**
   ```bash
   curl -i https://bibleberry-staging.aw-e44.workers.dev/
   ```
   *Expected:* HTTP 302 Found (redirecting to `<team>.cloudflareaccess.com/cdn-cgi/access/login/...`) or HTTP 403 Forbidden. Static assets must NOT be returned anonymously.
2. **Unauthenticated API Request:**
   ```bash
   curl -i https://bibleberry-staging.aw-e44.workers.dev/api/challenges
   ```
   *Expected:* HTTP 302 Found or HTTP 403 Forbidden. Gateway API must NOT be executed anonymously.

#### Phase 7.3B: Authenticated Acceptance Checks (Testing Gateway Runtime & Application Delivery)
Execute requests presenting valid Cloudflare Access credentials. For CLI automation, use an Access Service Token via headers (`-H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET"`, stored in local shell environment; never printed or committed). For browser testing, authenticate via the Cloudflare Access login screen.

1. **Static SPA Root Delivery:**
   ```bash
   curl -i -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
     https://bibleberry-staging.aw-e44.workers.dev/
   ```
   *Expected:* HTTP 200, `Content-Type: text/html`, contains `<div id="root">` / React mount.
2. **Static Asset Chunk Delivery:**
   ```bash
   curl -i -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
     https://bibleberry-staging.aw-e44.workers.dev/assets/index-<hash>.js
   ```
   *Expected:* HTTP 200, `Content-Type: application/javascript`.
3. **SPA Client Routing Fallback:**
   ```bash
   curl -i -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
     https://bibleberry-staging.aw-e44.workers.dev/today
   ```
   *Expected:* HTTP 200 serving `index.html` (SPA fallback).
4. **Gateway Catalog API:**
   ```bash
   curl -i -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
     https://bibleberry-staging.aw-e44.workers.dev/api/challenges
   ```
   *Expected:* HTTP 200, `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`, `{ "ok": true, "challenges": [ ... ] }`.
5. **Gateway Single Challenge API (Released):**
   ```bash
   curl -i -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
     https://bibleberry-staging.aw-e44.workers.dev/api/challenges/<released-slug>
   ```
   *Expected:* HTTP 200, `Cache-Control: no-store`, `{ "ok": true, "challenge": { ... } }`.
6. **Gateway Single Challenge API (Future-Dated or Nonexistent):**
   ```bash
   curl -i -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
     https://bibleberry-staging.aw-e44.workers.dev/api/challenges/<future-slug>
   ```
   *Expected:* HTTP 404, `Cache-Control: no-store`, `{ "ok": false, "error": { "kind": "notFound", "message": "Challenge not found" } }`. Zero manuscript leakage.
7. **CORS Preflight:**
   ```bash
   curl -i -X OPTIONS https://bibleberry-staging.aw-e44.workers.dev/api/challenges \
     -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: GET" \
     -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
     -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET"
   ```
   *Expected:* HTTP 204, `Access-Control-Allow-Origin: http://localhost:3000`, `Access-Control-Allow-Methods: GET, OPTIONS`.
8. **Unsupported Method Gating:**
   ```bash
   curl -i -X POST https://bibleberry-staging.aw-e44.workers.dev/api/challenges \
     -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
     -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET"
   ```
   *Expected:* HTTP 405 Method Not Allowed, `Allow: GET, OPTIONS`.
9. **Ordinary Reader End-to-End Route Acceptance (Browser):**  
   Sign in through Cloudflare Access in an approved browser, navigate to `https://bibleberry-staging.aw-e44.workers.dev/#/challenge/<released-slug>`. Verify that the Challenge loads via the gateway source without fallback to direct Sanity reads, and that completed screens record progress into guest participation storage.

---

## 8. Rollback Procedure

### 8.1 Staging Rollback
If the staging deployment exhibits errors:
1. **Wrangler Rollback:**
   ```bash
   npx wrangler rollback --config wrangler.staging.jsonc
   ```
2. **Cloudflare Dashboard:** Navigate to Workers & Pages -> `bibleberry-staging` -> Deployments -> click three dots on previous deployment -> **Rollback**.

### 8.2 Token Invalidation Emergency Procedure
If `SANITY_READ_TOKEN` is suspected of being compromised or misconfigured:
1. Immediately navigate to Sanity Manage (`https://www.sanity.io/manage/project/80016lrq/api/tokens`).
2. Delete or revoke the token.
3. The gateway will immediately fail closed with HTTP 502 `upstreamError`, preventing any content disclosure.
4. Generate a replacement Viewer token, update Cloudflare via `wrangler secret put SANITY_READ_TOKEN --config wrangler.staging.jsonc`, and verify.

### 8.3 Production Immunity
Because production uses `wrangler.jsonc` (which is completely unmodified in this branch), production deployments and previews remain isolated from staging Worker experiments.

---

## 9. Known Decisions Requiring Aaron's Authorization

Before proceeding beyond Stage 3A local verification, the following explicit decisions must be authorized by Aaron Waid:

1. **Private Dataset Strategy:**
   - [ ] Authorize creating a new private dataset (e.g. `staging` or `bibleberry-private`) vs. toggling the existing `production` dataset to private. Note that dataset `staging` has **not** been verified to exist and must be created in Sanity Manage if chosen.
2. **Sanity Viewer Token Generation:**
   - [ ] Generate the read-only Viewer token in Sanity Manage for project `80016lrq` with permissions restricted strictly to "Viewer".
3. **Cloudflare Worker Staging Service:**
   - [ ] Authorize deployment to service name `bibleberry-staging` on the verified `aw-e44.workers.dev` subdomain.
4. **Cloudflare Access Configuration (Perimeter Security):**
   - [ ] Decide whether `bibleberry-staging.aw-e44.workers.dev` will be placed behind Cloudflare Access (Zero Trust) before secret installation, recognizing that CORS restrictions do not prevent direct non-browser HTTP requests.
5. **Technical Acceptance of PR #55:**
   - [ ] Authorize merge of `feat/r05-3a-worker-runtime-integration` following ChatGPT's review.

---

## 10. Stage 3B: Synthetic Scheduled-Release Acceptance Procedure (R05 Stage 3B.3A)

### 10.1 Context & Verified Checkpoints

1. **Merged PR #55 (Stage 3A):** Established the Worker runtime (`src/gateway/worker.ts`), staging configuration (`wrangler.staging.jsonc`), and unit tests.
2. **Verified Deployment Checkpoint (Issue #57):**
   - `bibleberry-staging.aw-e44.workers.dev` was deployed without secrets and confirmed to deny anonymous root and API traffic via Cloudflare Access (HTTP 302 login redirect).
   - Sanity private dataset `staging` exists under project `80016lrq`.
   - Read-only Sanity Viewer token was installed in Cloudflare Worker secrets as `SANITY_READ_TOKEN`.
   - Authenticated browser check of `GET /api/challenges` returned `{ "ok": true, "challenges": [] }`.
3. **Stage 3B.3A Objective (Issue #58):** Engineering preparation only. Prepares synthetic deterministic acceptance fixtures, a guarded create-only setup tool, an acceptance harness, and an operator checklist. No Sanity writes, token creation, or Worker redeployments are performed during preparation.

### 10.2 Synthetic Fixture Pack Inventory

All synthetic fixtures are defined in `src/gateway/fixtures/stagingAcceptanceFixtures.ts`. All IDs and slugs use the isolated `r05-3b-` prefix. They contain deterministic, reference-only Scripture citations (no quoted Bible text, live teaching, editorial notes, user data, or copyrighted content):

> [!NOTE]
> **Simulated Synthetic Eligibility:** Synthetic fixtures include `reviewedBy: Aaron Waid` and predetermined `releaseAt` timestamps solely to test the release engine's technical eligibility gating. These synthetic attributes do NOT represent actual pastoral, editorial, or theological approval.

| Fixture Case | Document ID / Slug | Title | Published / Draft | Editorial Review Status | releaseAt (UTC) | Screen Blocks | Expected Catalog | Expected Detail | Acceptance Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Series** | `r05-3b-series-acceptance`<br>`r05-3b-synthetic-series` | Synthetic Acceptance Series (R05 Stage 3B) | Published | N/A | N/A | N/A | N/A | N/A | Parent container for synthetic test challenges. |
| **Case A** | `r05-3b-challenge-a-released` | Synthetic Released Challenge A | Published | `adaptationReviewed: true`<br>Reviewed by Aaron Waid (simulated synthetic eligibility) | `2026-11-01T05:00:00Z`<br>(Past) | Approved comparison & study blocks | **Included** | **200 OK** | Verifies normal release admission, reader projection, and internal note stripping. |
| **Case B** | `r05-3b-challenge-b-future` | Synthetic Future Challenge B | Published | `adaptationReviewed: true`<br>Reviewed by Aaron Waid (simulated synthetic eligibility) | `2099-01-01T00:00:00.000Z`<br>(Durable future date) | Approved blocks | **Excluded** | **404 Not Found** (Neutral) | Verifies future-dated embargo enforcement and zero manuscript leakage. Fixed to durable future date 2099-01-01 to avoid auto-release drift over test cycles. |
| **Case C** | `r05-3b-challenge-c-unreviewed` | Synthetic Unreviewed Challenge C | Published | `adaptationReviewed: false` | `2026-11-01T05:00:00Z`<br>(Past) | Approved blocks | **Excluded** | **404 Not Found** (Neutral) | Verifies unreviewed content is excluded even after release timestamp. |
| **Case D** | `drafts.r05-3b-challenge-d-draft`<br>`r05-3b-challenge-d-draft` | Synthetic Draft-Only Challenge D | Draft-only | `adaptationReviewed: true` | `2026-11-01T05:00:00Z`<br>(Past) | Approved blocks | **Excluded** | **404 Not Found** (Neutral) | Verifies draft documents are excluded from published perspective and gateway. |
| **Case E** | `r05-3b-nonexistent-slug` | Nonexistent Slug | Nonexistent | N/A | N/A | N/A | **Excluded** | **404 Not Found** (Neutral) | Verifies nonexistent slugs return neutral 404 identical to embargoed slugs. |
| **Case F** | `r05-3b-challenge-f-unapproved-block` | Synthetic Unapproved Block Challenge F | Published | `adaptationReviewed: true` | `2026-11-01T05:00:00Z`<br>(Past) | Comparison block `reviewStatus: "proposed"` | **Excluded** | **404 Not Found** (Neutral) | Verifies unapproved structured blocks cause immediate rejection. |

### 10.3 Guarded Setup Mechanism (`scripts/staging-fixtures.ts`)

To prevent accidental writes to production or state corruption, the setup tool enforces:
1. **Dry-Run by Default:** Without `--apply`, no network mutations occur. A dry run inspects the manifest and validates target settings.
2. **Strict Target Pinning:** Hard-coded to project `80016lrq` and dataset `staging`. Target dataset `production` is strictly rejected with a fatal error.
3. **Local Administrative Credential:** Requires `SANITY_WRITE_TOKEN` in the environment. Tokens in CLI arguments (e.g. `--token`) are explicitly blocked to avoid leaking into `ps` tables or shell history.
4. **Comprehensive Preflight (`perspective=raw`):** Queries existing documents using raw perspective covering `$ids`, `$draftIds` (`drafts.r05-3b-...`), and `$slugs`. Fails closed if any document or slug conflict already exists, or if the preflight query returns a malformed response.
5. **Post-Mutation Readback Verification (`perspective=raw`):** Performs a raw-perspective readback of all 6 documents following mutation, validating draft vs. published presence, `releaseAt` timestamps, sequence order, parent series references, reference-only scripture invariants, and editorial eligibility.
6. **Create-Only Tool with Disarmed Teardown:** The setup tool only creates documents via `createIfNotExists`. Destructive teardown is disarmed in code and returns an immediate safety violation. Fixture cleanup is performed only via explicit, separately authorized operator procedures (see §10.6).

### 10.4 Acceptance Verification Harness (`scripts/verify-staging-acceptance.ts`)

Repeatable read-only verification:
1. **Direct Unauthenticated Sanity Check:** Queries `https://80016lrq.api.sanity.io/v2026-11-01/data/query/staging?query=*[_id=="r05-3b-challenge-a-released"||_type=="challenge"]` without credentials. Distinguishes HTTP 401/403 (proven private), HTTP 200 with records (fatal security failure), and HTTP 200 with 0 records (requires confirmed presence of positive control Fixture A to mark PASS; otherwise marked INCONCLUSIVE). Network errors fail closed.
2. **Anonymous Perimeter Check:** Verifies anonymous GET `/` and GET `/api/challenges` are blocked by Cloudflare Access. For HTTP 302 redirects, inspects the `Location` header to verify it redirects specifically to Cloudflare Access login (`.cloudflareaccess.com` or `cdn-cgi/access/login`), rejecting any unexpected redirect.
3. **Honest Reporting (`PASS`, `FAIL`, `SKIP`, `INCONCLUSIVE`):** When Cloudflare Access service credentials are not provided, authenticated gateway checks are explicitly reported as `SKIP`. In default mode, this fails closed (exit code 1). Operators may pass `--perimeter-only` to run and pass only the anonymous perimeter checks without service credentials.
4. **Authenticated Gateway Catalog:** Verifies GET `/api/challenges` returns HTTP 200, `Cache-Control: no-store`, includes Challenge A, and excludes B, C, D, and F.
5. **Authenticated Single Challenge Details:**
   - Case A: HTTP 200, `Cache-Control: no-store`, projection strips `reviewNotes` and `reviewedBy`.
   - Cases B, C, D, F, E: All return identical neutral HTTP 404 with `Cache-Control: no-store` and zero manuscript leakage.

### 10.5 Operator Execution Checklist (For Aaron Waid After PR Review)

> [!IMPORTANT]
> Do not execute these live-write steps during PR preparation. Execute only after independent PR review and approval.

#### Step 1: Pre-Execution Dry-Run Inspection
In your local authorized terminal:
```bash
npm run fixtures:staging
```
*Expected:* Outputs dry-run manifest of the 6 synthetic documents. Zero network mutations performed.

#### Step 2: Apply Synthetic Fixtures to Private Staging Dataset
In your local protected terminal, enter your temporary administrative write token via `read -s` to prevent the token from being captured in your shell history:
```bash
read -s -p "Enter SANITY_WRITE_TOKEN: " SANITY_WRITE_TOKEN && echo
export SANITY_WRITE_TOKEN
npm run fixtures:staging -- --apply
unset SANITY_WRITE_TOKEN
```
*Expected:* `Successfully created 6 synthetic acceptance documents in staging dataset (staging).` Followed by readback verification passing for all 6 documents.

#### Step 3: Run Acceptance Verification

**Option A: Anonymous Perimeter Verification (No Service Token Required)**
```bash
npm run verify:staging -- --perimeter-only
```
*Expected:* Anonymous perimeter checks pass (Direct Sanity denial and Cloudflare Access login redirects). Authenticated checks are marked `SKIP` and the suite succeeds for perimeter verification.

**Option B: Full Gateway Acceptance Verification (Automated CLI)**
> [!NOTE]
> Automated CLI verification requires a Cloudflare Access Service Token (`CF-Access-Client-Id` and `CF-Access-Client-Secret`) configured with a Cloudflare Access policy whose Action is **Service Auth**. If Service Auth is not configured on the Access application, browser authentication is the primary path (Option C).

```bash
read -s -p "Enter CF_ACCESS_CLIENT_SECRET: " CF_ACCESS_CLIENT_SECRET && echo
export CF_ACCESS_CLIENT_ID="<your-access-client-id>"
export CF_ACCESS_CLIENT_SECRET
npm run verify:staging
unset CF_ACCESS_CLIENT_ID CF_ACCESS_CLIENT_SECRET
```
*Expected:* All 10 checks pass (10/10 Passed), validating:
- Direct unauthenticated Sanity read returns no records (with Fixture A serving as verified positive control).
- Anonymous perimeter requests redirect to Cloudflare Access login (HTTP 302 with verified `Location` header).
- Authenticated catalog admits Challenge A and excludes B, C, D, F.
- Detail GET for A returns 200 with internal fields stripped.
- Detail GET for B, C, D, F, E return identical neutral 404 with zero manuscript leakage.
- All responses emit `Cache-Control: no-store`.

**Option C: Browser End-to-End Acceptance (Primary if Service Auth is not configured)**
Sign in through Cloudflare Access in an approved browser:
1. Navigate to `https://bibleberry-staging.aw-e44.workers.dev/api/challenges` -> Verify `{ "ok": true, "challenges": [ { "slug": "r05-3b-challenge-a-released", ... } ] }`.
2. Navigate to `https://bibleberry-staging.aw-e44.workers.dev/api/challenges/r05-3b-challenge-a-released` -> Verify HTTP 200, challenge details present, no `reviewNotes`.
3. Navigate to `https://bibleberry-staging.aw-e44.workers.dev/api/challenges/r05-3b-challenge-b-future` -> Verify HTTP 404 not found.
4. Navigate to `https://bibleberry-staging.aw-e44.workers.dev/#/challenge/r05-3b-challenge-a-released` -> Verify Challenge loads in the React reader.

#### Step 4: Post-Acceptance Teardown / Cleanup
When testing is complete, follow the authorized manual cleanup procedure in §10.6 to delete the 6 synthetic documents from the staging dataset.

#### Step 5: Readback Verification After Cleanup
After performing the manual teardown in §10.6, verify that the staging catalog is completely restored to an empty state:
```bash
# Via authenticated curl with service token:
curl -i -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
     -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
     https://bibleberry-staging.aw-e44.workers.dev/api/challenges

# Or in your authenticated browser:
# Visit https://bibleberry-staging.aw-e44.workers.dev/api/challenges
```
*Expected:* HTTP 200 with `{ "ok": true, "challenges": [] }`, confirming clean restoration.

---

### 10.6 Authorized Manual Cleanup / Teardown Procedure

To preserve strict safety invariants, destructive teardown is disarmed in automated scripts. Once acceptance testing is concluded, the operator cleans up the 6 synthetic acceptance documents using either the Sanity CLI or an explicit Sanity mutation request.

#### Explicit Synthetic IDs Subject to Cleanup
Only delete these 6 specific synthetic IDs (never delete by wildcard or open prefix):
1. `r05-3b-series-acceptance`
2. `r05-3b-challenge-a-released`
3. `r05-3b-challenge-b-future`
4. `r05-3b-challenge-c-unreviewed`
5. `drafts.r05-3b-challenge-d-draft`
6. `r05-3b-challenge-f-unapproved-block`

#### Option 1: Via Sanity CLI
```bash
npx sanity documents delete \
  --project 80016lrq \
  --dataset staging \
  r05-3b-series-acceptance \
  r05-3b-challenge-a-released \
  r05-3b-challenge-b-future \
  r05-3b-challenge-c-unreviewed \
  drafts.r05-3b-challenge-d-draft \
  r05-3b-challenge-f-unapproved-block
```

#### Option 2: Via Direct Sanity HTTP Mutation API
```bash
read -s -p "Enter SANITY_WRITE_TOKEN: " SANITY_WRITE_TOKEN && echo
curl -X POST \
  "https://80016lrq.api.sanity.io/v2026-11-01/data/mutate/staging" \
  -H "Authorization: Bearer $SANITY_WRITE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mutations": [
      { "delete": { "id": "r05-3b-series-acceptance" } },
      { "delete": { "id": "r05-3b-challenge-a-released" } },
      { "delete": { "id": "r05-3b-challenge-b-future" } },
      { "delete": { "id": "r05-3b-challenge-c-unreviewed" } },
      { "delete": { "id": "drafts.r05-3b-challenge-d-draft" } },
      { "delete": { "id": "r05-3b-challenge-f-unapproved-block" } }
    ]
  }'
unset SANITY_WRITE_TOKEN
```
*Expected:* Sanity returns HTTP 200 with mutation confirmation results. Proceed to Step 5 to confirm catalog is empty.
