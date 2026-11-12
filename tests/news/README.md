# Bibleberry Issue #130: Ministry News Feed and Standalone Reader View

## Overview
This directory contains unit, provider, and interactive browser verification suites for Bibleberry's typed ministry News feed and standalone reader view (Issue #130 / R11-1).

## Scope and Boundaries
- **Write Ownership**:
  - `src/cms/reader/newsProvider.ts`: Typed gateway consumer for `GET /api/news`.
  - `src/components/news/**`: Read-only News view, portable text renderer, error boundary, and host.
  - `tests/news/**`: Unit, provider validation, and Playwright browser tests.
- **Strict Invariants**:
  - Consumes existing safe gateway `GET /api/news` with strict Zod validation and same-origin default (`baseUrl: ''`).
  - Zero direct browser-to-Sanity API calls.
  - Fail-closed rejection of leaked editorial metadata (`editorialReview`, `sourceSnapshot`, `withdrawn`, `_id`, `_type`, `reviewNotes`, draft IDs).
  - Monthly preview news articles require valid month destinations (`{ kind: 'month', monthId: 'YYYY-MM' }`) and omit body/cover images.
  - Blocked external links inside article bodies: external URLs (`http:`, `https:`, `//`, `mailto:`) render as disabled, inert spans (`role="link"`, `aria-disabled="true"`, `data-blocked-external-link="true"`).
  - Safe internal navigation: only authorized internal routes (`#/month/:yearMonth`) are navigable.
  - Accessible loading, empty, offline/request error states, and keyboard-driven retry behavior.
  - No gamification badges, no unread personal tracking dots, and no push permission prompts.
  - Tested on narrow screens (320px viewport) with 200% text zoom reflow.

## Test Inventory
1. **Provider & Schema Unit Tests** (`tests/news/newsProvider.test.ts`):
   - Valid feed projection across `ministryUpdate`, `announcement`, and `monthlyPreview`.
   - Leak rejection: fail-closed rejection on `editorialReview`, `sourceSnapshot`, `withdrawn`, etc.
   - Rejection of draft document IDs (`drafts.*`).
   - Rejection of non-Sanity CDN cover image URLs.
   - Category query filtering and validation.
   - Rejection of direct Sanity API URLs (`https://sanity.io`, `*.api.sanity.io`).
   - Empty state handling (`articles: []`).
   - Fast failure on 400 Bad Request without retry.
   - Bounded retries (up to 3) on transient 502/503/network failures with backoff.
   - Abort signal handling.
   - End-to-end integration with `handleGatewayRequest`.

2. **Model & Utilities Tests** (`tests/news/newsModel.test.ts`):
   - Timezone-safe UTC civil date formatting.
   - Category human-readable labeling.
   - Month preview heading formatting.
   - Internal vs external link identification.
   - Safe internal destination validation.
   - Category filtering logic.

3. **Interactive Playwright Browser Suite** (`tests/news/news-reader.spec.ts`):
   - Narrow screen (320px) and 200% zoom reflow without horizontal overflow or clipping.
   - Blocked external link/href behavior inside article body.
   - Safe internal navigation to month preview.
   - Keyboard tab navigation across category filters with Arrow keys.
   - Accessible empty state (`role="status"`, `aria-live="polite"`).
   - Accessible offline/error state with functional retry action (`role="alert"`).
   - Exclusion of gamification announcements, achievement badges, unread trackers, and push permission prompts.
