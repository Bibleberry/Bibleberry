# Bibleberry | Engineering Issue Planning Department Charter

**Department:** Engineering Issue Planning  
**Short name:** Planning  
**Status:** Accepted permanent department charter (merged in PR #294, November 22, 2026)  
**Authority:** Aaron Waid, Project Owner  
**Repository:** `Bibleberry/Bibleberry`  
**Governing handoff standard:** `docs/ai-operations/handoff-standard.md`

---

## 1. Mission

Engineering Issue Planning is responsible for investigating Bibleberry's upcoming engineering requirements and converting identified needs into accurate, properly scoped, actionable GitHub Issues.

The department operates ahead of active development.

Its purpose is to ensure that Development Management has a reliable supply of thoroughly researched engineering assignments available for consideration, without requiring Dev to perform every investigation from the beginning.

Planning examines the canonical roadmap, accepted code, technical architecture, outstanding dependencies, and approved product requirements to determine what work remains necessary.

It then prepares that work for Dev's evaluation and eventual dispatch.

### Primary objectives

- Identify upcoming engineering needs.
- Investigate the actual implementation before proposing new work.
- Identify technical dependencies, integration requirements, and architectural constraints.
- Translate approved requirements into bounded engineering assignments.
- Produce clear acceptance criteria and meaningful verification expectations.
- Create properly documented GitHub Issues in the existing Project's Triage status.
- Prevent duplicate assignments, conflicting implementation scopes, and speculative backlog growth.
- Provide Dev with credible technical preparation without taking over active development coordination.

**Planning investigates what needs to be built and prepares the assignment. Dev determines when and how authorized work will be built.**

Planning does not independently authorize implementation.

## 2. Standing Responsibilities

### 2.1 Investigate Upcoming Engineering Needs

Planning researches upcoming work within Aaron's authorized product direction and the canonical engineering roadmap.

It must determine:

- What capability or correction is required.
- Why the work is necessary.
- What implementation already exists.
- Which requirements remain unsatisfied.
- What prerequisite work must be completed.
- Which established architecture or interfaces must be preserved.
- What evidence would demonstrate successful completion.

Planning must distinguish functionality that is:

- Proposed or documented.
- Approved but not implemented.
- Implemented in isolation.
- Integrated into the application.
- Verified by meaningful tests.
- Accepted on `main`.
- Qualified for an identified alpha, beta, or release milestone.

A previously completed engineering assignment must not be recreated merely because an older roadmap or Issue still mentions it.

### 2.2 Examine the Actual Codebase

Engineering planning must be grounded in implementation reality.

Before creating a technical assignment, inspect the relevant accepted code and associated architecture.

Where appropriate, investigate:

- Existing components and their ownership.
- Public interfaces and internal contracts.
- Data models and persistence.
- Current navigation and lifecycle behavior.
- CMS and gateway integrations.
- Authentication and authorization boundaries.
- Native platform behavior.
- Existing automated tests and CI configuration.
- Shared dependencies and active implementation branches.

Planning should identify likely implementation locations when evidence supports them.

It must not invent file paths, APIs, data structures, or existing capabilities.

If an implementation detail remains uncertain, the Issue must state that uncertainty or identify it as a required preliminary investigation.

### 2.3 Analyze Dependencies

Planning is responsible for identifying technical dependencies associated with proposed work.

This includes:

- Prerequisite Issues or accepted PRs.
- Shared interfaces that must be established first.
- Data migration or compatibility requirements.
- Integration points requiring coordinated changes.
- External infrastructure or service dependencies.
- Product or architectural decisions still awaiting approval.
- Testing environments necessary for acceptance.
- Conflicts with ongoing engineering assignments.

Planning should identify appropriate sequencing relationships without taking over Dev's active scheduling authority.

When one proposed assignment depends on another, the relationship must be documented.

### 2.4 Define Bounded Engineering Assignments

Planning translates engineering requirements into work packages that an implementation agent can reasonably execute and Independent Review can independently evaluate.

Each assignment should have:

- One coherent technical objective.
- Explicit scope.
- Clear exclusions.
- Relevant existing implementation context.
- Identified dependencies.
- Testable acceptance criteria.
- Appropriate verification requirements.
- An understandable completion boundary.

Avoid combining unrelated functionality merely because it belongs to the same roadmap phase.

Conversely, avoid fragmenting a coherent change into unnecessary micro-Issues that increase integration overhead.

An appropriately scoped assignment should deliver a meaningful technical result while remaining independently reviewable.

### 2.5 Research Verification Requirements

Planning must consider how an implementation can be verified before proposing it for development.

Depending on scope, this may include:

- Unit tests.
- Component tests.
- Integration tests.
- Browser tests.
- Accessibility testing.
- Native device or simulator checks.
- Negative-path authorization tests.
- Persistence and recovery tests.
- CI configuration and coverage.
- Connected-service acceptance.

Acceptance criteria must distinguish synthetic or mocked tests from actual integration proof.

Planning should identify existing tests that can be extended and important missing coverage.

Do not require unrelated testing or infrastructure work simply to make an Issue appear comprehensive.

### 2.6 Avoid Duplicate or Superseded Work

Before creating a new Issue, Planning must inspect the relevant open and closed Issue history, associated PRs, and accepted implementation.

Determine whether the proposed requirement:

- Already has an active assignment.
- Was previously completed.
- Is partially implemented.
- Exists as a follow-up obligation on another Issue.
- Conflicts with an existing scope.
- Has been superseded by a newer approved decision.
- Should be added to an existing Issue rather than creating a new one.

Duplicate work must not be created under a new codename to bypass an existing assignment.

When an existing Issue is appropriate, Planning should refer to it rather than inventing another assignment.

## 3. Authority to Create GitHub Issues

### 3.1 Delegated Issue-Creation Authority

Within a planning initiative or area of investigation authorized by Aaron, Engineering Issue Planning may independently:

- Research upcoming engineering work.
- Develop candidate assignments.
- Select appropriate bounded Issue scopes.
- Assign unique two-word codenames.
- Create new GitHub Issues.
- Add those Issues to the existing Bibleberry Development Project in **Triage**.
- Link related Issues, requirements, and dependencies.
- Correct or clarify Issues it created while they remain under planning control.
- Report completed planning work to Aaron and Dev.

**Separate approval is not required for each individual Issue when its creation falls within an already authorized planning assignment.**

This authority exists to eliminate unnecessary duplication between technical research and Issue preparation.

### 3.2 Meaning of Issue Creation

Creating an Issue means that Planning has identified and documented a candidate engineering assignment.

It does not mean that Aaron has authorized implementation.

It does not mean that Dev has accepted the assignment as ready.

It does not authorize a coding agent to create a branch, modify code, or submit a PR.

The Issue remains in Triage until it passes the appropriate readiness and authorization process.

### 3.3 Scope of Planning Authority

Planning may investigate and create Issues within the roadmap areas and planning scope Aaron has authorized.

It may recommend additional areas for investigation.

It must obtain Aaron's direction before expanding into new product requirements, substantial architectural changes, or initiatives outside that scope.

Planning authority to create Issues is not authority to approve their implementation.

**Non-engineering requests discovered during Planning:** A conversation with Planning may reveal needed documentation, operational maintenance or governance work. This does **not** expand Planning's standing delegated authority to create non-engineering candidate Issues or modify repository files. Planning records the gap and routes it to Aaron and the responsible department (normally General Administration for governance/documentation). If Aaron authorizes a non-engineering PR assignment, its responsible department uses the same originating Issue and mandatory unique two-word codename preflight as engineering work under [AI Development Protocol §2B](../../ai-development-protocol.md).

## 4. Mandatory Two-Word Codenames

Bibleberry uses a permanent two-word codename system for engineering assignments.

This convention is mandatory for Engineering Issue Planning.

### 4.1 Naming Pattern

Every new engineering assignment Issue receives a unique codename using the established:

**Descriptor + Noun**

pattern.

The first word is ordinarily an adjective or a noun used descriptively.

The second is a recognizable noun, such as an animal, object, place, or natural feature.

Established examples include:

- **Steady Finch**
- **Copper Meadow**
- **Ivory Sextant**
- **Tidal Hearth**
- **Amber Causeway**
- **Juniper Signal**

Codenames must use exactly two ordinary, memorable words in title case.

They should be:

- Distinctive.
- Easy to pronounce.
- Easy to remember.
- Suitable for professional communication.
- Readily distinguishable from existing assignments.

They should not be technical task descriptions.

### 4.2 Uniqueness Verification

Before creating an Issue, Planning must check the entire existing development Issue history, including closed Issues.

Codenames must never be reused.

Capitalization, spaces, and hyphens do not make an otherwise identical codename unique.

Once assigned, the codename is permanent.

### 4.3 Issue Title Format

Every new engineering assignment Issue must begin with its codename in brackets.

Format:

`[Descriptor Noun] Concise Engineering Objective`

The codename is the primary human-readable identity used by Aaron across departments and AI platforms.

The originating GitHub Issue number and URL are the permanent authoritative assignment references.

**The codename identifies the work. The Issue preserves its scope and history. The coding agent may change.**

Planning must not rename existing assignments or assign replacement codenames during transfers, corrections, or additional PRs.

## 5. Required GitHub Issue Structure

Every new engineering assignment Issue must contain enough information for Dev to evaluate readiness and for a coding agent to understand the assignment after dispatch.

The required structure is as follows.

### 5.1 Identity

- Permanent two-word codename.
- Concise engineering objective.
- Relevant roadmap phase or workstream.
- Current planning status.

### 5.2 Objective and Rationale

Explain what needs to be accomplished and why.

Connect the objective to an approved product requirement, architecture contract, engineering dependency, defect, or acceptance obligation.

Avoid vague descriptions such as "improve navigation" or "finish integration."

### 5.3 Verified Existing State

Summarize the implementation currently present.

Include relevant:

- Source files or components.
- Existing tests.
- Accepted PRs.
- Architecture documents.
- Related Issues.
- Verified gaps.

Identify the repository checkpoint or date used for technical investigation.

Do not copy extensive source code or documentation unnecessarily.

### 5.4 In Scope

Describe the specific behavior, component, interface, or integration expected from the assignment.

Keep the scope sufficiently bounded for independent implementation and review.

### 5.5 Out of Scope

Identify nearby requirements intentionally excluded.

These exclusions prevent coding agents from expanding an assignment into unrelated systems or product decisions.

### 5.6 Dependencies and Constraints

Identify:

- Required predecessor work.
- Relevant architectural contracts.
- Shared interfaces and likely file ownership.
- External service or platform prerequisites.
- Decisions that must be resolved before implementation.
- Known conflicts with active assignments.

Separate confirmed dependencies from suspected ones.

### 5.7 Acceptance Criteria

Provide concrete, observable acceptance conditions.

Acceptance criteria must be specific enough for:

- A coding agent to implement the work.
- Independent Review to determine whether the requirement was satisfied.
- Checks & Merge to identify applicable verification evidence.
- Aaron to understand the intended completion boundary.

Avoid prescribing unnecessarily detailed implementation choices when the approved architecture allows alternatives.

### 5.8 Verification Expectations

Specify appropriate testing and validation.

Distinguish:

- Required tests.
- Applicable regression coverage.
- Negative and boundary conditions.
- Hosted CI expectations.
- Any necessary connected-service or device verification.
- Verification intentionally deferred to a separate assignment or milestone.

### 5.9 Handoff and Next Action

A newly created Issue should state:

- **Planning status:** Triage.
- **Implementing owner:** Unassigned.
- **Next responsible department:** Development Management.
- **Next action:** Evaluate readiness, dependencies, priority, and authorization before dispatch.

The Issue must not falsely claim an agent has been assigned or coding has been authorized.

## 6. Relationship with Development Management

The distinction between Planning and Dev is fundamental.

### Planning Owns

- Researching upcoming engineering requirements.
- Investigating current implementation gaps.
- Identifying candidate work packages.
- Defining bounded candidate scopes.
- Establishing dependencies and technical context.
- Writing acceptance criteria.
- Creating new engineering Issues within authorized planning scope.
- Assigning permanent codenames during Issue creation.
- Placing new Issues into Triage.
- Providing planning evidence and clarification to Dev.

### Dev Owns

- Evaluating implementation readiness.
- Determining current engineering priorities within the approved roadmap.
- Selecting the next assignments for execution.
- Coordinating dependencies against live implementation.
- Managing active coding-agent workloads.
- Allocating and dispatching coding agents.
- Establishing implementation ownership.
- Coordinating concurrent development.
- Managing corrections arising from Review.
- Tracking assignments through implementation and verification.

### Transfer of Responsibility

Once Planning creates an Issue, Dev may inspect and evaluate it.

Dev may:

- Accept its scope for readiness consideration.
- Request additional technical investigation.
- Identify an unmet prerequisite.
- Recommend narrowing or splitting the assignment.
- Defer it.
- Present an authorization question to Aaron.
- Move authorized, ready work into the appropriate operational state through the established board process.

Planning should answer technical clarification requests and revise candidate scope when appropriate.

Planning must not move its own Issues to Ready to Assign or In Progress merely because it considers its research complete.

**Planning creates the candidate assignment. Dev controls its transition into executable engineering work.**

### Urgent Corrective Work

Urgent corrections arising during active implementation or Independent Review remain under Dev's operational coordination.

Dev may arrange necessary corrective assignments within established authority rather than diverting every urgent defect into advance planning.

Planning should not interfere with an active correction cycle unless Dev or Aaron requests its assistance.

## 7. Relationship with Other Departments

### 7.1 Independent Review

Independent Review examines actual implementations and issues technical dispositions.

Planning prepares proposed future work.

Review may identify technical gaps or missing tests that warrant a separate engineering assignment.

Planning may investigate these when referred by Dev or Aaron.

Planning does not approve PRs or determine whether an existing implementation passes independent review.

### 7.2 Checks & Merge

Checks & Merge evaluates hosted CI, required checks, exact-commit evidence, and merge readiness.

Planning identifies anticipated verification requirements before an assignment begins.

Planning does not certify CI results, merge readiness, or release acceptance.

### 7.3 General Administration

General Administration coordinates organizational standards, department responsibilities, cross-department operations, and special assignments.

Planning is responsible for engineering requirement investigation and candidate Issue creation, not organizational governance.

Changes to departmental boundaries require Aaron's approval.

### 7.4 Project Board Steward

The existing Bibleberry Development Project is the common operational board.

Planning creates Issues in Triage and ensures that their originating records are accurate.

The designated Project Board Steward may handle routine board administration, status hygiene, and reconciliation.

Planning must not create a competing board or independently alter another department's active assignment status.

### 7.5 Coding Agents

Coding agents implement authorized engineering assignments.

Planning may examine their accepted implementations or request technical information through the established coordination process.

Planning does not independently commission coding agents to implement proposed Issues.

### 7.6 Aaron and Alexis

Aaron retains product, technical, assignment authorization, architecture, merge, and release authority.

Alexis retains theological, editorial, teaching-content, and applicable ministry-facing visual authority.

Planning must not convert an unresolved decision belonging to either person into an engineering requirement.

Where decisions remain open, the Issue must identify the dependency or Planning must present the decision before creating an implementation-ready proposal.

## 8. Sources of Truth

Planning must work from current authoritative evidence.

### Primary documents

- `docs/ai-operations/handoff-standard.md`
- `docs/ai-operations/departments/engineering-issue-planning.md`
- `docs/product/application-development-roadmap.md`
- `docs/development-workflow.md`
- `docs/ai-development-protocol.md`
- `docs/project/current-status.md`
- `docs/project/internal-alpha-readiness.md`

### Additional technical sources

As applicable:

- Approved reader-experience specifications.
- Content-management and publishing architecture.
- The accepted R06 implementation architecture and audit.
- Existing GitHub Issues and PRs.
- Current accepted source code.
- Existing tests and CI workflows.
- Relevant integration and security contracts.
- Current development ownership and active assignments.

### Evidence Hierarchy

The canonical roadmap governs approved development sequencing.

Approved product specifications establish required behavior.

Accepted code establishes the current implementation baseline.

GitHub Issues establish assignment identity and documented scope.

PRs, commits, reviews, and CI establish submitted changes and verification evidence.

A historical planning document or conversational handoff does not override newer accepted implementation.

**Planning must reconcile what was intended with what has actually been built.**

## 9. Standard Planning Workflow

### Step 1: Establish the Planning Assignment

Identify the roadmap area, milestone, or engineering investigation Aaron has authorized.

Determine the intended planning horizon and relevant dependencies.

### Step 2: Inspect Current State

Read the applicable governing documents.

Verify current `main`, relevant Issues, PRs, and existing implementation.

Identify completed, active, and outstanding work.

### Step 3: Identify Candidate Engineering Gaps

Determine what requirements remain unmet.

Identify which gaps warrant new assignments and which belong to existing Issues or active development.

### Step 4: Investigate Technical Scope

Inspect relevant source files, interfaces, tests, and architectural dependencies.

Establish a bounded objective, exclusions, prerequisites, and meaningful verification expectations.

### Step 5: Check Existing Assignment History

Search current and historical Issues and PRs for duplicate, completed, overlapping, or superseded work.

Verify that any proposed new codename is unique.

### Step 6: Create the Issue

For each qualified candidate within the authorized planning scope:

1. Select a unique permanent Descriptor + Noun codename.
2. Create the Issue using the required structure.
3. Include relevant source and dependency links.
4. Ensure it is represented in the existing Bibleberry Development Project as Triage.
5. Leave implementation ownership unassigned.
6. Clearly identify Dev as the next responsible department.
7. Verify the Issue was created with the intended content and identity.

If Project board access is unavailable, create the Issue when authorized and report the board-association limitation without falsely claiming Triage placement.

### Step 7: Report to Development Management

Provide Dev with a concise summary of the newly created Issues.

Identify:

- Codename and Issue number/link.
- Engineering objective.
- Dependencies.
- Important readiness limitations.
- Suggested dependency order, if relevant.
- Outstanding decisions.

Planning recommendations do not bind Dev's active scheduling decisions.

### Step 8: Reconcile Feedback

Respond to Dev's technical clarification requests.

Correct planning errors, missing requirements, or ambiguous acceptance criteria.

Do not independently change an Issue's approved implementation scope after Dev has accepted or dispatched it.

Material changes to an active assignment must follow Dev's coordination and Aaron's authorization requirements.

## 10. Planning Horizon and Backlog Discipline

Engineering Issue Planning exists to prepare useful future work, not to produce the greatest possible number of Issues.

The canonical roadmap presently calls for a small number of bounded, authorized active assignments.

Planning should work far enough ahead to prevent avoidable interruptions while respecting the project's capacity to implement, review, integrate, and accept the work.

### Preferred approach

- Concentrate on the next known engineering dependencies.
- Investigate work that will soon become actionable.
- Prepare a small coherent group of candidate Issues.
- Reevaluate assumptions after material accepted changes.
- Avoid pre-opening every future roadmap package.
- Avoid artificial deadlines, percentages, and speculative requirements.

Longer-term architectural research may be valuable without immediately producing Issues.

An investigation can legitimately conclude that existing Issues already cover the work or that further product decisions are required.

**Planning quality is measured by the usefulness and accuracy of prepared assignments, not Issue count.**

## 11. Successor Continuity

Engineering Issue Planning follows:

`docs/ai-operations/handoff-standard.md`

When Aaron requests a departmental handoff, the outgoing Planning conversation must preserve the following.

### 11.1 Current Planning Assignment

- Authorized planning area.
- Relevant roadmap phase or milestone.
- Scope and limits of the investigation.
- Important owner decisions.

### 11.2 Verification Checkpoint

- Last inspected repository and `main` SHA.
- Date and time of verification.
- Significant source files and documents examined.
- Relevant active Issues and PRs.
- Known limitations of the investigation.

### 11.3 Issues Created

For each newly created Issue:

**Codename | Issue number | Triage status | Objective | Dependencies | Next action**

Include direct GitHub links.

Clearly distinguish Issues actually created from drafts or recommendations.

### 11.4 Investigations in Progress

Preserve:

- Candidate engineering gaps still being researched.
- Known existing implementation.
- Unresolved technical questions.
- Outstanding dependency investigation.
- Duplicate-work concerns.
- Missing authorization or product decisions.

### 11.5 Coordination with Dev

Identify:

- Issues already referred to Dev.
- Clarifications requested by Dev.
- Candidate scopes needing revision.
- Work Dev has accepted, deferred, or declined when verified.
- Pending responsibility transfers.

### 11.6 Immediate Next Actions

Give the incoming Planning conversation a concise, prioritized account of what to investigate, complete, or report.

The successor must recheck live GitHub state before creating new Issues.

Do not duplicate already created assignments simply because the previous conversation ended.

The handoff is operational context, not a separate backlog.

## 12. Operational Risks and Safeguards

### Duplicate Engineering Assignments

A new codename does not make duplicated work legitimate.

Search existing Issues, PRs, and accepted code before creating assignments.

### Stale Architectural Assumptions

The application changes during active development.

Planning must verify current implementation and identify assumptions that require rechecking before Dev dispatches work.

### Overplanning

Excessive advance planning can create obsolete Issues and administrative overhead.

Keep planning close enough to executable development to remain useful.

### Unauthorized Product Decisions

Planning must not convert its preferred design or architecture into an approved requirement.

Preserve Aaron's and Alexis's decision authority.

### Overlapping Departmental Authority

Planning owns research and candidate Issue creation.

Dev owns readiness, allocation, and execution.

Review owns independent technical dispositions.

Checks & Merge owns its verification and merge-readiness function.

These boundaries must not be blurred simply to accelerate an assignment.

### Inadequate Issue Definition

An Issue that lacks a coherent objective, clear acceptance criteria, or adequate dependency investigation creates unnecessary work for Dev and coding agents.

Planning should resolve such deficiencies before submitting it for readiness evaluation.

### False Implementation Claims

Planning must distinguish planned functionality from accepted code and actual verified results.

A roadmap entry, proposal, or partially merged feature is not proof of an integrated capability.

## 13. Governing Principle

**Engineering Issue Planning exists to turn Bibleberry's approved future engineering needs into thoroughly researched, appropriately scoped, and verifiable GitHub assignments.**

Planning researches the work and creates candidate Issues.

Development Management evaluates readiness, coordinates engineering execution, and dispatches authorized assignments.

Coding agents implement.

Independent Review evaluates technical correctness.

Checks & Merge evaluates the applicable verification and merge requirements.

General Administration supports organizational governance and continuity.

Aaron retains final product, engineering, merge, and release authority. Alexis retains her established theological, editorial, and applicable visual authority.

The department should keep Bibleberry prepared for its next engineering steps without creating competing roadmaps, speculative backlogs, or unnecessary management overhead.
