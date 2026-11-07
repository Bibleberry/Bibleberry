# Bibleberry: GitHub Copilot instructions

## Authority and source of truth
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
- Alexis's teaching determines content length and structure: no arbitrary screen/card/word limits, forced shortening, prescribed four-week Discovery rotation, or required optional content. The Field Notebook's visual direction comes from **Alexis's actual hand-illustrated biblical notebooks**, with final artwork/layout requiring Alexis's approval. Keep the **Challenge reader** focused; the **Hub** is for tasteful discovery of teaching and resources.
- Preserve manuscript and prayer text. Do not invent Scripture, Greek explanations, teaching, links, research, release dates or approvals. Alexis must review editorial adaptations and proposed deeper studies.
- Deeper studies, reflections and companion resources stay optional. **WEBP is intentionally chosen** as Bibleberry's primary free-use in-app Bible text. Respect licensing: a reference-only verse is not rights-cleared full passage text or enabled memorization. **Save Scripture** from anywhere remains the goal; an optional 'Memorize with Your Bible' guide is exploratory, **not approved launch functionality**. Do not force readers to leave Bibleberry to complete ordinary Challenges.
- No leaderboards, holiness scores, punitive attendance streaks, locked teaching, or awards for missed days. Distinguish editorial release dates and minimal completion records from earned achievement dates. **Lifetime completion and monthly content-derived achievements** lead the progression; **Special Experiences may be time-limited in principle** with permanent earned-only collectibles and a category hidden until first earned. Particular events, criteria, artwork and implementation remain **unapproved**. The Field Notebook's Hub entry may show a temporary 'New Discoveries' indicator. See `docs/product/gamification-and-achievements.md` and `docs/product/2026-11-06-design-session-record.md`.

## Change control and safety
- Only implement a scoped approved assignment. Branch from `main`; never push directly to `main`. Open a PR, await Aaron's acceptance, and do not merge, delete the branch or deploy without authorization.
- Preserve existing behavior. Avoid unrelated refactoring, dependencies, CMS-to-reader integration, auth, private data collection, native packaging or production publishing without explicit approval.
- Never commit credentials or sensitive data, weaken security or fabricate production records. Flag auth, row-level security, privacy, migrations, recovery, costs and data-loss implications where applicable.

## Verification and review
- Reader: `npm ci`, `npm run build`, `npm run lint` (separate pre-existing lint findings). Studio: `cd studio && npm ci && npm run typecheck && npm run build`. CI builds both on PRs.
- Test changed behavior and regression risks. For UI changes check mobile, keyboard and screen readers; verify normal production builds omit testing tools.
- Report changed files, exact checks/results, untested areas and risks. Never claim unrun tests; compilation alone is not functional proof.
- Prioritize correctness, security, data integrity, editorial boundaries and regressions over style nitpicks. Copilot's review is not human acceptance.
