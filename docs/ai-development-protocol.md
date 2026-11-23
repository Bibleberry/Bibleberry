# Bibleberry — AI Development Protocol

**Status:** Standing development procedure  
**Project owner:** Aaron Waid  
**Editorial and theological authority:** Alexis Waid

**Owner policy update (November 19, 2026):** Submit reviewable pull requests as **Ready for review**, not Draft, now that Bibleberry uses public-repository hosted CI. This authorizes automated checks and independent review only; Aaron alone authorizes merge or deployment. Earlier mandatory-Draft instructions in historical Issues are superseded prospectively. A Draft PR requires Aaron's specific exception.

## 0. Project Context and Continuity Between AI Sessions

Bibleberry uses multiple AI coding/research/review assistants. **GitHub is the durable shared record**; no single model's chat history, private sandbox or session notes are the sole project handoff.

**Before proposing implementation or resuming a branch:**

1. Read [Current Project Status](project/current-status.md), the **single canonical** [Product & Application Development Roadmap](product/application-development-roadmap.md), this protocol, and the **specific** assignment Issue/PR. For work touching reader behavior, consult the [November 8 approved reader experience](product/2026-11-08-approved-reader-experience-and-month-screen.md); for content schemas/editorial workflow, consult the [November 9 CMS architecture](architecture/content-management-and-publishing.md). When work involves BerryMark, also inspect its current repository, importer contracts and relevant Issue/PR.
2. **Verify live GitHub state:** current accepted `main` SHA in each affected repo, open PRs, relevant Issue comments, actual source files and last *pushed* assignment-branch commit. A dated status snapshot is a starting point, not proof of the current build.
3. Give a concise **delta since the status timestamp**: accepted changes, verified results, unfinished work, material blockers and approvals still needed. Separate implemented-on-main, proposed PR work, local-only work, external configuration and unverified reports.
4. Agree on a narrowly bounded assignment with Aaron before coding. Read the repository's authority/content protections; an aspirational roadmap bullet is not authorization to build.

**After a meaningful milestone or a material blocker/unblock:**

- Propose or make a small, evidence-linked update to `docs/project/current-status.md` with the date, accepted commit/PR or independently verified external action, remaining limitations and next step. Good triggers include a merged feature, successful real integration test, significant infrastructure change, product decision, or agent workflow blocker. **Do not rewrite it after every small commit.**
- Use one coordinated writer/PR at a time for this shared document. If a feature is still in an open PR, record it as *proposed/in review*; do not describe it as merged. A later docs PR after merge is appropriate, especially when the change originated in the separate BerryMark repo.
- Leave completed historical snapshots under `docs/project/status-history/` unchanged. Add a new snapshot only for a useful major checkpoint, not each conversation.
- Keep detailed logs, review threads, full diagnostics and work notes in scoped Issues/PRs. The status document is an operational index, **not** a second issue tracker.
- Explicitly identify the last pushed SHA, actual tests, checked CI result, outstanding blockers and any work that existed only in the agent's local workspace. When permissions or session capacity fail, preserve the last known remote state and stop claiming undelivered changes.

**R08A implementation handoff (November 9–10, 2026; historical):** For monthly publishing, local-day scheduling, CMS-to-reader identity, and Month Screen contracts, consult [R08A-0 Architecture Revision 2](architecture/r08a-0-monthly-publication-release-contract.md), especially §9's original consumer-first sequence R08A-1..R08A-6. **At that historical checkpoint**, R08A-1 was the next candidate coding scope; it was subsequently implemented in merged [PR #68](https://github.com/Bibleberry/Bibleberry/pull/68) and **must not be recommissioned**. The current canonical roadmap and verified Issues/PRs govern what remains. The design document alone does not authorize implementation, code changes, service writes or a merge.

**Document authority and nonconflicting roadmaps (November 9, 2026):** The path `docs/product/application-development-roadmap.md` is the **only active sequencing roadmap**. Its six-phase order overrides older P0/P1/P2 backlog rankings and the content-architecture document's historical Phase A–G order. The approved November 8 reader document governs *what reader behavior is required*; the November 9 CMS document governs *what editorial models/operations have been planned*, preserving the full 80-decision register. `docs/project/current-status.md` and underlying merged code/Issue evidence govern *what has been done*. A specific authorized Issue/branch/PR governs *what this agent may do now*. Do **not** follow an older “next milestone” in a dated issue, handoff, README or status section when newer accepted evidence supersedes it. Do not spawn another active roadmap file; submit changes to the existing canonical roadmap through review. The two approved Sanity datasets are `production` and `staging` only; the old `berrymark-development` dataset was deleted. The November 8 private staging Stage 3C test has **passed** ([#63](https://github.com/ContraPhilosophy/Bibleberry/issues/63)); do not restart it as missing integration work.

