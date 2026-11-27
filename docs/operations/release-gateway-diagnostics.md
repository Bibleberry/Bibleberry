# Release Gateway diagnostics

**Origin:** [Anthropic Addresses #369](https://github.com/Bibleberry/Bibleberry/issues/369) · **Code:** `src/gateway/diagnostics.ts`, `src/gateway/handler.ts` · **Tests:** `tests/gateway/diagnostics.test.ts`

The gateway fails closed. Readers get the same neutral `404 Month not found` or `502 Upstream content service unavailable` whatever went wrong, and that has not changed. The reason now goes to Worker logs instead, as one JSON line per event with `"source":"bibleberry-gateway"`.

## Telling common situations apart

| What you see in Worker logs | What it means | Where to look next |
|---|---|---|
| `upstreamFailure`, `failure: httpStatus`, `upstreamStatusHint: authorization` (401/403) | Sanity rejected the read token, or the token lacks access to the dataset | `SANITY_READ_TOKEN` secret and its Sanity permissions |
| `upstreamFailure`, `upstreamStatusHint: notFound` (404) | Wrong `SANITY_PROJECT_ID`, dataset or API version | `wrangler.staging.jsonc` vars |
| `upstreamFailure`, `rateLimited` (429) or `serverError` (5xx) | Sanity is throttling or unavailable (transient, `warn`) | Sanity status; retry |
| `upstreamFailure`, `failure: timeout` | No complete Sanity response within `timeoutMs` (default 8000 ms) | Sanity latency; the request was aborted |
| `upstreamFailure`, `failure: network` | `fetch` failed before any response (DNS, TLS, egress) | Worker egress / Sanity reachability |
| `upstreamFailure`, `invalidJson` / `missingResult` / `unexpectedResultShape` | Sanity answered 2xx, but not with a usable GROQ result | Proxies in the path; query/API-version mismatch |
| `contentUnavailable`, `stage: releaseGate`, `reason: notYetReleased` | The month (or its preview) is not released for the reader's authorized date. Sanity was not contacted | Expected before release (`info`) |
| `contentUnavailable`, `stage: upstream`, `reason: noEligibleDocument` | Sanity returned no published, `scheduled`, non-withdrawn document for that month or slug | Studio: is it published and set to `scheduled`? (`info`) |
| `contentUnavailable`, `stage: projection`, any other `reason` | The document exists but failed validation, so the whole month is withheld (`warn`) | Open Studio's Monthly readiness inspector for that month |
| `itemsRejected` | A list route (catalog, News, Library) dropped `rejected` of `inspected` documents, counted by `reasons` | Usually expected embargo; investigate unexpected reasons |
| `configurationError` | Named Worker bindings are missing or invalid | Worker vars and secrets |

`reason` values for `stage: projection` are the gateway's `ValidationFailureReason` values: `malformedDocument`, `invalidCalendarAssignment`, `duplicateSlotAssignment`, `draftDocument`, `unreviewed`, `unapprovedBlocks`, `unlicensedScripture`, `withdrawn`, `embargoed`, `invalidTimestamp`, `missingScreens`.

## Event fields

Every event carries `source`, `event`, `level` (`info`, `warn` or `error`), `route` and `responseStatus`, which is the status the reader actually received.

- `route`: `catalog`, `challenge`, `monthPreview`, `monthDetail`, `monthProgress`, `libraryMonths`, `news`, or `unknown`.
- `upstreamFailure`: `failure`, plus `upstreamStatus`, `upstreamStatusHint`, `elapsedMs` and `timeoutMs` when applicable.
- `contentUnavailable`: `stage`, `reason`, plus `yearMonth` (month routes) or `slug` (single Challenge). Both are logged only after they pass route validation.
- `itemsRejected`: `inspected`, `rejected`, `reasons` (counts).
- `configurationError`: `bindings` (names only).

## What is never logged

The Sanity token, the `Authorization` header, upstream URLs and GROQ query text, upstream response bodies, document bodies, titles, Scripture, review notes, and request paths that failed validation. `tests/gateway/diagnostics.test.ts` asserts this for every event path.

## Limits

- A projection `reason` says what class of check failed, not which field or day. Use the Studio readiness inspector for the specific finding. `studio/tests/readinessGatewayParity.test.ts` keeps the two in agreement.
- The Library route can make up to four sequential upstream calls per request, each with its own timeout.
- The pre-existing `[gateway] Integrity error` lines in `projection.ts` are unchanged and remain free text.
