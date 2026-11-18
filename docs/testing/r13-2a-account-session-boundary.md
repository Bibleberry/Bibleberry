# Bibleberry R13-2A — Provider-Neutral Optional Authentication Session Lifecycle & Safe Sync Boundary

**Issue:** [#179](https://github.com/Bibleberry/Bibleberry/issues/179) (`R13-2A` / Phase 05)  
**Base Branch:** `Bibleberry/Bibleberry` `main` (`6d6c580`)  
**Scope Boundary:** Isolated, provider-neutral optional authentication provider interface (`src/accountAuth/provider.ts`), testable session state controller (`src/accountAuth/controller.ts`), deterministic mock provider (`src/accountAuth/mockProvider.ts`), unit/lifecycle tests (`tests/accountAuth/accountAuthSession.test.ts`), and this architecture/testing note. Zero live Supabase connections, OAuth setup, OTP emails, credentials, database writes, or account UI are included.

---

## 1. Purpose and Architectural Boundary

R13-2A establishes the asynchronous authentication session lifecycle and safe account-sync invocation boundary between future sign-in providers (R13-2B) and the accepted R13-1 guest-to-account sync coordinator (`coordinateGuestSync` in `src/accountSync/coordinator.ts`).

### Approved Authentication Methods Supported

Per `docs/architecture/user-accounts-and-sync.md`, the `AuthMethod` union (`src/accountAuth/types.ts`) supports:
- `'google'` — Continue with Google
- `'apple'` — Continue with Apple
- `'emailOtp'` — Continue with passwordless 6-digit email verification code (`signIn` -> `'awaitingEmailOtp'` -> `verifyEmailOtp`)

### Core Safety & Authority Invariants

1. **Optional authentication (guest-first):** `AccountSessionController` initializes in `{ status: 'guest' }` without requiring sign-in.
2. **No client-side server authority:** `validateVerifiedAuthSession` rejects any session lacking `verificationSource: 'serverVerified'`, a valid canonical `AccountId` (`parseAccountId`), an approved `AuthMethod`, or a non-expired `expiresAt` timestamp. Client-supplied account IDs or unverified tokens are never promoted to `'authenticated'` or passed to `coordinateGuestSync`.
3. **Guest-data preservation:** `AccountSessionController` never clears guest storage directly. It delegates exclusively to `coordinateGuestSync` (`src/accountSync/coordinator.ts`), which enforces `canSafelyClearGuestStorage` and R13-0 reconciliation rules. Any authorization failure, network failure, cancellation, reconciliation rejection, or in-flight local mutation leaves guest data intact (`guestCleared: false`).
4. **Concurrency & duplicate sign-in guards:** Monotonic `operationEpoch` and scoped `AbortController` instances prevent duplicate parallel sign-ins (`signInAlreadyInProgress`), silent cross-account switching (`alreadyAuthenticated`), and stale async completions after `cancelSignIn()` or `signOut()`.
5. **Privacy & dependency isolation:** Log and error messages pass through `sanitizeLogMessage`. `src/accountAuth/**` has zero imports from `@supabase/`, `@capacitor/`, `react`, `node:`, or browser DOM/storage globals.

---

## 2. Session State Machine

| State | Meaning | Allowed Transitions |
| --- | --- | --- |
| `guest` | Default unauthenticated mode | `restoreSession()` -> `restoring`; `signIn()` -> `signingIn`; `recoverSession()` -> `restoring` |
| `restoring` | Checking/restoring or recovering session | `guest`, `authenticated`, `expired`, `cancelSignIn()` -> `guest` / `expired` |
| `signingIn` | OAuth or OTP verification in progress | `authenticated`, `awaitingEmailOtp`, `guest`, `expired`, `cancelSignIn()` -> `guest` / `expired` |
| `awaitingEmailOtp` | Waiting for 6-digit email verification code | `verifyEmailOtp()` -> `signingIn`; `cancelSignIn()` -> `guest` |
| `authenticated` | Server-verified session active (`syncStatus`: `idle \| syncing \| synced \| syncFailed`) | `syncGuestToAccount()` / `retrySync()`; `signOut()` -> `signingOut` -> `guest`; expiry / `authFailure` -> `expired` |
| `expired` | Session expired or authorization failed; guest data preserved | `recoverSession()` -> `restoring`; `signIn()` -> `signingIn`; `signOut()` -> `signingOut` -> `guest` |
| `signingOut` | Revoking session | `guest` (even if remote sign-out encounters `networkError`) |

---

## 3. Verification

### Focused Tests
- `node --experimental-strip-types --test tests/accountAuth/*.test.ts` (14/14 passing)
- `node --experimental-strip-types --test tests/accountSync/*.test.ts` (20/20 passing)

### Lint & Build
- `npm run lint`
- `npm run build`
