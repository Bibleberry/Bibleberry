# Agent Assignment Register

The permanent two-word codename is the primary human-facing name for a new assignment; its originating GitHub Issue remains the authoritative record and technical anchor. This page is only a finding aid. **Live GitHub Issue/PR status overrides this dated index.**

Use the [Codename Registry](../ai-operations/codename-registry.md) before creating any authorized new codenamed Issue. Use the originating Issue number and link with its codename through every PR, transfer, review, correction, and replacement PR.

At assignment or handoff, start from the Issue: verify its number/title/codename, assignee, scope, acceptance criteria, latest ownership record, linked PR(s), their base/head/SHA and checks, and any conflicting work. Confirm the current branch before editing. If identity or ownership does not match, stop and ask Aaron; never guess or switch assignments. Keep one active implementing owner per Issue. Record assignment, PR transitions, current evidence, and next action on that Issue.

Existing work without a codename remains uncodenamed unless Aaron authorizes its creator to add one at a later handoff. Do not retroactively rename Issues, PRs, branches, or conversations, and do not invent names to fill this index. The entries below retain their original Issue identifiers as a **historical snapshot**, not as the naming convention for new assignments. Update this index at meaningful handoffs/checkpoints, not after every commit. Unknown session links stay “not available”; never fabricate them.

## Active-work index — checked 2026-11-19

GitHub Issues and PRs below were checked live on 2026-11-19. Current `main` was `71498f628a0182ba09e6c9d687d957db8e13378f`. No agent-session links were available in the checked records. This is a dated snapshot; recheck linked records before acting.

- **I-212 | Shelf protection transfer** — [Issue #212](https://github.com/Bibleberry/Bibleberry/issues/212) · [PR #217](https://github.com/Bibleberry/Bibleberry/pull/217) · assigned agent: Copilot; human owner: Aaron. Issue closed; PR merged at reviewed head `4f68b05cc79a964fca02f510008f0d94bcaa56ae`. The independent review approved the code and handed off to Checks and Merge; PR and Issue are now closed. **Next:** none for this closed assignment unless Aaron authorizes further work.
- **I-213 | Onboarding replay** — [Issue #213](https://github.com/Bibleberry/Bibleberry/issues/213) · [PR #218](https://github.com/Bibleberry/Bibleberry/pull/218) · assigned agent: Copilot; human owner: Aaron · `copilot/expose-accepted-onboarding-replay` · `7ae2e35e0fd75aa8aec668d391df13d7ef26009b`. Issue open; PR open Draft. PR states no implementation changes and no tests run. The review sequence puts this `src/App.tsx` work after #214/#219. **Next:** resume only after the #214 integration slot is complete and Aaron confirms the handoff.
- **I-214 | Save Scripture integration** — [Issue #214](https://github.com/Bibleberry/Bibleberry/issues/214) · [PR #219](https://github.com/Bibleberry/Bibleberry/pull/219) · assigned agent: Copilot; human owner: Aaron · `copilot/attach-save-scripture-control` · `d5ca8d3e76c0263dabbba2d4da7ffd17cb57f9ea`. Issue open; PR open Draft with no changed files and no tests. Independent review selected this as the first ordinary `src/App.tsx` integration, after syncing with updated `main`; #218 follows. **Next:** assigned implementer syncs with current `main`, implements and verifies the scoped integration, then requests review at a new SHA.
- **I-215 | Hub Continue** — [Issue #215](https://github.com/Bibleberry/Bibleberry/issues/215) · [PR #220](https://github.com/Bibleberry/Bibleberry/pull/220) · assigned agent: Copilot; human owner: Aaron. Issue closed; PR merged at reviewed head `31bc5ee93d366e7f38d06a8f799612b914cbd84d`. Independent review approved the fail-closed adapter seam only; its review explicitly says the ordinary Today shell remains unwired and must not be represented as complete. **Next:** none for this closed assignment; any later shell integration requires a separately authorized, sequenced Issue.
- **I-216 | Issue audit** — [Issue #216](https://github.com/Bibleberry/Bibleberry/issues/216) · [PR #221](https://github.com/Bibleberry/Bibleberry/pull/221) · assigned agent: Copilot; human owner: Aaron · `copilot/audit-stale-issues-evidence` · `298c24de4bdaa6d3e1593f0c7a0adb6a6a273fd1`. Issue open; PR merged after an independent documentation review approved the corrected evidence table. **Next:** Aaron reviews the audit and decides whether to close #216 or create follow-up work; the PR merge alone does not close the Issue.

This is a dated snapshot, not an authority for current ownership or status. Recheck the linked live records before acting; only Aaron authorizes merge or an ownership transfer.

## Copy/paste assignment record

Keep the canonical record on the originating Issue:

```text
<Codename> | Issue #<N> | <short task description>
Originating Issue: <direct URL>
Assigned coding agent: <one active implementer>
Agent session: <direct URL or not available>
Development branch: <branch or not assigned>
Associated PRs: <# and direct URL for each, or none yet>
Latest pushed HEAD SHA: <full SHA or not available>
Verified status: <state, evidence, and date>
Next responsible agent/person: <name or role>
Next required action: <concrete action>
Last verified: <YYYY-MM-DD>
```

For an existing Issue with no codename, write `Codename: not assigned (existing work; do not invent)` and continue to identify it by its Issue number/link. Record the allocated codename before assigning a new Issue to an agent.

## Copy/paste implementation handoff

```text
<Codename> | Issue #<N> | PR #<N> | SHA <pushed SHA> | <agent> | Implementation/next action: <action>
Issue: <direct Issue URL>
PR: <direct PR URL>; branch/base: <branch> → <base>
Status: <what changed and evidence-backed state>
Checks run: <commands and actual results>
Not run/unverified: <missing evidence>
Next responsible person: <name or role>
```

## Copy/paste independent review handoff

```text
<Codename> | Issue #<N> | PR #<N> | SHA <reviewed SHA> | Review
Issue: <direct Issue URL>
PR: <direct PR URL>
Verdict: <approved for stated scope / changes requested / hold>
Findings: <specific findings or none>
Evidence inspected: <files, tests, and checks actually inspected or run>
Not run/unverified: <missing evidence>
Next responsible person: <implementer or Checks and Merge>
Next action: <specific action>
```

## Copy/paste Checks and Merge handoff

```text
<Codename> | Issue #<N> | PR #<N> | Checks and Merge
Issue: <direct Issue URL>
PR: <direct PR URL> | SHA <checked SHA> | base <base branch>
Review disposition: <independent review state>
CI/checks: <actual state and links; distinguish skipped/pending/failing/passing>
Merge readiness: <evidence-backed state>
Next action: <specific action>
Authorization: Aaron alone authorizes merge/deployment; do not merge without it.
```

Implementation, independent review, CI/checks, and human acceptance are separate. A reviewer gives a scoped verdict, Checks and Merge reports actual check state and readiness, and Aaron alone authorizes merge. Record ownership transfers on the Issue before the incoming agent resumes, including outgoing/incoming owners and prior session links when available.

## Current uncodenamed assignment: Issue #222

Issue #222 predates this convention and has no assigned codename. Its current title, `[I-222 | Agent Identity & Work Register]`, and existing PR/session/branch identifiers are retained; do not invent a codename or rename them. The original Issue body requires `I-N` as the primary human-facing designator and examples that put the Issue ID first; those requirements are superseded by the new prospective codename-first decision. The Issue body should be updated by Aaron to record that supersession and, if desired, to assign a codename at a later handoff. Until then, this PR and the existing assignment remain findable by Issue #222 and its direct link.