**Handoff principle:** A different AI assistant must be able to continue from the accepted repository state and recorded evidence without relying on hidden chat context, and without mistaking plans, unmerged PRs or claimed test results for completed work.

## 1. Before Implementation

Before making changes, the AI development assistant must:

- Read the relevant project documentation and GitHub Issue.
- Inspect the existing implementation before proposing changes.
- Distinguish approved requirements from exploratory ideas and unresolved decisions.
- Identify dependencies and possible effects on existing functionality.
- Request clarification when an unresolved decision materially affects implementation.

A planning document alone does not authorize implementation.

## 2. Branch and Pull Request Requirements

- Start from the current `main` branch.
- Create a separate branch for each appropriately scoped assignment.
- Never commit or push directly to `main`.
- Make descriptive, logically organized commits.
- Open a pull request targeting `main` as **Ready for review (non-Draft)** once a coherent change is available for automated checks and applicable review. Checks may still be running or failing when the PR opens; report their actual results. Do not use Draft by default.
- Complete the repository's pull request template.
- Do not merge the pull request or delete its development branch without Aaron's authorization.

**Review applicability and departmental ownership:** Software or technical PRs require Independent Review's exact-HEAD technical disposition. For strictly administrative or governance-documentation PRs, Aaron may explicitly determine technical Review is inapplicable and approve the change himself; record that decision transparently. This does not exempt any source-code, security, CI behavior or configuration change from applicable technical scrutiny. General Administration owns Checks & Merge (applicable CI, review evidence, integration readiness and authorized merge operations); Planning owns Project Board Stewardship; Dev manages changeable coding agents. **Only Aaron may authorize a merge.**

## 2A. Incremental Delivery and Agent Recovery

AI engineering assignments must be designed for reliable delivery as well as correct implementation. These requirements apply to Kimi and any other coding agent working in this repository.

1. **Scope the assignment to an independently reviewable result.** Prefer one bounded capability per PR. Divide larger milestones into sequential PRs with explicit dependencies and acceptance criteria; do not combine an adapter, UI, integration, and release work into one large PR merely because one agent can implement them.
2. **Establish the delivery branch first.** Start from the current accepted base, create one intended feature branch, and verify that the agent can push to it before undertaking extensive implementation. Push recoverable checkpoints to the branch while work is in progress. Once a coherent change is ready for checks/review, open a **Ready for review (non-Draft)** PR; do not wait for green hosted CI to open it. Use Draft only if Aaron explicitly authorizes an exception. **Ready means checkable and reviewable, not approved for merge.**
3. **Commit and push recovery checkpoints throughout implementation.** After the first coherent, testable increment, run focused checks, commit, and push. Repeat after each meaningful implementation stage. Do not wait until all coding, full regression tests, browser verification, and documentation are finished before the first code push. Keep checkpoints coherent and disclose any known failures.
4. **Use one authorized branch per assignment.** Do not create placeholder, auxiliary, fallback, or duplicate branches to work around GitHub tool failures. If the designated branch cannot be updated, stop further GitHub mutations and report the exact blocker and the last confirmed remote commit.
5. **Design for agent interruptions.** When tool reliability, session limits, context, or remaining execution capacity becomes uncertain, prioritize preserving finished work in the remote branch over starting more features. Keep handoff notes concise enough that another session can resume from the confirmed commit.
6. **Distinguish local results from delivered results.** In every handback, separately identify: work implemented locally; work committed locally; work pushed to the intended GitHub branch; and work verified by CI at the pushed head SHA. Do not claim a PR exists, a check passed, or implementation was delivered without corresponding evidence.
7. **Keep human acceptance separate.** An agent may create incremental commits and open PRs within scope, but only Aaron authorizes merge or deployment. Editorial and theological approval remains with Alexis where applicable.

A code milestone is not considered delivered solely because local implementation and tests succeeded. **Recoverability and verifiable delivery are engineering acceptance criteria.**

