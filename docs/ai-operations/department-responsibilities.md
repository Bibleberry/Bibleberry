# Bibleberry Department Responsibilities

This document identifies who owns each decision and when responsibility passes to the next department. Department charters define each department’s procedures. These responsibilities carry forward when Aaron replaces a conversation or assigns a different agent.

## Decision authority

**Aaron Waid** owns product direction, engineering authorization, and organizational policy. He makes the final decisions on technical acceptance, merges, deployments, and releases.

**Alexis Waid** owns theological, editorial, teaching-content, and ministry-facing visual decisions. When an engineering choice affects the meaning or presentation of teaching content, the responsible department brings the content question to Alexis and the engineering decision to Aaron.

## Department responsibilities

| Department or role | Owns | Hands off to |
|---|---|---|
| General Administration | Organizational support, cross-department coordination, operational troubleshooting, and investigations Aaron assigns. | The department responsible for the work, or Aaron when a decision requires his authority. |
| Engineering Issue Planning (Planning) | Researching upcoming work within an authorized planning initiative. Checking accepted code and existing Issues for overlap. Creating candidate Issues with a permanent codename, bounded scope, dependencies, acceptance criteria, and verification expectations. | Dev, through an unassigned Issue in **Triage** on the Bibleberry Development Project. |
| Development Management (Dev) | Evaluating readiness and priority against the canonical roadmap. Coordinating dependencies and concurrent work. Selecting coding agents, dispatching authorized assignments, and coordinating corrections. | A coding agent for implementation or correction, then Independent Review when a PR is ready for evaluation. |
| Coding agents | Implementing the authorized scope, testing the change, and submitting a PR linked to the originating Issue. | Dev and Review receive the branch, PR, exact HEAD SHA, verification results, and any outstanding limitations. |
| Independent Review (Review) | Independently evaluating the submitted implementation and its tests against the authorized scope. Recording the technical disposition for the exact commit examined. | Dev for corrections, or Checks & Merge after code approval. |
| Checks & Merge | Verifying required CI, exact-commit evidence, branch compatibility, unresolved findings, and applicable merge requirements. | Aaron for the final merge decision, or the responsible department when a requirement remains outstanding. |
| Project Board Steward | Keeping the existing Bibleberry Development Project accurate using the Issue, PR, and decisions of the responsible owners. | The owner of the underlying decision when records disagree or the correct status is unclear. |

## Assignment flow

1. **Planning creates the candidate.** Planning checks for duplicate work and codename reuse across open and closed development Issues. It creates the Issue in **Triage**. Implementation requires Aaron’s authorization.
2. **Dev determines readiness and dispatches the work.** Dev identifies when the Issue is **Ready to Assign**. Once Aaron’s authorization covers the assignment, Dev selects the coding agent and dispatches it. Active work is **In Progress**.
3. **The coding agent submits the implementation.** The PR identifies the originating Issue and permanent codename. The handoff identifies the exact commit submitted for Review and the verification performed.
4. **Review records its disposition.** Review posts `CODE APPROVED` or `CHANGES REQUESTED` as a substantive top-level comment in the GitHub PR Conversation, tied to the exact reviewed HEAD SHA. If evidence is missing, Review identifies what it needs and leaves the review incomplete. Dev coordinates any required corrections and returns the revised HEAD to Review. The Issue remains **In Progress** during review and correction.
5. **Checks & Merge verifies readiness.** It confirms that the review disposition and required checks apply to the current merge candidate. It reports outstanding requirements or presents the candidate to Aaron for his decision.
6. **The Board Steward reconciles the outcome.** For implementation work, the Steward marks the Issue **Done** when the PR completing its scope has merged. If Aaron directs another disposition, the Steward records the outcome he specifies.

## Non-engineering repository changes and assignment identity

The engineering handoff above remains unchanged. **Documentation, governance, operational maintenance and other human-directed work that will modify repository files or produce PRs also require one originating Issue and a unique permanent two-word codename**. This rule applies regardless of which conversation proposes the work, including Planning or Admin.

- The requesting role first checks existing Issues/PRs for a matching assignment and confirms Aaron's authorization and the responsible department. Reuse an established Issue/codename whenever one already governs the change.
- For a **new non-engineering PR assignment**, the authorized responsible department creates the scoped Issue with its unique codename before any branch or file write. Admin may perform this only with Aaron's permission under its charter. Engineering Planning's delegated candidate-Issue authority remains **engineering-only**; it may refer non-engineering needs to Aaron/Admin rather than treating them as automatically authorized candidates.
- The owner verifies the identity, Issue reference, scope and PR title before submitting the PR. Review, Checks & Merge, board maintenance and Aaron's final merge decision retain their established authority boundaries. The Issue is complete only once its defined acceptance evidence exists.
- Read-only research, advice and proposals with no repository changes do not require a new Issue. Routine continuation of an existing tracked assignment does not require a duplicate Issue; named automated dependency bot PRs have the narrow exception defined in [AI Development Protocol §2B](../ai-development-protocol.md).

## Assignment identity and continuity

The originating GitHub Issue is the authoritative assignment record. Each new engineering candidate and every new human-directed PR-producing assignment, **engineering or non-engineering**, receives a unique permanent two-word codename under Section 2B of the [AI Development Protocol](../ai-development-protocol.md). Keep that codename through corrections, replacement PRs, agent changes, and conversation handoffs.

Identify an assignment in formal handoffs as **Codename | Issue number | PR number, if applicable | Current status**. For implementation and Review, include the branch and exact verified SHA. Follow the [common handoff standard](handoff-standard.md) when replacing a departmental conversation.

## Ownership questions

Departments carry out the routine handoffs defined here. Changes to permanent departmental ownership require Aaron’s direction. When ownership is disputed or unclear, identify the decision needed, the evidence, and the work affected. General Administration coordinates resolution with Aaron when needed.
