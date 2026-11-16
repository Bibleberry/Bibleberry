# R12-2: Safe External Deep-Link Ingress Foundation

## Scope and Architecture

This foundation (`src/deepLinkIngress/**`) implements platform-neutral external deep-link parsing, gateway-backed content authorization, and lifecycle-safe controller orchestration without registering production domains, modifying native manifests, configuring Apple Universal Links or Android App Links, or altering `src/App.tsx`, `src/native/internalDestination.ts`, `src/appIntegration/appRoutes.ts`, or News integration.

### Module Breakdown

- [`src/deepLinkIngress/types.ts`](../../src/deepLinkIngress/types.ts): Shared contracts for injected host/scheme policies (`ExternalLinkIngressPolicy`), parse results, gateway authorization options, accessible unavailable-content outcomes, and controller lifecycle state.
- [`src/deepLinkIngress/parser.ts`](../../src/deepLinkIngress/parser.ts): `parseExternalDeepLink` validates external HTTPS and custom-scheme URLs against an explicitly injected allowlist, rejects malformed inputs, control characters, backslashes, userinfo, non-default HTTPS ports, encoded-path/traversal tricks (checked before `URL` normalization), invalid month identifiers, invalid Challenge slugs, unknown/duplicate query parameters, and disabled feature gates. Supported routes translate into typed `InternalDestination` values via `src/native/internalDestination.ts` and preserve valid `ChallengeOrigin` context via `src/cms/reader/challengeOrigin.ts`.
- [`src/deepLinkIngress/authorizer.ts`](../../src/deepLinkIngress/authorizer.ts): `authorizeExternalDeepLink` distinguishes a syntactically valid link from an authorized released-content destination by delegating to injected `MonthGatewayProvider` (`loadMonth` and, when enabled, `loadMonthPreview`) and `ChallengeDetailProvider` (`loadChallenge`) instances. Unreleased, embargoed, errored, or unconfigured destinations fail closed without falling back to direct Sanity reads or redirecting to guessed content.
- [`src/deepLinkIngress/outcomes.ts`](../../src/deepLinkIngress/outcomes.ts): `createUnavailableContentOutcome` produces a clear, screen-reader-friendly `UnavailableContentOutcome` (`role`, `liveRegion`, neutral `heading`/`message`, and explicit `Return to Hub` action) without leaking embargoed release dates or hidden titles.
- [`src/deepLinkIngress/controller.ts`](../../src/deepLinkIngress/controller.ts): `createDeepLinkIngressController` coordinates cold starts (`getInitialUrl`), resumed sessions (`subscribeUrlOpen`), duplicate incoming-link suppression (in-flight and configurable `dedupeWindowMs` across equivalent canonical destinations), and latest-wins `AbortController` cancellation for superseded requests.

## Security and Fail-Closed Boundaries

1. **No hardcoded production domain or scheme:** Empty or omitted allowlists reject all external URLs.
2. **Pre-normalization path inspection:** Raw path segments are checked for `.` / `..` traversal, `//`, and encoded sequences (`%2e`, `%2f`, `%5c`, `%00`, `%25`) before `URL` normalization can collapse them.
3. **Strict query allowlisting:** Month links reject any query parameters; Challenge links permit only `origin` (`hub`, `month`, `shelf`, `library`) and `yearMonth` (`YYYY-MM`), rejecting arbitrary redirect parameters (`next`, `redirect`, etc.) and invalid month identifiers.
4. **Authorization separation:** Parsing a valid external URL never implies content availability; gateway authorization is required before navigation is emitted.

## Verification

- `node --experimental-strip-types --test tests/deepLinkIngress/*.test.ts` — 12 tests covering:
  - [`tests/deepLinkIngress/parser.test.ts`](../../tests/deepLinkIngress/parser.test.ts): HTTPS and custom-scheme Month/Challenge parsing, `ChallengeOrigin` preservation, custom-scheme host allowlisting, malformed URLs, unauthorized hosts/schemes, encoded-path/traversal tricks, invalid months/slugs/queries, and feature-gate enforcement.
  - [`tests/deepLinkIngress/authorizer.test.ts`](../../tests/deepLinkIngress/authorizer.test.ts): Injected `createGatewayChallengeProvider` and `createGatewayMonthProvider` verification for active/historical/advance-preview Months, released Challenges, 404 future/embargoed Challenges, 500 gateway errors, missing providers, aborted signals, and accessible unavailable-content outcomes.
  - [`tests/deepLinkIngress/controller.test.ts`](../../tests/deepLinkIngress/controller.test.ts): Cold-start handling, resumed-session `subscribeUrlOpen` events, duplicate suppression (in-flight and within `dedupeWindowMs`, plus re-acceptance after the window), latest-wins cancellation of superseded authorizations, and clean `stop()` teardown.

## Deferred Integration (Out of Scope for R12-2)

- Production domain selection and registration
- Apple Universal Links (`apple-app-site-association`) and Android App Links (`assetlinks.json` / intent filters)
- Native Capacitor `@capacitor/app` URL listener wiring and `src/App.tsx` integration