## 2B. Assignment Identity, Issue Creation & Handoff (all departments)

**Scope (November 22, 2026 owner direction):** These rules apply to **every human-directed Bibleberry assignment that will change repository files or produce a PR**, whether engineering, documentation, organizational governance, planning-originated work, maintenance or administration. They bind every AI department, coding agent, reviewer and coordination handoff. An authorized originating GitHub Issue remains the permanent assignment record; its two-word codename is the primary human-facing identity. A conversation, roadmap entry, docs suggestion or PR number is not a substitute for the Issue.

**Mandatory identity-first gate, before the first branch/file write:**
1. Verify Aaron's authorization and the actual scope, responsible department, current `main`, relevant open and closed Issues, active PRs and competing owners. A read-only investigation or recommendation needs no new Issue or codename by itself.
2. If the work continues an existing Issue, **reuse its codename and Issue**. If no Issue covers the authorized change, the appropriately authorized department must create one scoped, uniquely codenamed Issue **before creating a branch, modifying files or opening a PR**. Creating that originating Issue is the sole permitted initial repository write for establishing the new identity; it does not authorize implementation. Engineering Planning's delegated Issue creation covers only Aaron-authorized engineering planning initiatives. Non-engineering Issue creation requires Aaron's authorization under the responsible department's charter.
3. Confirm the same exact codename in the Issue title, proposed branch name and PR title, and a direct originating Issue reference in the PR body. If identity, authorization, or scope is missing or contradictory, **stop repository mutations and resolve it with Aaron**. Do not silently treat a docs, governance, hotfix or Planning-initiated change as exempt.
4. Once assigned, carry the identity through corrections, reviews, replacement PRs and conversation/department handoffs. A routine update to an existing Issue, PR or Project item **within an authorized existing assignment** keeps that assignment's identity; it does not require a duplicate Issue.

The originating Issue is the durable anchor; the codename makes it recognizable across conversations and AI platforms. This rule does not compel an Issue for casual discussion, read-only research or recommendations that never produce repository changes.

- **Assign a permanent codename when creating each new Issue for PR-producing work, and each new engineering candidate Issue.** The creator chooses exactly two ordinary, memorable words before assigning a coding agent, in title case (for example, `Blue Fox`). Check the complete Bibleberry Issue history, including open and closed Issues, first. Treat capitalization, spaces, and hyphens as equivalent when checking uniqueness; do not reuse a codename. Avoid confusing, offensive, unwieldy, or hard-to-pronounce names. Once recorded, the codename never changes, including across agent transfers, corrections, or replacement PRs. Distinct Issues need distinct codenames; multiple PRs for one Issue share its codename. Do not create a second task ID or tracking system.
- **Lead every human-directed assignment/PR name with the codename.** Use Issue title `[Blue Fox] Preserve Shelf Protection`; PR title `[Blue Fox] Implement Shelf Protection Fix`; branch `fix/issue-224-blue-fox` (or `docs/issue-224-blue-fox` for documentation), and single-Issue session title `Blue Fox | Shelf Protection | Copilot`. A new branch must use its Issue number and codename; do not force-rename an already open historical branch. Keep the originating Issue number and direct link in formal records, PR descriptions, and handoffs. Multi-Issue coordinating sessions need not use one codename; identify each assignment separately.
- **Keep PR references accurate.** The PR body explicitly links the originating Issue. Use `Refs #224` for partial work; use `Fixes #224` only when all acceptance criteria are met and the PR is intended to close the Issue. An incomplete or placeholder PR must not claim completion, regardless of PR review status. If one Issue has multiple or replacement PRs, record all their numbers, links, branches and relevant SHAs on the Issue, keeping the same codename throughout.
- **Keep the assignment record on its Issue.** Store or update a concise structured block (or one handoff comment when body editing is inappropriate) with codename; Issue number and link; short task; assigned agent; session link or `not available`; branch; all associated PR numbers/links; latest pushed HEAD SHA; verified status; next responsible person/agent; next action; and last-verified date. Mark unknown information unknown; never invent links or evidence. There is one active implementing owner per Issue; other agents may review independently.
- **Perform identity and authorization preflight before creating a branch or modifying files (all departments).** Verify the Issue number/title and codename, owner, target branch, relevant PR heads/bases and pushed SHAs, approved scope and conflicting active assignments. Confirm a new codename's uniqueness before creating its Issue. If identity, authority or scope conflicts, stop and report the mismatch to Aaron rather than guessing or editing the wrong branch. A different codename/Issue requires explicit reassignment and branch verification before work resumes.
- **Use explicit, codename-first handoffs.** Start an implementation summary with `Blue Fox | Issue #224 | PR #229 | SHA <pushed SHA> | Copilot | Implementation/next action: <action>`. Start a review with `Blue Fox | Issue #224 | PR #229 | Review`; start a checks/merge handoff with `Blue Fox | PR #229 | Checks and Merge`. Link the Issue and PR, name the next responsible person, and list commands actually run and results; identify missing or unverified evidence. Coding, independent review, CI/checks, and Aaron's final authorization are separate stages: review is not a CI pass, CI is not code approval, and no agent merges or deploys without Aaron's authorization.
- **Record ownership transfers before resuming.** The Issue must state who hands off to whom, the next action, and retained prior agent/session links when available. The incoming agent repeats preflight; a chat handoff alone does not transfer ownership.
- **Coordinate shared files.** Parallel work on separate Issues is allowed only when files/worktrees do not conflict. Sequence integrations that touch `src/App.tsx` as their Issues require; do not make competing edits concurrently.
- **Automated PR exception and prospective application.** Machine-generated dependency-maintenance PRs authored by GitHub-recognized `dependabot[bot]` or `renovate[bot]` are exempt from the *new human-assignment codename/Issue* requirement, but **not** CI, security review or Aaron's merge decision. A human-directed change submitted using automation is **not** exempt merely because a bot pushed commits. Other bots, including `github-actions[bot]`, are not automatically exempt; exceptions beyond the named automated senders require Aaron to record an explicit reason and matching check configuration. Do not retrospectively rename unrelated historical Issues, PRs, branches or conversations. Preexisting human PRs #1–#295 retain historical identity; PR #296 is being explicitly repaired under [Cobalt Ledger #297](https://github.com/Bibleberry/Bibleberry/issues/297). Once this policy is accepted, the new PR identity workflow validates human PRs #296 onward, including the originating Issue's matching codename.

