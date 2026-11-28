# Bibleberry AppDev — November 6, 2026 end-of-day handoff

**Prepared:** November 6, 2026 (America/New_York)  
**Purpose:** Start the next ChatGPT/AppDev session from verified GitHub state and the latest A3 architectural decisions.  
**Authority:** Aaron approves product/engineering scope, PR merges and releases; Alexis approves theological/editorial material and appropriate ministry-facing visuals.

> **Read first:** [AI development protocol](../../ai-development-protocol.md), [current status](../current-status.md), [product roadmap](../../product/application-development-roadmap.md), and [Track A A3 Issue #46](https://github.com/Bibleberry/Bibleberry/issues/46). Then verify current branches, PRs and CI. This handoff is a dated checkpoint, not a claim of continuous monitoring.

## 1. GitHub snapshot taken at end of November 6

- **Bibleberry main:** f2461e4edfdfeff62e2a0578489428b0f8f33a4f ([commit](https://github.com/Bibleberry/Bibleberry/commit/f2461e4edfdfeff62e2a0578489428b0f8f33a4f)).
- **BerryMark main:** d94d5fa01d7b423650527d00f802ee0356362c6f ([repository](https://github.com/ContraPhilosophy/BerryMark)).
- **Open Bibleberry PRs:** none at this check.
- **A3 implementation branch:** feat/46-reader-participation-state exists, but its remote SHA was still identical to Bibleberry main. **No A3 implementation commit or PR was present at this check.** Argon may have advanced it afterward; recheck.
- **Prior milestones:** [PR #42](https://github.com/Bibleberry/Bibleberry/pull/42) A1, [PR #45](https://github.com/Bibleberry/Bibleberry/pull/45) A2, [PR #43](https://github.com/Bibleberry/Bibleberry/pull/43) and [PR #47](https://github.com/Bibleberry/Bibleberry/pull/47) product docs are all merged.
- **Issues:** [#41](https://github.com/Bibleberry/Bibleberry/issues/41) Track A umbrella, [#44](https://github.com/Bibleberry/Bibleberry/issues/44) A2, [#46](https://github.com/Bibleberry/Bibleberry/issues/46) A3, [#22](https://github.com/Bibleberry/Bibleberry/issues/22) Hub/Field Notebook design, and [#25](https://github.com/Bibleberry/Bibleberry/issues/25) secure CMS integration were open. Do not assume their state reflects implementation status without reading merged PRs.
- The existing shell and synthetic A2 pilot are **not** production CMS-backed Today/Archive participation. The three-pass smoke suite was reported passing for the merged A2 PR; no new A3 tests were run in this handoff.

## 2. Latest product clarification: installed mobile application first

Aaron explicitly clarified that the expected primary Bibleberry experience is **an installed iOS/Android app**. A hosted web app can also exist, but is secondary. React/TypeScript/Vite is the interface implementation choice, **not** a commitment to a browser-only product.

Consequences for architecture:

1. The A3 participation model and state store are **platform-neutral**. Browser localStorage is only a web/development guest driver, not a permanent reader-domain dependency or promised native storage choice.
2. The store must support **asynchronous initialization and writes**, since native storage and cloud adapters may be async.
3. Native packaging technology is **undecided**. Capacitor (with Preferences or a more suitable native store) is a candidate, not approved/installed in A3.
4. A future authenticated Supabase account remains the working path for **recoverable cross-device progress**, distinct from one-device guest storage. Native guest storage is also not guaranteed after uninstall.
5. Bring the native packaging choice earlier in roadmap/release planning so authentication, notifications, deep links and real-device acceptance can be designed around the chosen platform.

See [User accounts and sync](../../architecture/user-accounts-and-sync.md), [Release readiness](../../release/release-readiness-and-rollback.md), and the latest section in [Issue #46](https://github.com/Bibleberry/Bibleberry/issues/46).

## 3. A3 design: revisions accepted in principle

Argon produced an initial design, an architecture-revision response addressing our cross-system review, and a native-app-first persistence addendum. The latest recommendation was to **authorize bounded A3 Phase 2 implementation**, using the existing feat/46-reader-participation-state branch, with a PR for independent review and **no merge without Aaron**. The implementation authorization message was prepared in chat; branch creation was independently observed, but delivery of that message and local engineering progress were not independently inspected.

**Domain record model:**

- Minimal persisted facts: distinct completed Challenge IDs with original **local calendar completion dates**, in-progress screen/started status, saved Challenges, saved Scripture **references + translation metadata** (not passage text), and one last-opened pointer. No comprehensive event ledger, punitive streak, automatic attendance tracking or memorization state.
- Canonical CMS Challenge IDs use a namespace-qualified Sanity base document identity (cms:<Sanity base ID>), not the presentation slug/date. BerryMark currently derives imported Sanity IDs from authored slugs and is **create-only**, so editorial identity must remain pinned once imported; identity-preserving reimport/renaming is a separate future problem. Exceptional replacement aliases are only from trusted declared editorial mappings, never title similarity.
- A completed Challenge counts **once**, including on reread, and original completion date remains stable. Navigating back to Screen 1 does not erase started status; one-screen formats are supported.
- Saving Scripture and saving/completing a Challenge are independent. Reference+translation normalization deduplicates saved Scriptures. WEBP is an intentional in-app translation; memorization tools are not A3 scope.
- The CMS release-admission seam must not confuse well-shaped IDs or TypeScript objects with proof of actual editorial publication and release eligibility. Final reader catalog/release enforcement belongs to the subsequent integration work.

**Persistence architecture:**

- Platform-neutral participation store with cached React-stable snapshots, hydrating/ready lifecycle and injected persistence adapter.
- A replaceable key/value driver: web localStorage **now for the hosted web/development route**; future async native storage choice without changing the domain model or Challenge player.
- Maintain last confirmed committed data plus an ordered queue of pending commands; **do not lose optimistic saves/completions after failed writes**, external refreshes, or retries.
- Serialize in-flight async writes. Test that **Reset local app data** cannot be reversed by an older delayed write completing afterward.
- Existing A2 in-memory pilot remains isolated. A separate opt-in A3 persistence pilot uses its own flag, storage key and pilot: identity namespace and stays out of the standard public build.
- Document the narrow race limit of simple localStorage cross-tab read-modify-write; do **not** falsely claim atomic cross-tab transactions.

**Explicit A3 exclusions:** Capacitor installation, Supabase/auth, achievements, Field Notebook UI, Hub redesign, Biblical Discovery interactions, live Today/Archive CMS publication wiring, detailed interaction logging, and BerryMark importer/schema revisions.

**Test expectation:** typecheck/lint/build, participation reducer/identity/admission/alias tests, async hydration + early commands, slow concurrent writes, failure/retry, reset-in-flight, privacy/reset, dedicated A3 pilot real-reload Playwright, and regression of all preexisting smoke passes. Review *actual pushed commits and CI*, not an agent summary.

## 4. Next-chat operating instructions

1. Reopen [Issue #46](https://github.com/Bibleberry/Bibleberry/issues/46) and inspect **current** feat/46-reader-participation-state branch and any new PR. Compare to main; if implementation was pushed, review code/diff, relevant tests, build isolation and CI before recommending merge.
2. If the branch is still at base, check whether Argon has started work. The approved direction is **A3 Phase 2 implementation** following the final native-first addendum, but do not claim code exists until verified.
3. Preserve the standing protocol: protected main, one scoped feature branch, checkpoint commits and PR, independent review, Aaron-only merge approval. No unapproved changes to production Sanity or secrets.
4. After A3 acceptance, plan next Track A milestones: **A4** controlled, released CMS Challenge integration into ordinary reader and **A5** Hub/entry coordination. Keep Hub and Field Notebook visual/product design in [Issue #22](https://github.com/Bibleberry/Bibleberry/issues/22), subject to Alexis's applicable approval.
5. Elevate **native iOS/Android delivery technology** as an early product/technical decision under R20. Research and select deliberately rather than slipping browser assumptions into interfaces. Do not infer that Capacitor or a native adapter is already implemented.

## 5. Project context not to lose

- The reader is free; accounts remain optional. Readers can catch up on past Challenges without penalty. Lifetime progress derives from **distinct Challenge completion records**, not clicks or repeated completion.
- Gamification: earned dates, monthly full-set commemoratives and editorially driven themed mini-collections; hybrid visible/hidden collectible goals; **no punitive streaks, mandatory reading timers or completion of optional studies**. Field Notebook visuals and precise achievement UX await relevant approval.
- **Biblical Discovery** replaces the proposed compulsory weekly verbatim Scripture-memorization Challenge; it remains editorially open and is **not yet built**. The historical memorization pilot remains dev-only.
- Alexis's substantial teaching dictates content/screen length and optional depth; the CMS/player must adapt to it. Avoid shortening teaching to satisfy technical templates.
- Test on older/low-end Android devices before launch; desktop Chromium success alone is not native device acceptance.
- Primary mobile-app ambition, carefully bounded local records and eventual account recovery are complementary, not contradictory.

**Current decision point:** Wait for Argon's actual A3 branch/PR progress, then independently review. There is no need to reopen the complete architecture discussion unless concrete implementation reveals a new blocking issue.
