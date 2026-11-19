# Agent Assignment Register

Start from the GitHub Issue, not a chat title or this index:

1. Open the Issue and verify its number, title, assignee, approved scope, acceptance criteria, and latest handoff.
2. Follow its linked PR and check the target branch, head branch/SHA, draft state, review and CI evidence. Verify the agent's current branch before any work.
3. If the assignment, owner, branch, PR, or scope does not match, stop and ask Aaron to resolve the mismatch. Do not infer reassignment.
4. Record the active implementer, next action, and verified pushed SHA on the Issue. Keep this page as a compact link index only; **live GitHub Issue/PR status overrides this dated snapshot**.

Update the index at meaningful assignment, review, or delivery checkpoints, not after every commit. Unknown session links stay “not available”; do not fabricate them.

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
I-N | <task name>
Assigned agent: <one active implementer>
Agent chat/session: <direct link or not available>
PR: <direct PR link or unknown>
Branch: <branch or unknown>
Pushed HEAD SHA: <full SHA or unknown>
Status: <evidence-backed state>
Next responsible party/action: <name and concrete action>
Last verified: <YYYY-MM-DD>
```

Before accepting the assignment, verify the Issue, assignee/owner, branch, PR head/base, approved scope, and competing assignments. A mismatch means stop and escalate to Aaron; do not switch branches or Issues by inference.

## Copy/paste handoff

```text
I-N | <task> | PR #N | SHA <pushed SHA> | Agent <name> | Verdict/next action: <specific action>
Issue: <direct Issue link>
Branch/base: <head branch> → <base branch>
Status: <implementation/review/checks state>
Checks run: <commands and actual results; mark anything not run or unverified>
Next responsible party: <name>
```

An implementer reports implementation and verification evidence; an independent reviewer gives a separate verdict; Checks/Merge reports actual CI/check state and does not approve code; Aaron alone authorizes merge. Record a transfer on the Issue, including the outgoing and incoming owner and prior session links when available, before the next agent resumes.
