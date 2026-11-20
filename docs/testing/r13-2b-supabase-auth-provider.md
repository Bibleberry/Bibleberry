# R13-2B — Fail-closed Supabase email-OTP `AuthProvider`

**Issue:** [#251 — Sable Harbor](https://github.com/Bibleberry/Bibleberry/issues/251) (Phase 05 / R13)
**Builds on:** R13-2A `AuthProvider` + `AccountSessionController` ([#179](https://github.com/Bibleberry/Bibleberry/issues/179)), `SupabasePostgrestTransport` ([#232](https://github.com/Bibleberry/Bibleberry/issues/232)), real-local continuity acceptance ([#246](https://github.com/Bibleberry/Bibleberry/issues/246))
**Scope:** `src/accountAuth/supabaseGoTrueProvider.ts`, one new reason (`unsupportedMethod`) in `src/accountAuth/types.ts`, the barrel export, `tests/accountAuth/supabaseGoTrueProvider.test.ts` and this note. There is no UI, no `src/App.tsx` wiring, no migration, no `supabase/**` config change, no new dependency, no credentials and no hosted project.

## 1. What the adapter does

`SupabaseGoTrueAuthProvider` implements the accepted `AuthProvider` contract against the public GoTrue REST endpoints. It uses an injectable `fetch`, so it adds no SDK. `@supabase/supabase-js` is not a dependency, and none was added.

| `AuthProvider` call | GoTrue request(s) | Notes |
| --- | --- | --- |
| `signIn({ method: 'emailOtp', email })` | `POST /auth/v1/otp` `{ email, create_user }` | Normalizes the email (trim, lowercase), validates it locally, then issues a random 128-bit challenge ID bound to that email |
| `verifyEmailOtp({ challengeId, code })` | `POST /auth/v1/verify` `{ type: 'email', email, token }`, then `GET /auth/v1/user` | The email comes from the bound challenge and is never taken from the caller |
| `restoreSession()` | `GET /auth/v1/user` with the stored token. If the token is rejected or near expiry, it refreshes | Never promotes a stored record without GoTrue confirming it |
| `recoverSession()` | `POST /auth/v1/token?grant_type=refresh_token`, then `GET /auth/v1/user` | Always an explicit refresh |
| `signOut()` | `POST /auth/v1/logout?scope=local` with the user Bearer token | Clears local state first and unconditionally |
| `signIn({ method: 'google' \| 'apple' })` | none | `unauthorized` / `unsupportedMethod`. Nothing pretends to be authenticated |

Every request sends only the publishable key as `apikey`. `Authorization: Bearer` carries only a *user* access token, and only on `/user` and `/logout`. Requests use `redirect: 'error'`, `credentials: 'omit'` and `cache: 'no-store'`, and each has a timeout (default 15 s).

## 2. Security invariants

1. **Server-verified identity only.** A session is promoted only after `GET /auth/v1/user` with the new access token returns a canonical UUID. The adapter never decodes the access token. Tests deliberately mint access tokens whose unverified `sub` names a *different* account and prove the trusted `/user` identity wins. The user ID echoed by the token response is cross-checked, never trusted on its own. Users that are anonymous, not in the `authenticated` aud or role, or malformed are refused.
2. **Challenge binding.** A challenge ID maps to exactly one pending `{ email, expiresAt, attempts }`. Only the most recent challenge is live, and a new `signIn` or `signOut` invalidates earlier ones. Each OTP request takes a monotonic sequence number, separate from the sign-out generation. An older `/otp` response that arrives after a newer request began is discarded as `cancelled` and can never overwrite the newest challenge, whatever order the responses arrive in. Unknown, superseded, expired (client TTL, default 10 min), exhausted (default 5 wrong attempts) and already-consumed challenges return `challengeExpired` without touching the network. Malformed codes count as attempts but are never sent. A concurrent second verify of the same challenge is refused. On OTP verification, the email returned by `/user` must equal the challenge email.
3. **No client secrets (allowlist).** The constructor accepts only two key forms:
   - a `sb_publishable_…` key;
   - a legacy JWT project key with a JSON header and `role` exactly `anon`.

   Everything else is refused, including arbitrary strings, malformed JWTs, missing roles, `authenticated`, `service_role` and `sb_secret_…` keys. It also refuses non-HTTPS non-loopback URLs and URLs that contain credentials or query parameters. This is a format check on the configured key only; the adapter never decodes user tokens for identity.
4. **Injected persistence only.** The `AuthTokenStore` (`load/save/clear`) is required, and there is no browser-storage default. `createInMemoryAuthTokenStore()` keeps the session in memory only and must be chosen explicitly. Stored records are versioned and validated as untrusted input; malformed records are cleared.
5. **Fail closed:**
   - **Discards the session (store cleared):** a rejected refresh token (expired, revoked or reused), a mismatched verified identity, or a malformed stored record.
   - **Stays signed out but keeps the stored session for a retry:** network errors, timeouts, 5xx responses, rate limiting and malformed GoTrue responses.
   - **Discards and revokes newly minted tokens (best effort):**
     - an abort after GoTrue issues tokens
     - a `signOut` that races a late verify, `/user` or refresh completion
     - a store that cannot save
     - an identity mismatch
   - **Reported as failure:** a store that cannot be read or cleared.
6. **Refresh-token rotation safety.** Refresh is single-flight per refresh token. It is *not* cancelled by the caller's signal, because abandoning it could strand a consumed rotating token. The caller still gets `aborted` immediately, and the rotated tokens are saved unless a sign-out happened meanwhile.

   After GoTrue rotates the tokens, the `/user` identity check can still fail. Nothing is promoted in that case, and what happens next depends on the failure:
   - **Transient failure** (network, timeout, 429 or 5xx): the rotated pair replaces the consumed pair in the store, under the account that was *already verified*. The caller gets a retryable error. Every later promotion re-checks `/user` against that account first, so the session stays recoverable and an account switch is refused.
   - **Conclusive failure** (rejected token, malformed user) or a store that can't save: the session is terminal. The store is cleared, the rotated tokens are revoked best-effort, and the result is `expired` or a non-retryable error.
7. **No silent cross-account switch.** Restore and recover require the GoTrue identity to equal the stored account. The controller's existing `alreadyAuthenticated` guard is unchanged.
8. **Redaction.** Results and log lines are fixed strings. A test asserts that no access token, refresh token, code, email, project key or account ID appears in any non-session result or log line. The only place the token appears is `VerifiedAuthSession.token`, because the transport needs it.
9. **Guest-first.** The provider never touches guest storage. Guest data is cleared only by the accepted coordinator after a durable receipt. Integration tests show that guest data is preserved after a wrong code, unsupported Google sign-in and a revoked restore.

## 3. GoTrue email-OTP configuration: discrepancy to resolve (no config change made)

`/auth/v1/otp` sends whatever the **Magic Link** template contains. For a user who does not exist yet, the **Confirm signup** template applies when confirmations are enabled. A six-digit code reaches the reader only if the template renders `{{ .Token }}`. Supabase's default hosted Magic Link template renders only a link (`{{ .ConfirmationURL }}`). The current `supabase/config.toml` has:

- no `[auth.email.template.*]` overrides, so built-in templates are used. Whether the bundled local template includes `{{ .Token }}` was **not** verified in this session.
- no explicit `otp_length` / `otp_expiry`, so GoTrue defaults apply (6 digits, 3600 s). The adapter's client TTL (10 min) is shorter than the server TTL, which is the safe direction.
- `[local_smtp] enabled = false` and no SMTP, so a local `/otp` call has no mail sink and no way to observe the code. GoTrue may answer 5xx, which this adapter maps to a retryable `networkError` ("Email sign-in is not available right now"), never to success.

**Proposed separately approved step:** under Aaron's approval, a later config-only change should:

1. set `[auth.email] otp_length = 6` and a deliberate `otp_expiry`, for example 600;
2. add `[auth.email.template.magic_link]` and `[auth.email.template.confirmation]` content files that present `{{ .Token }}` (and optionally drop the link);
3. for local acceptance only, enable the loopback mail-capture service (`[local_smtp]`) so a guarded test can read the code.

A hosted project needs the same template and length settings, plus a real SMTP provider and rate limits. Those are launch decisions and outside this scope.

## 4. Verification actually executed (this PR)

```sh
node --experimental-strip-types --test tests/accountAuth/*.test.ts      # 75 pass, 0 fail (58 R13-2B + 17 R13-2A)
node --experimental-strip-types --test tests/accountSync/*.test.ts      # 32 pass, 0 fail, 2 skipped (pre-existing opt-in local tests)
npm run lint                                                            # clean
npm run build                                                           # tsc -b + vite build succeed
```

The new test file also type-checks cleanly under `tsc --strict --noEmit` (tests are outside `tsconfig.app.json`).

- **Fake GoTrue coverage:** request shapes and headers; the project-key allowlist; parallel OTP requests completing out of order; transient and conclusive `/user` failures after rotation, plus a sign-out racing them; sign-in for new and existing users; wrong, expired, exhausted, replayed, superseded, malformed and concurrent codes; identity mismatches; anonymous, wrong-role and malformed users; malformed and non-JSON bodies; store save, load and clear failures; network errors, 5xx, 429, timeouts and aborts before and after token issue; restore, refresh, rotation and single-flight; revoked sessions; sign-out revoke and failure; sign-out racing late verify, `/user` and refresh; redaction.
- **Controller and transport coverage:** `AccountSessionController` OTP sign-in → guest sync → sign-out; unsupported Google; revoked restore → `expired`; `SupabasePostgrestTransport` sending the provider's access token as its Bearer credential.

**Real GoTrue OTP was not tested.** This container had no running Docker daemon or Supabase CLI. Fetching the CLI binary was not permitted in this session, and the local config has no mail sink anyway (§3), so an honest real-stack OTP test is gated on the config step above. A passing fake is **not** production or email-delivery proof.

## 5. Remaining limitations and future decisions

- **Secure native store:** the Keychain/Keystore `AuthTokenStore` and the web storage policy are future, separately approved work. Until then, a caller must deliberately choose an ephemeral in-memory store.
- **Google and Apple:** OAuth/PKCE, native callbacks, redirect allow-lists, console credentials and entitlements remain unimplemented and need their own approved slice.
- **Proactive refresh:** there is no refresh timer. Callers drive `restoreSession`/`recoverSession`, and `SupabasePostgrestTransport` still expects a current token for each operation.
- **Rate limits:** server-side abuse controls (rate limits, CAPTCHA) are hosted configuration decisions, not client behaviour.
- **`isNewAccount`:** the hint is not populated. Sync mode keeps relying on authoritative remote account state.
