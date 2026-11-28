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

**Document authority and nonconflicting roadmaps (November 9, 2026):** The path `docs/product/application-development-roadmap.md` is the **only active sequencing roadmap**. Its six-phase order overrides older P0/P1/P2 backlog rankings and the content-architecture document's historical Phase A–G order. The approved November 8 reader document governs *what reader behavior is required*; the November 9 CMS document governs *what editorial models/operations have been planned*, preserving the full 80-decision register. `docs/project/current-status.md` and underlying merged code/Issue evidence govern *what has been done*. A specific authorized Issue/branch/PR governs *what this agent may do now*. Do **not** follow an older “next milestone” in a dated issue, handoff, README or status section when newer accepted evidence supersedes it. Do not spawn another active roadmap file; submit changes to the existing canonical roadmap through review. The two approved Sanity datasets are `production` and `staging` only; the old `berrymark-development` dataset was deleted. The November 8 private staging Stage 3C test has **passed** ([#63](https://github.com/Bibleberry/Bibleberry/issues/63)); do not restart it as missing integration work.

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

**Review applicability and departmental ownership:** Software or technical PRs require Independent Review's exact-HEAD technical disposition. For strictly administrative or governance-documentation PRs, Aaron may explicitly determine technical Review is inapplicable and approve the change himself; record that decision transparently. This does not exempt any source-code, security, CI behavior or configuration change from applicable technical scrutiny. Independent Review owns Checks & Merge (applicable CI, review evidence, integration readiness and authorized merge operations under §2C); Planning owns Project Board Stewardship; Dev manages changeable coding agents. **Only Aaron may authorize a merge.**

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
2. If the work continues an existing Issue, **reuse its codename and Issue**. If no Issue covers the authorized change, the appropriately authorized department must create one scoped Issue using the [Codename Registry](ai-operations/codename-registry.md) **before creating a branch, modifying files or opening a PR**. Creating that originating Issue is the sole permitted initial repository write for establishing the new identity; it does not authorize implementation. Engineering Planning's delegated Issue creation covers only Aaron-authorized engineering planning initiatives. Non-engineering Issue creation requires Aaron's authorization under the responsible department's charter.
3. Confirm the same exact codename in the Issue title, proposed branch name and PR title, and a direct originating Issue reference in the PR body. If identity, authorization, or scope is missing or contradictory, **stop repository mutations and resolve it with Aaron**. Do not silently treat a docs, governance, hotfix or Planning-initiated change as exempt.
4. Once assigned, carry the identity through corrections, reviews, replacement PRs and conversation/department handoffs. A routine update to an existing Issue, PR or Project item **within an authorized existing assignment** keeps that assignment's identity; it does not require a duplicate Issue.

The originating Issue is the durable anchor; the codename makes it recognizable across conversations and AI platforms. This rule does not compel an Issue for casual discussion, read-only research or recommendations that never produce repository changes.