## 3. Scope Control

- Implement only the approved requirements.
- Preserve existing functionality unless changes are explicitly authorized.
- Avoid unrelated refactoring, redesigns, dependency changes, or architectural changes.
- Reuse existing components and systems when appropriate.
- Do not invent theological teaching, Scripture content, editorial approvals, external URLs, or production data.
- Preserve the boundaries between the reader application, Sanity CMS, development-only features, and future account infrastructure.
- Do not deploy or publish production content without authorization.

## 4. Security and Data Protection

- Never commit credentials, API secrets, private keys, or sensitive user information.
- Do not disable security controls to make a build succeed.
- Do not introduce new dependencies without explaining their purpose.
- Explicitly identify authentication, authorization, data-storage, or security implications.
- Flag potential vulnerabilities and unresolved risks.

## 5. Verification Requirements

For every implementation, report:

- The files added, modified, or deleted.
- The actual tests and build commands executed.
- Which checks passed or failed.
- Any untested functionality or environments.
- Known bugs, limitations, and potential regressions.

Use the existing GitHub Actions checks where applicable. A successful compilation is not equivalent to complete functional verification.

Do not claim tests were performed unless they were actually executed.

## 6. Completion and Acceptance

When implementation is finished:

1. Open or update a **Ready for review (non-Draft)** pull request for a coherent, checkable change. Tests and hosted CI need not already be green; report their actual status and limitations. Do not create Draft PRs by default.
2. Explain what changed and why.
3. Identify anything that deviates from the approved requirements.
4. Report verification results and unresolved issues.
5. Leave the pull request open for human review.

**Ready for review does not mean code approved, checks passed, or permission to merge.** Agents may open Ready PRs without a separate promotion authorization; **only Aaron authorizes technical acceptance, merging and deployment.** Changes affecting Alexis's theological, editorial, or visual decisions require her appropriate review.

Implementation, verification, acceptance, and production release are distinct stages.

## Governing Principle

**AI coding assistants implement approved decisions; they do not independently make product decisions or authorize changes to the accepted codebase.**

This protocol applies to Kimi and any other AI coding assistant contributing to Bibleberry.
