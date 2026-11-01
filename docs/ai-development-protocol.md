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
