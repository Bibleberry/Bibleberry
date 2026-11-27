# Static-asset security headers: decision record

**Origin:** [Anthropic Addresses #369](https://github.com/Bibleberry/Bibleberry/issues/369), finding 5 · **Date:** 2026-11-27 · **Status:** baseline implemented in `public/_headers`. Resource CSP and HSTS deferred to before beta. Owner acceptance is pending through the PR.

## Context

The reader is served by Cloudflare Workers Static Assets (`wrangler.jsonc`, `wrangler.staging.jsonc`). Before this change it sent no `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy` or frame policy. Staging sits behind Cloudflare Access, so exposure today is low. These headers have to be settled before any public beta.

The reader embeds third-party media: YouTube (`youtube-nocookie.com`) and Simplecast `<iframe>` players. It loads Google Fonts, Sanity CDN images, and Supabase through env-configured URLs. Nothing frames the reader itself. The native Capacitor apps load bundled files and never receive these headers.

## Decision

**Implement now: low risk, no origin inventory needed.** These apply to every static path (`/*`):

| Header | Value | Why it is safe now |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Assets are served with correct types by Workers Static Assets |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Matches browser default behaviour, made explicit; embeds still receive the origin |
| `X-Frame-Options` | `DENY` | Nothing frames the reader; prevents clickjacking |
| `Content-Security-Policy` | `frame-ancestors 'none'` | Modern equivalent of the above; restricts no resource loading |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | The reader uses none of these. Features the media iframes delegate (autoplay, encrypted-media, fullscreen, clipboard-write, web-share and others) are left alone |

**Deferred, with a named next step:**

- **Resource CSP** (`default-src`, `script-src`, `img-src`, `frame-src`, `connect-src`, …). A wrong policy breaks the reader silently. First inventory the origins actually used per environment, at minimum: self, Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`), `cdn.sanity.io`, the YouTube and Simplecast embed hosts, and the Supabase project URL. Then ship it as `Content-Security-Policy-Report-Only` on staging, review the violations during the synthetic-month rehearsal (Distant Horizon #335), and only then enforce. Owner: Engineering Planning, before beta.
- **HSTS.** It belongs to the production custom domain, not to `workers.dev`, and preloading is hard to reverse. Decide with the domain setup.

The Release Gateway's `/api/*` responses come from the Worker and are not affected by this file. They are JSON with `Cache-Control: no-store` and unchanged CORS. Adding headers there was not part of this decision.

## Verification

- `tests/ci/static-asset-headers.test.ts` guards the baseline and the deferrals. It fails if a resource CSP or HSTS appears without a new decision, or if `Permissions-Policy` denies a feature the media iframes delegate.
- Local check: `npm run build` (which copies `public/_headers` into `dist/`), then `npx wrangler dev --config wrangler.staging.jsonc --local`. `/`, an SPA route such as `/today`, and a hashed asset under `/assets/` all returned the headers above; `/api/*` did not. Not yet verified on the deployed staging Worker.
