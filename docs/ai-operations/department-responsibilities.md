# Bibleberry Department Responsibilities

This document identifies who owns each decision and when responsibility passes to the next department. Department charters define each department’s procedures. These responsibilities carry forward when Aaron replaces a conversation or assigns a different agent.

## Decision authority

**Aaron Waid** owns product direction, engineering authorization, and organizational policy. He makes the final decisions on technical acceptance, merges, deployments, and releases.

**Alexis Waid** owns theological, editorial, teaching-content, and ministry-facing visual decisions. When an engineering choice affects the meaning or presentation of teaching content, the responsible department brings the content question to Alexis and the engineering decision to Aaron.

## Department responsibilities

Bibleberry has **four permanent AI departments**. **Checks & Merge** belongs to General Administration, **Project Board Stewardship** belongs to Engineering Issue Planning, and **coding agents** are managed by Development Management. These are subordinate functions or changeable implementation resources, **not three additional permanent departments**. Independent Review remains a separate permanent department.

| Permanent department | Owns, including subordinate functions/resources | Hands off to |
|---|---|---|
| **General Administration (Admin)** | Organizational support, cross-department coordination, operational troubleshooting and governance maintenance. **Checks & Merge:** verifies applicable hosted CI, exact-SHA review evidence when required, merge-queue/branch compatibility, unresolved blockers and readiness; reports to Aaron and executes a merge only with his express authorization. | Aaron for final merge/organizational decisions; Dev or Review when engineering or technical corrections are required. |
| **Engineering Issue Planning (Planning)** | Investigates and creates bounded codenamed engineering candidate Issues within authorized planning initiatives. **Codename Registry:** serves as operational custodian and coordinates concurrent allocations. **Project Board Stewardship:** administers the single Bibleberry Development board and reconciles statuses using Dev's readiness/ownership decisions, accepted PRs, acceptance evidence and Aaron's decisions. | Dev receives candidate Issues in **Triage**; conflicting records go to their responsible decision owner. |
| **Development Management (Dev)** | Determines implementation readiness and engineering sequencing within the approved roadmap; selects, assigns, coordinates and reassigns **coding agents** (typically Claude Code, Codex, Antigravity and Copilot); manages implementations and corrective work. Agents are not departments and may change without changing Dev's responsibility. | Authorized coding agent for implementation, then Review for technical evaluation and Admin for Checks & Merge. |
| **Independent Review (Review)** | Performs independent technical evaluation of software/technical changes, including source, requirements, risk and tests; records exact-HEAD `CODE APPROVED` or `CHANGES REQUESTED` when applicable. | Dev for corrections; Admin's Checks & Merge after technical approval. |

## Assignment flow

1. **Planning creates the candidate.** Planning checks for duplicate work and allocates the codename through the [Codename Registry](codename-registry.md). It creates the Issue in **Triage**. Implementation requires Aaron’s authorization.
2. **Dev determines readiness and dispatches the work.** Dev identifies when the Issue is **Ready to Assign**. Once Aaron’s authorization covers the assignment, Dev selects the coding agent and dispatches it. Active work is **In Progress**.
3. **The coding agent submits the implementation.** The PR identifies the originating Issue and permanent codename. The handoff identifies the exact commit submitted for Review and the verification performed.
4. **Review evaluates software and technical changes.** For software/technical PRs, Review posts `CODE APPROVED` or `CHANGES REQUESTED` as a substantive top-level PR Conversation comment tied to the exact reviewed HEAD SHA. Dev coordinates corrections. For strictly administrative/governance-documentation PRs, Aaron may expressly determine that an independent technical review is not applicable and approve the work himself; that decision must be recorded, not represented as a technical approval. The Issue remains **In Progress** until the required checks and owner decision are complete.
5. **Admin performs Checks & Merge.** Admin confirms applicable required CI, exact-HEAD technical review disposition when required, branch/queue compatibility and any owner-approved nontechnical review exception. It reports unresolved requirements or presents the candidate to Aaron. Admin does not grant itself code-review approval or merge authorization.
6. **Planning performs Project Board Stewardship.** Planning reconciles the existing board against verified completion evidence and the responsible owner's decision. For implementation work, it records **Done** only when the completing PR has merged and full Issue scope is satisfied; otherwise it preserves outstanding obligations. Planning does not independently change Dev's priorities or authorize implementation.

**Incidental findings:** Follow [AI Development Protocol §5A](../ai-development-protocol.md#5a-incidental-findings-and-engineering-knowledge-preservation). Implementing agents preserve material discoveries; Dev ensures preservation and routes them; Review evaluates technical significance; Planning investigates and deduplicates authorized follow-up work; Admin verifies recorded disposition and accountable next steps during Checks & Merge. Existing scope, acceptance, and owner authority remain unchanged.

## Non-engineering repository changes and assignment identity

**Documentation, governance, operational maintenance and other human-directed work that will modify repository files or produce PRs also require one originating Issue and a codename allocated through the [Codename Registry](codename-registry.md)**. This rule applies regardless of which conversation proposes the work, including Planning or Admin.

- The requesting role first checks existing Issues/PRs for a matching assignment and confirms Aaron's authorization and the responsible department. Reuse an established Issue/codename whenever one already governs the change.
- For a **new non-engineering PR assignment**, the authorized responsible department creates the scoped Issue using the registry before any branch or file write. Admin may perform this only with Aaron's permission under its charter. Engineering Planning's delegated candidate-Issue authority remains **engineering-only**; it may refer non-engineering needs to Aaron/Admin rather than treating them as automatically authorized candidates.
- The owner verifies the identity, Issue reference, scope and PR title before submitting the PR. Independent technical Review remains required for software/technical changes; Aaron may expressly deem it inapplicable to strictly governance/administrative-documentation work. Admin owns Checks & Merge, Planning owns board maintenance, and Aaron retains final merge authorization. The Issue is complete only once its defined acceptance evidence exists.
- Read-only research, advice and proposals with no repository changes do not require a new Issue. Routine continuation of an existing tracked assignment does not require a duplicate Issue; named automated dependency bot PRs have the narrow exception defined in [AI Development Protocol §2B](../ai-development-protocol.md).

## Assignment identity and continuity

The originating GitHub Issue is the authoritative assignment record. Each new engineering candidate and every new human-directed PR-producing assignment, **engineering or non-engineering**, receives a codename through the [Codename Registry](codename-registry.md) under Section 2B of the [AI Development Protocol](../ai-development-protocol.md). Keep that codename through corrections, replacement PRs, agent changes, and conversation handoffs.

Identify an assignment in formal handoffs as **Codename | Issue number | PR number, if applicable | Current status**. For implementation and Review, include the branch and exact verified SHA. Follow the [common handoff standard](handoff-standard.md) when replacing a departmental conversation.

## Ownership questions

Departments carry out the routine handoffs defined here. Changes to permanent departmental ownership require Aaron’s direction. When ownership is disputed or unclear, identify the decision needed, the evidence, and the work affected. General Administration coordinates resolution with Aaron when needed.