- **Use the [Codename Registry](ai-operations/codename-registry.md) for every applicable new Issue.** This includes new engineering candidates and all human-directed Issues for PR-producing work. Follow the registry’s allocation and coordination procedure and record the sequence in the Issue body. A codename stays with its originating Issue through all handoffs, corrections and replacement PRs. Pair the codename with the Issue number because eligible names can be recycled under the registry policy.
- **Lead every human-directed assignment/PR name with the codename.** Use Issue title `[Blue Fox] Preserve Shelf Protection`; PR title `[Blue Fox] Implement Shelf Protection Fix`; branch `fix/issue-224-blue-fox` (or `docs/issue-224-blue-fox` for documentation), and single-Issue session title `Blue Fox | Shelf Protection | Copilot`. A new branch must use its Issue number and codename; do not force-rename an already open historical branch. Keep the originating Issue number and direct link in formal records, PR descriptions, and handoffs. Multi-Issue coordinating sessions need not use one codename; identify each assignment separately.
- **Keep PR references accurate.** The PR body explicitly links the originating Issue. Use `Refs #224` for partial work; use `Fixes #224` only when all acceptance criteria are met and the PR is intended to close the Issue. An incomplete or placeholder PR must not claim completion, regardless of PR review status. If one Issue has multiple or replacement PRs, record all their numbers, links, branches and relevant SHAs on the Issue, keeping the same codename throughout.
- **Keep the assignment record on its Issue.** Store or update a concise structured block (or one handoff comment when body editing is inappropriate) with codename; Issue number and link; short task; assigned agent; session link or `not available`; branch; all associated PR numbers/links; latest pushed HEAD SHA; verified status; next responsible person/agent; next action; and last-verified date. Mark unknown information unknown; never invent links or evidence. There is one active implementing owner per Issue; other agents may review independently.
- **Perform identity and authorization preflight before creating a branch or modifying files (all departments).** Verify the Issue number/title and codename, owner, target branch, relevant PR heads/bases and pushed SHAs, approved scope and conflicting active assignments. For a new Issue, follow the registry’s serialized allocation and availability checks before creating it. If identity, authority or scope conflicts, stop and report the mismatch to Aaron rather than guessing or editing the wrong branch. A different codename/Issue requires explicit reassignment and branch verification before work resumes.
- **Use explicit, codename-first handoffs.** Start an implementation summary with `Blue Fox | Issue #224 | PR #229 | SHA <pushed SHA> | Copilot | Implementation/next action: <action>`. Start a review with `Blue Fox | Issue #224 | PR #229 | Review`; start a checks/merge handoff with `Blue Fox | Issue #224 | PR #229 | Checks and Merge`. Link the Issue and PR, name the next responsible person, and list commands actually run and results; identify missing or unverified evidence. Coding, independent review, CI/checks, and Aaron's final authorization are separate stages: review is not a CI pass, CI is not code approval, and no agent merges or deploys without Aaron's authorization.
- **Record ownership transfers before resuming.** The Issue must state who hands off to whom, the next action, and retained prior agent/session links when available. The incoming agent repeats preflight; a chat handoff alone does not transfer ownership.
- **Coordinate shared files.** Parallel work on separate Issues is allowed only when files/worktrees do not conflict. Sequence integrations that touch `src/App.tsx` as their Issues require; do not make competing edits concurrently.
- **Automated PR exception and prospective application.** Machine-generated dependency-maintenance PRs authored by GitHub-recognized `dependabot[bot]` or `renovate[bot]` are exempt from the *new human-assignment codename/Issue* requirement, but **not** CI, security review or Aaron's merge decision. A human-directed change submitted using automation is **not** exempt merely because a bot pushed commits. Other bots, including `github-actions[bot]`, are not automatically exempt; exceptions beyond the named automated senders require Aaron to record an explicit reason and matching check configuration. Do not retrospectively rename unrelated historical Issues, PRs, branches or conversations. Preexisting human PRs #1–#295 retain historical identity; PR #296 is being explicitly repaired under [Cobalt Ledger #297](https://github.com/Bibleberry/Bibleberry/issues/297). Once this policy is accepted, the new PR identity workflow validates human PRs #296 onward, including the originating Issue's matching codename.

## 2C. Protected Merge Authorization and Coordination

Aaron alone grants merge authorization. Independent Review owns routine Checks & Merge; implementation contributors cannot authorize or merge their own work. Technical disposition, verification, owner authorization, accepted main and release remain distinct. Admin assists exceptional troubleshooting only when authorized.

**Effective transition:** On acceptance of this governance revision, routine Checks & Merge transfers to Review. Existing PRs, queue entries and batch authorizations retain their actual recorded scope; reconcile outstanding candidates and next owners with Aaron without automatically enqueuing, canceling or broadening approvals. Existing owner-approved exact-SHA batch procedures remain unchanged.

