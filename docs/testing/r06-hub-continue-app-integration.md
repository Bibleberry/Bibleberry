# R06: Hub Continue ordinary-shell integration seam

## Result and current gate

`src/appIntegration/hubContinueInput.ts` adapts already validated app-store/provider results into the existing Hub Continue input. It returns `null` unless participation and Shelf stores are hydrated and healthy, the released catalog is a successful gateway result, and every active-focus/Shelf month has a matching successful gateway detail response with consistent authoritative local date and timezone. Catalog failures, missing month details, inconsistent server context, and stale catalog identities therefore cannot enable a recommendation through this seam.

The ordinary `src/App.tsx` shell is intentionally **not wired** to `HubContinueBoundary` in this change. Its current Today view does not yet subscribe to the Shelf store or load authorized historical month details and the released catalog together. The related App-touching assignments in PRs #218 and #219 are open; this smaller adapter avoids overlapping their `App.tsx` work, as required by the assignment sequence. No live Continue suggestion is claimed.

## Remaining work for live use

After the preceding `App.tsx` slices have been completed and integrated sequentially:

1. Subscribe to the existing guest Shelf store and wait for both Shelf and participation snapshots to be `ready` with healthy storage. Pass their actual snapshots to `createHubContinueAppInput`; do not derive focus from route history, `lastOpenedChallenge`, or Library browsing.
2. Load the focused and Shelf month details through the existing gateway `MonthGatewayProvider` and the released catalog through the existing gateway catalog provider. Do not add an endpoint or use fixture/local sample data. Provide all candidate month results so an incomplete fetch keeps the adapter closed.
3. Use the gateway `serverContext.authorizedLocalDate` and timezone from successful month responses; the adapter rejects missing or inconsistent context. Do not use the device clock or invent a month.
4. Render `HubContinueBoundary` only when the adapter returns an input. Navigate using the returned canonical document ID/slug and existing Hub-origin Month/Challenge navigation so Finish returns to Hub. Reconcile this item with the legacy `ResumeCard` so Today never presents conflicting Continue/Resume prompts.
5. Add ordinary-shell browser coverage for real provider/store wiring and navigation return context, in addition to the standalone boundary's existing mobile, keyboard, touch-target, and reflow tests.

## Verification coverage

- `tests/hubContinue/hubContinueAppInput.test.ts` exercises a permitted suggestion, loading/unavailable stores and providers, mismatched/stale data, and separation of deliberate Shelf focus from incidental Library activity.
- `tests/hubContinue/hubContinueEngine.test.ts` remains the engine-level priority, availability, and authorization regression suite.
- `tests/hubContinue/hub-continue.spec.ts` remains the standalone presentation test for keyboard activation and narrow mobile layout. It does not claim ordinary `App.tsx` navigation coverage.
