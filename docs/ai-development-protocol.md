# Bibleberry — AI Development Protocol

**Status:** Standing development procedure  
**Project owner:** Aaron Waid  
**Editorial and theological authority:** Alexis Waid

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
- Open a pull request targeting `main`.
- Complete the repository's pull request template.
- Do not merge the pull request or delete its development branch without Aaron's authorization.

## 2A. Incremental Delivery and Agent Recovery

AI engineering assignments must be designed for reliable delivery as well as correct implementation. These requirements apply to Kimi and any other coding agent working in this repository.

1. **Scope the assignment to an independently reviewable result.** Prefer one bounded capability per PR. Divide larger milestones into sequential PRs with explicit dependencies and acceptance criteria; do not combine an adapter, UI, integration, and release work into one large PR merely because one agent can implement them.
2. **Establish the delivery branch first.** Start from the current accepted base, create one intended feature branch, and verify that the agent can push to it before undertaking extensive implementation. Open a draft PR early when useful, but do not mark it ready or imply acceptance prematurely.
3. **Commit and push recovery checkpoints throughout implementation.** After the first coherent, testable increment, run focused checks, commit, and push. Repeat after each meaningful implementation stage. Do not wait until all coding, full regression tests, browser verification, and documentation are finished before the first code push. Keep checkpoints coherent and disclose any known failures.
4. **Use one authorized branch per assignment.** Do not create placeholder, auxiliary, fallback, or duplicate branches to work around GitHub tool failures. If the designated branch cannot be updated, stop further GitHub mutations and report the exact blocker and the last confirmed remote commit.
5. **Design for agent interruptions.** When tool reliability, session limits, context, or remaining execution capacity becomes uncertain, prioritize preserving finished work in the remote branch over starting more features. Keep handoff notes concise enough that another session can resume from the confirmed commit.
6. **Distinguish local results from delivered results.** In every handback, separately identify: work implemented locally; work committed locally; work pushed to the intended GitHub branch; and work verified by CI at the pushed head SHA. Do not claim a PR exists, a check passed, or implementation was delivered without corresponding evidence.
7. **Keep human acceptance separate.** An agent may create incremental commits and open PRs within scope, but only Aaron authorizes merge or deployment. Editorial and theological approval remains with Alexis where applicable.

A code milestone is not considered delivered solely because local implementation and tests succeeded. **Recoverability and verifiable delivery are engineering acceptance criteria.**

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

1. Open the pull request.
2. Explain what changed and why.
3. Identify anything that deviates from the approved requirements.
4. Report verification results and unresolved issues.
5. Leave the pull request open for human review.

**Only Aaron authorizes technical acceptance and merging.** Changes affecting Alexis's theological, editorial, or visual decisions require her appropriate review.

Implementation, verification, acceptance, and production release are distinct stages.

## Governing Principle

**AI coding assistants implement approved decisions; they do not independently make product decisions or authorize changes to the accepted codebase.**

This protocol applies to Kimi and any other AI coding assistant contributing to Bibleberry.
