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
- Each dated experience is a **Challenge** (teaching, guided discipline, reflection/worksheet, memorization). Opening, saving, resuming and completing are different events.
- Alexis's teaching determines content length and structure: no arbitrary screen/card/word limits, forced shortening, or required optional content. Preserve the mature field-notebook aesthetic unless a change is approved.
- Preserve manuscript and prayer text. Do not invent Scripture, Greek explanations, teaching, links, research, release dates or approvals. Alexis must review editorial adaptations and proposed deeper studies.
- Deeper studies, reflections and companion resources stay optional. Respect Bible text licensing: a reference-only verse is not rights-cleared full passage text or enabled memorization.
- No leaderboards, holiness scores, punitive attendance streaks, locked teaching, or awards for missed days. Distinguish release date, completion time and achievement earned time. Exact badges, artwork, Special Events and consecutive-release-date criteria remain **unapproved**. See `docs/product/gamification-and-achievements.md`.

## Change control and safety
- Only implement a scoped approved assignment. Branch from `main`; never push directly to `main`. Open a PR, await Aaron's acceptance, and do not merge, delete the branch or deploy without authorization.
- Preserve existing behavior. Avoid unrelated refactoring, dependencies, CMS-to-reader integration, auth, private data collection, native packaging or production publishing without explicit approval.
- Never commit credentials or sensitive data, weaken security or fabricate production records. Flag auth, row-level security, privacy, migrations, recovery, costs and data-loss implications where applicable.

## Verification and review
- Reader: `npm ci`, `npm run build`, `npm run lint` (separate pre-existing lint findings). Studio: `cd studio && npm ci && npm run typecheck && npm run build`. CI builds both on PRs.
- Test changed behavior and regression risks. For UI changes check mobile, keyboard and screen readers; verify normal production builds omit testing tools.
- Report changed files, exact checks/results, untested areas and risks. Never claim unrun tests; compilation alone is not functional proof.
- Prioritize correctness, security, data integrity, editorial boundaries and regressions over style nitpicks. Copilot's review is not human acceptance.
