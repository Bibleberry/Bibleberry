# Bibleberry: GitHub Copilot instructions

## Authority and source of truth
- **CURRENT PRODUCT AUTHORITY, NOVEMBER 8:** Read [`docs/product/2026-11-08-approved-reader-experience-and-month-screen.md`](../docs/product/2026-11-08-approved-reader-experience-and-month-screen.md) first for Month Screen, Shelf/Library, discovery, Finish, Hub announcements, welcome preview and guest merges. It explicitly overrides contradictory older Issues, proposals and November 7 text. Aaron approved these product behaviors; no code implementation is implied.
- Follow `docs/ai-development-protocol.md`, `docs/development-workflow.md`, approved Issues and `.github/pull_request_template.md`. Inspect relevant code before editing.
- Aaron Waid approves technical scope, merges and releases. Alexis Waid approves theology, editorial adaptations and ministry-facing visual decisions.
- Planning documents mix agreed principles with **unapproved proposals**. Discussion, fixtures or mockups are not implementation authorization. Identify open decisions; do not resolve them independently.
- "Bibleberry" is a provisional app name; Realigned is a separate podcast.

## Actual codebase
- Reader: React 19, TypeScript and Vite in `src/`; see `src/App.tsx`, `src/components/`, `src/data/`. Preserve existing mobile UI and accessibility.
- Sanity 6 Studio is a separate `studio/` workspace; schemas: `studio/schemaTypes/`; templates: `studio/initialValues/`. The reader is NOT yet connected to it. Sanity is for editorial content, not private user progress.
- Developer Studio and Interactive Challenge Lab are **testing-only**. Preserve `VITE_ENABLE_DEVELOPER_STUDIO`, isolated browser storage, and their exclusion from public builds.
- Local prototype state is not cloud sync. Supabase and Google/Apple/email-code login are a **working direction, not build approval**. See `docs/architecture/user-accounts-and-sync.md`.

## Product and editorial rules
- Each dated experience is a **Challenge** (substantive teaching, guided discipline, reflection/worksheet, and **Biblical Discovery** in the intended Sunday slot). The older WEBP memorization weekly pilot is a **test fixture, not current approved launch scope**. Opening, saving, resuming and completing are distinct actions. See `docs/product/biblical-discovery-and-scripture.md`.
- Alexis's teaching determines content length and structure: no arbitrary screen/card/word limits, forced shortening, prescribed four-week Discovery rotation, or required optional content. The Field Notebook's visual direction comes from **Alexis's actual hand-illustrated biblical notebooks**, with specific artwork/layout still a deferred design task subject to Aaron's product approval. Alexis's underlying teaching and editorial authority remain protected. Keep the **Challenge reader** focused; the **Hub** is for tasteful discovery of teaching and resources.
- Preserve manuscript and prayer text. Do not invent Scripture, Greek explanations, teaching, links, research, release dates or approvals. Alexis must review editorial adaptations and proposed deeper studies.
- Deeper studies, reflections and companion resources stay optional. **WEBP is intentionally chosen** as Bibleberry's primary free-use in-app Bible text. Respect licensing: a reference-only verse is not rights-cleared full passage text or enabled memorization. **Save Scripture** from anywhere remains the goal; an optional 'Memorize with Your Bible' guide is exploratory, **not approved launch functionality**. Do not force readers to leave Bibleberry to complete ordinary Challenges.
- No leaderboards, holiness scores, punitive streaks, locked teaching, rewards for missing days, or universal completion timers. **For current Field Notebook behavior, read `docs/product/gamification-and-achievements.md` and its explicit current/historical/open decision-status map; November 6 records and older Issue #22 content are history where superseded.** The Notebook is always present and awards remain automatic, even if announcements are disabled. Distinct Challenge completions advance **one evolving lifetime status**, not collectible milestone badges. Thematic and full-month completion each earn **permanent illustrated Scripture cards**; completed Library Challenges count. Hub 'New Discoveries' clears when the Notebook opens; each card remains 'New' until opened. No announcement interrupts a Challenge reader. The final teaching action says **Finish** and records completion; progress updates silently in the new calendar **Month Screen**. Pending card announcements appear **only on Hub arrival**. Unearned goals show title/progress only, never artwork or qualifying Challenge locations; earned badge thumbnails open their cards. Month preview opens on the previous 28th (Feb 27), with welcome gated until month start. Special Experiences have an approved category principle but **no specific event or engineering work is authorized**. Preserve the separate publication, completion and earned dates.

## Change control and safety
- Only implement a scoped approved assignment. Branch from `main`; never push directly to `main`. Open a PR, await Aaron's acceptance, and do not merge, delete the branch or deploy without authorization.
- Preserve existing behavior. Avoid unrelated refactoring, dependencies, CMS-to-reader integration, auth, private data collection, native packaging or production publishing without explicit approval.
- Never commit credentials or sensitive data, weaken security or fabricate production records. Flag auth, row-level security, privacy, migrations, recovery, costs and data-loss implications where applicable.

## Verification and review
- Reader: `npm ci`, `npm run build`, `npm run lint` (separate pre-existing lint findings). Studio: `cd studio && npm ci && npm run typecheck && npm run build`. CI builds both on PRs.
- Test changed behavior and regression risks. For UI changes check mobile, keyboard and screen readers; verify normal production builds omit testing tools.
- Report changed files, exact checks/results, untested areas and risks. Never claim unrun tests; compilation alone is not functional proof.
- Prioritize correctness, security, data integrity, editorial boundaries and regressions over style nitpicks. Copilot's review is not human acceptance.
