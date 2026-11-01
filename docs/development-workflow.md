# Bibleberry Development Workflow

**Status:** Working development procedure
**Established:** October 31, 2026

## Project Organization

- **Docs:** Preserve product decisions, architecture, requirements, and design history.
- **Issues:** Track actionable work, bugs, and decisions that need attention.
- **Projects:** Show the current status of work across the project.
- **Branches:** Isolate proposed changes from the accepted codebase.
- **Pull Requests:** Review and verify changes before merging them into main.

## Development Statuses

1. **Backlog:** Planned work or ideas requiring consideration.
2. **Ready:** Approved and sufficiently defined for implementation.
3. **In Progress:** Actively being developed.
4. **Review:** Implementation finished, awaiting verification or approval.
5. **Done:** Work has been accepted and completed.

## Development Procedure

1. Discuss the concept and investigate relevant technical considerations.
2. Record significant decisions and unresolved questions in documentation.
3. Create an Issue with a defined scope and acceptance criteria.
4. Create a development branch for the work.
5. Implement and test the changes.
6. Open a Pull Request for review.
7. Verify the implementation and check for regressions.
8. Merge approved changes into main and close the Issue.

## Weekly Operating Review

**Cadence:** Once each working week, usually at the start of the week, with Aaron choosing when it is useful. Aim for **10–15 minutes**. This is a quick coordination check, **not** a standing meeting invite, automated task, or daily reporting requirement.

Use the existing **Bibleberry Development** GitHub Project board for work status, linked Issues and pull requests (PRs) for evidence, and `docs/` for decisions and requirements. Do not create duplicate project boards, convert the entire brainstorming archive into Issues, or treat ideas as approved work.

### Five questions

1. **Completed:** What was accepted or merged since the last review? Confirm the related Issues and board entries are **Done**. A green build alone does not mean a feature is accepted or released.
2. **In progress:** Which approved, scoped Issues are actually being worked on? Make sure they reflect **In Progress**, have an owner/next action, and are not stalled by an unreviewed PR.
3. **Blocked:** What cannot proceed, why, and who can resolve it? Mark the affected Issue with a **blocked** label **if that label is configured**; otherwise write **Blocked: [reason / owner / next decision]** in the Issue or project item. Keep the existing five board statuses; do not invent a sixth column solely for blockers.
4. **Decisions needed:** Which questions require Aaron's product/technical decision or Alexis's editorial, theological, or ministry-facing visual approval? Keep these visibly pending, with links to the governing document. Unresolved ideas are **not** automatically Ready for coding.
5. **Next priority:** Select only the next highest-priority **approved and well-scoped** assignment(s), with an Issue, acceptance criteria, and dependencies understood. Move to **Ready** only when implementation is authorized. Do not start work just because it appears in a document.

### During the review

- Reconcile existing board statuses: **Backlog → Ready → In Progress → Review → Done**. Use **Review** for a PR awaiting independent verification and Aaron's acceptance, not an implied pass. Do not automatically move issues to Done when code is merely written.
- Check open PRs for required CI status, reported functional/regression checks, unresolved comments, and required editorial approvals. Follow [AI Development Protocol](ai-development-protocol.md) and [Regression Smoke-Test Checklist](testing/regression-smoke-checklist.md).
- Distinguish **documented**, **approved**, **implemented**, **verified**, **merged**, and **released**. Capture scope changes and major decisions in the relevant `docs/` file, with an Issue/PR link.
- Keep issues concise and avoid recurring duplicate tickets or a large status report. The weekly review can be handled asynchronously in conversation and the GitHub board.

### Minimal weekly handoff template

Copy this into a short conversation note or an existing working Issue comment **only when useful**; no need to create a new Issue every week.

```text
Week of YYYY-MM-DD
Completed / merged: [PR or Issue links; verified status]
In progress: [Issue links; owner and next step]
Blocked: [Issue link; reason; who can unblock] or None
Decisions needed: [decision, authority, link] or None
Next approved priority: [Issue, goal, dependency]
Release/security watch: [only if an actionable risk or milestone changed]
```

**Authority:** Aaron prioritizes and accepts technical/product work and authorizes merges/releases. Alexis retains the appropriate editorial, theological, and visual approval. Kimi, Copilot, ChatGPT, and other AI collaborators may prepare implementation reports, review evidence, and suggest prioritization, but they **do not** decide product scope, declare unperformed tests passed, or authorize merging/release.

## Project Principles

- Exploratory ideas are not automatically approved requirements.
- Alexis retains authority over theological and editorial decisions.
- Aaron coordinates product development and technical decisions.
- AI coding assistants implement scoped instructions; they do not independently authorize product changes.
- Existing functionality must be preserved unless a change is explicitly approved.
- Documentation, implementation, verification, and release are separate stages of completion.

This document will evolve as the development process matures.
