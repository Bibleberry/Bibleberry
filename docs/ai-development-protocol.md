# Bibleberry — AI Development Protocol

**Status:** Standing development procedure  
**Project owner:** Aaron Waid  
**Editorial and theological authority:** Alexis Waid

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
