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

# 5. Non-deploying Wrangler dry-run compilation test (pinned version)
npm run check:staging
# (or: npx --yes wrangler@4.158.0 deploy --dry-run --config wrangler.staging.jsonc)
```
Verify that all checks exit with code 0, `dist/` contains `index.html` and static assets, and the dry-run check outputs:
`✨ Read 10 files from the assets directory ... --dry-run: exiting now.`

### Step 7.2: Perimeter Security & Cloudflare Secret Installation Sequencing (Aaron Action)

> [!CAUTION]
> **Immediate Deployment Warning:** Per Cloudflare documentation (https://developers.cloudflare.com/workers/configuration/secrets/), running `npx wrangler secret put <KEY>` immediately creates and deploys a new active Worker version on an existing service. It is **not** a dormant or passive pre-deployment step.

To prevent an unprotected staging window:

1. **Step 7.2A: Configure Cloudflare Access Policy (Zero Trust):**  
   If staging access must be restricted to Aaron and authorized reviewers, configure the Cloudflare Access Application on `bibleberry-staging.aw-e44.workers.dev` in the Cloudflare Zero Trust dashboard **before** deploying or installing secrets. This ensures the endpoint is authenticated the instant it becomes live.

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
   *Behavior note:* This immediately deploys an updated Worker version with `env.SANITY_READ_TOKEN` bound, activating live gateway operations.
   *(Alternative for staged releases: `wrangler versions secret put SANITY_READ_TOKEN --config wrangler.staging.jsonc` can be used within Cloudflare's Gradual Deployments workflow).*

### Step 7.3: Live Staging Acceptance Checks

Execute the following checks against the deployed staging URL:

1. **Static SPA Root Delivery:**
   ```bash
   curl -i https://bibleberry-staging.aw-e44.workers.dev/
   ```
   *Expected:* HTTP 200, `Content-Type: text/html`, contains `<div id="root">` / React mount.
2. **Static Asset Chunk Delivery:**
   ```bash
   curl -i https://bibleberry-staging.aw-e44.workers.dev/assets/index-<hash>.js
   ```
   *Expected:* HTTP 200, `Content-Type: application/javascript`.
3. **SPA Client Routing Fallback:**
   ```bash
   curl -i https://bibleberry-staging.aw-e44.workers.dev/today
   ```
   *Expected:* HTTP 200 serving `index.html` (SPA fallback).
4. **Gateway Catalog API:**
   ```bash
   curl -i https://bibleberry-staging.aw-e44.workers.dev/api/challenges
   ```
   *Expected:* HTTP 200, `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`, `{ "ok": true, "challenges": [ ... ] }`.
5. **Gateway Single Challenge API (Released):**
   ```bash
   curl -i https://bibleberry-staging.aw-e44.workers.dev/api/challenges/<released-slug>
   ```
   *Expected:* HTTP 200, `Cache-Control: no-store`, `{ "ok": true, "challenge": { ... } }`.
6. **Gateway Single Challenge API (Future-Dated or Nonexistent):**
   ```bash
   curl -i https://bibleberry-staging.aw-e44.workers.dev/api/challenges/<future-slug>
   ```
   *Expected:* HTTP 404, `Cache-Control: no-store`, `{ "ok": false, "error": { "kind": "notFound", "message": "Challenge not found" } }`. Zero manuscript leakage.
7. **CORS Preflight:**
   ```bash
   curl -i -X OPTIONS https://bibleberry-staging.aw-e44.workers.dev/api/challenges \
     -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: GET"
   ```
   *Expected:* HTTP 204, `Access-Control-Allow-Origin: http://localhost:3000`, `Access-Control-Allow-Methods: GET, OPTIONS`.
8. **Unsupported Method Gating:**
   ```bash
   curl -i -X POST https://bibleberry-staging.aw-e44.workers.dev/api/challenges
   ```
   *Expected:* HTTP 405 Method Not Allowed, `Allow: GET, OPTIONS`.
9. **Ordinary Reader End-to-End Route Acceptance:**  
   Navigate in a browser to `https://bibleberry-staging.aw-e44.workers.dev/#/challenge/<released-slug>`. Verify that the Challenge loads via the gateway source without fallback to direct Sanity reads, and that completed screens record progress into guest participation storage.

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