**Individual authorization (default):** Review verifies the current exact HEAD, applicable independent disposition (or Aaron's explicit nontechnical applicability/approval decision), required CI/other evidence, applicable human approvals, findings disposition, branch and queue compatibility and Aaron's explicit authorization for the actual candidate. Use only the protected merge path, preserving the authorized SHA; if it cannot be safely bound to the reviewed candidate, stop and refer to Aaron. Do not use administrative bypass or relax a gate. Confirm actual accepted result and hand completion evidence to Planning.

**Standing conditional authorization (not active by adoption of this document):** Aaron may separately activate a documented, revocable standing authorization for a defined class of routine engineering PRs, with explicit eligibility, exclusions, required approvals, protected execution method and stop conditions. Before activation, verify and record actual effective GitHub controls and a safe execution path that enforce the independent exact-HEAD approval and required checks, including queue entry and changes while queued or awaiting auto-merge. A substantive PR Conversation comment is the authoritative technical disposition, but a comment alone is not a native merge gate. Native approval or another trusted SHA-bound required gate must be demonstrably linked to that disposition and prevent any changed PR HEAD from merging until renewed independent review and applicable approval. Do not equate a green CI run, an enabled auto-merge setting, or a protected branch indicator with proof of this enforcement. Validate stale-head rejection and queue behavior with owner-authorized evidence; if controls, permissions, identity binding or evidence are unavailable, retain individual authorization and do not enable standing auto-merge. Refer configuration or workflow implementation needs to Aaron through an authorized separate assignment (existing CI audit #243 and batch coordinator #202 remain distinct).

Once separately activated, Review may coordinate protected automatic merging of eligible exact-HEAD approved PRs under that recorded authorization without individual owner confirmation. Verify eligibility, current candidate, applicable approvals and gates; never substitute a new revision, bypass protection, expand scope, or infer release permission. If a PR changes, authorization for the prior candidate and its review disposition do not carry forward: ensure any pending merge/queue state cannot admit the changed HEAD, require renewed review and applicable approvals, and re-evaluate eligibility before re-entry. Stop on unexpected scope, unresolved blockers, failed or unavailable enforcement, revoked authority or unsafe queue state; notify Aaron. Required hosted gates may finish through the protected mechanism only when the verified controls enforce them; do not claim pending checks passed. Record authorization, reviewed SHA, actual execution state and resulting acceptance on the existing PR/Issue.

**Bounded owner-authorized batch integration updates (Copper Turnstile, November 27, 2026):** When Aaron explicitly authorizes an ordered batch of `PR_NUMBER@REVIEWED_HEAD_SHA[#REVIEW_COMMENT_ID]` candidates through the approved default-branch Copper Turnstile coordinator (`merge-queue-approval`, bound via an immutable run-attached authorization manifest verified alongside run workflow path, `workflow_dispatch` event, `main` ref, owner actor and `approve-start` job on every continuation step), that owner batch authorization extends to subsequent mechanical `main`-into-PR branch updates for those listed PRs **only** when the trusted default-branch coordinator conclusively verifies all of the following before merging: (1) the submitted `REVIEWED_HEAD_SHA` carries an independently verifiable exact-HEAD technical approval — either a native `APPROVED` review with a non-null exact `commit.oid` from a distinct identity in `authorizedNativeReviewers` (never an arbitrary public-repo user), or, under Bibleberry's current shared-account operating model where login alone cannot prove departmental independence, an explicitly owner-attested PR Conversation review comment ID (`#REVIEW_COMMENT_ID`) inside the single batch authorization that strictly matches the top-level Independent Review disposition structure for that PR and exact 40-character SHA with an unchanged body digest and zero superseding `CHANGES REQUESTED`, `HOLD`, blocking review or unresolved review conversation (explicitly acknowledging that owner attestation of the comment ID bridges the shared GitHub account until a distinct reviewer identity is adopted); (2) the resulting commit is strictly a two-parent merge commit `[previousAuthorizedHead, acceptedMainCommit]` incorporating only accepted `main` history, with no rebase, force-push, non-merge commit or extra PR commits; (3) the original reviewed implementation is unaltered (non-overlapping file sets and verified blob hashes match accepted `main` and the reviewed PR respectively, without truncated file comparisons); (4) there are zero overlapping file changes between `main` and the PR (`PR_files ∩ MAIN_files = ∅`), zero merge conflicts and zero unauthorized modifications — any overlapping file change must **HOLD** for fresh Independent Review even if Git merged cleanly without conflict markers; (5) all applicable fresh ordinary PR CI checks pass on the exact integration commit SHA (never accepting pending, missing, skipped-only, canceled, stale or failed checks); and (6) effective branch protection (`strict`, `enforce_admins`, conversation resolution, no force-push/deletion, no execution bypass allowances) and all applicable review requirements remain verified fail-closed before every write. Outside this narrowly bounded mechanical integration exception, exact-HEAD Independent Review and owner authorization requirements remain completely unchanged, normal individual PR merging remains unchanged, and standing conditional authorization for unbatched PRs remains inactive until separately activated.

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

## 5A. Incidental Findings and Engineering Knowledge Preservation

**Material engineering knowledge must not exist exclusively within transient agent communications.** Bibleberry's durable organizational records must preserve the information necessary to understand, evaluate, maintain, and continue development independently of the agents that produced it.

### Reporting obligation

All implementing agents, regardless of provider, model, execution environment, or dispatch mechanism, must report material defects, regressions, unexpected behavior, accessibility concerns, technical limitations, and other significant engineering findings discovered during implementation, debugging, verification, or subsequent review corrections.

This obligation includes findings outside the authorized assignment scope, pre-existing defects, and concerns that do not cause automated tests to fail.

A finding is material when it could reasonably affect engineering decisions, acceptance requirements, security, privacy, accessibility, reliability, data integrity, integration, maintenance, or future development. Routine debugging noise, speculative observations without material implications, and ordinary corrected implementation errors do not require separate incidental-finding records unless they contain significant engineering knowledge. Existing verification and known-limitation reporting requirements still apply.

### Durable preservation

Record material findings at the next practical durable reporting opportunity and before handing back, transferring, or terminating an assignment. Use the **Incidental Findings** section of the existing PR as the primary reporting location. Link supplementary PR comments, durable test evidence, screenshots, and source references rather than duplicating them. If no material incidental findings were discovered, explicitly state that.

Where a PR does not yet exist, preserve findings on the originating Issue or another appropriate authorized durable record. Terminal output, coding-agent conversations, local files, and temporary execution environments do not independently satisfy this requirement.

If an agent lacks the ability to update the appropriate durable record, it must explicitly identify the unrecorded findings and the access blocker in its handback. Dev is responsible for preserving them, using an authorized route; the owner must not become the routine manual relay. If a durable write is unavailable, identify the blocker and accountable next action without claiming preservation succeeded.

### Evidence requirements

For each material finding, document where applicable:

- Observed behavior and expected behavior.
- Affected surface, component, file, or subsystem.
- Relevant conditions, environment, and implementation checkpoint (including commit SHA when available).
- Reproduction steps or verification procedure.
- Whether the finding appears introduced, pre-existing, or of undetermined origin.
- Supporting screenshots, tests, logs, or source references.
- Apparent implications for existing requirements, acceptance, or future engineering work.

Distinguish verified observations, implementer-reported evidence, suspected causes, and unverified concerns. Do not present a hypothesis as an established defect without appropriate supporting evidence.

### Scope and continuity

Discovering a defect does not authorize correcting it outside the existing assignment scope. Maintain the findings record throughout implementation, review corrections, agent replacement, and departmental handoffs. Record the subsequent disposition and supporting evidence rather than silently deleting a finding when corrected, disproven, or deferred. Cross-reference existing verification or known-limitation records where appropriate.

### Evaluation and disposition

Every material incidental finding must receive an identifiable recorded disposition and, where unresolved, an accountable next responsible party.

Appropriate dispositions include correction within authorized scope, referral to Planning, reference to an existing Issue, authorized deferral with rationale, further investigation, evidence-based dismissal, or resolution with supporting evidence. A disposition does not necessarily require immediate corrective implementation or creation of a new Issue.

Independent Review evaluates the technical relevance of findings to the submitted implementation and its applicable requirements. Reporting an unrelated pre-existing defect does not automatically prevent technical approval. A pre-existing defect may nevertheless block approval when it materially undermines applicable requirements.

Dev communicates this obligation at dispatch, coordinates authorized corrections and routes remaining findings to the appropriate department. Planning investigates referred findings and prepares or references assignments within its authorized scope, avoiding duplicates. Review confirms recorded dispositions and accountable next steps through Checks & Merge; Dev retains corrective implementation coordination.

No department acquires new implementation, technical approval, Issue-creation, prioritization, or merge authority through this requirement. Unresolved reporting or disposition gaps must be surfaced to the responsible department and Aaron rather than treated as silently cleared.

### Sensitive information

Do not disclose credentials, personal information, exploitable security details, unpublished confidential content, or other sensitive information through public Issues, PRs, screenshots, or logs. Preserve sensitive findings through an appropriate authorized restricted mechanism; escalate to Aaron when no suitable mechanism exists. Public tracking information, where appropriate, must be sanitized and must not reveal protected material.

### Governing principle

**Every material finding must be accounted for. Not every material finding must become a merge blocker.** Aaron retains final authority over engineering scope, priorities, accepted limitations, implementation authorization, technical acceptance, and merging.

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
