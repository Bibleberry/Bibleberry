# CI Smoke-Suite Vite Preview Lifecycle Repair

**Related Issue:** [#165](https://github.com/Bibleberry/Bibleberry/issues/165)  
**Branch:** `fix/ci-smoke-preview-lifecycle`

## Problem Summary

In GitHub Actions runs [43812171949](https://github.com/Bibleberry/Bibleberry/actions/runs/43812171949) and [43771621445](https://github.com/Bibleberry/Bibleberry/actions/runs/43771621445), the `Build reader application` job failed in `Run reader regression smoke suite` immediately after a successful Vite public bundle build with:

```text
FAILED: Regression suite error: Preview server did not become ready on port 4173
```

Inspection of `scripts/run-smoke-suite.ts` identified several harness-level hazards:
- All seven passes hardcoded fixed port `4173` with `--strictPort`.
- `waitForPortFree()` returned a boolean that `startPreviewServer()` ignored before spawning.
- `npx vite preview` was spawned with `stdio: 'ignore'`, suppressing Vite diagnostic output.
- Process termination targeted the `npx` parent process rather than directly managing the Vite HTTP server lifecycle.

## Implemented Repair

### `scripts/run-smoke-suite.ts`
1. **Programmatic Vite `preview()` on OS-assigned loopback port:** Replaced shell-wrapped `npx vite preview --port 4173 --strictPort` with programmatic `preview()` from `'vite'`, binding to `127.0.0.1` on port `0` (`strictPort: false`, `open: false`).
2. **Derived `PLAYWRIGHT_TEST_BASE_URL`:** Resolves the actual bound port via `server.httpServer.address()` (`resolveBoundPort`) and passes `http://127.0.0.1:<port>` to each pass's Playwright invocation.
3. **Actionable readiness and diagnostics:** Captures Vite warnings/errors via a diagnostic logger (`createDiagnosticLogger`), attaches an `httpServer` `'error'` listener, checks `httpServer.listening`, and polls the derived loopback URL until HTTP `2xx` or bounded timeout.
4. **Guaranteed cleanup and port release:** Closes the `PreviewServer` via `server.close()` and `httpServer.closeAllConnections()` with a bounded timeout, then verifies kernel port release using a TCP bind probe (`waitForPortReleased` / `isPortAvailable`). Handles `SIGINT`/`SIGTERM` to close any active preview server and preserves primary test/build errors if cleanup or final `dist/` restoration fails.
5. **Preserved 7-pass coverage:** Parameterizes all seven existing smoke passes (`SMOKE_PASSES`) with identical feature-flag builds, Playwright test selections, and final clean public `dist/` restoration.

### `tests/ci/smokePreviewLifecycle.test.ts`
Focused Node test suite (`node --experimental-strip-types --test tests/ci/smokePreviewLifecycle.test.ts`) verifying:
- Automatic OS-assigned loopback port binding even when port `4173` is occupied by an independent HTTP server.
- Readiness verification and genuine OS port release after `stopPreviewServer`.
- Actionable error reporting on startup failure (missing `dist/index.html`, occupied explicit port) and smoke-test failure without leaving a server behind or masking the primary error.
- Sequential 7-pass start/stop without port collisions.
- Preservation of all seven smoke pass definitions and strictly local loopback binding.

## Scope Boundaries

- No changes to `.github/workflows/**`, `src/**`, `studio/**`, `src/gateway/**`, `tests/smoke/*.spec.ts`, `package*.json`, or native projects.
- No tests removed, skipped, or weakened.
