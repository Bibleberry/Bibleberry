# Bibleberry | Convening The Three Families

**Document type:** Cross-department advisory review procedure  
**Repository path:** `docs/ai-operations/three-families-protocol.md`  
**Authority:** Aaron Waid, Project Owner  
**Procedure steward:** General Administration  

## 1. Purpose and terminology

**Convening The Three Families** is Bibleberry's structured method for seeking independent assessments from frontier AI models representing three different leading model providers before consequential engineering, architectural, product, or program-management decisions.

**A formal meeting of The Three Families is called a Convocation.** The procedure is *Convening The Three Families*; each particular exercise is a *Convocation*. These names identify an advisory method and event, not a department, authority, governing body, or vote.

The procedure exists to reduce single-model blind spots, challenge unsupported assumptions, reveal material disagreements, and turn cross-model analysis into actionable, evidence-based recommendations. It does not establish another department, review authority, roadmap, vote, or automated decision-maker.

**The three families are OpenAI, Anthropic, and Google.** For each Convocation, Aaron selects the strongest suitable frontier model available to him from each provider, considering reasoning capability, tool/repository access, and task fit. Exact model names, versions, reasoning settings, and access limitations are recorded for that Convocation. The providers remain stable reference families; specific model selections are not permanent policy.

## 2. Authority and roles

- **Aaron** alone authorizes a Convocation, sets the decision question and constraints, and decides what conclusions to adopt. An AI consensus has no independent project authority.
- **General Administration** maintains this procedure, assists with assembling the brief and recording the outcome when asked, and handles authorized governance-documentation changes through the existing Issue → PR → Checks & Merge → owner-merge process.
- **Engineering Issue Planning** may recommend a Convocation, supply accepted roadmap and Issue evidence, compare findings, and convert approved engineering outcomes into bounded candidate Issues and Project classifications under its charter.
- **Development Management** may recommend a Convocation, supply implementation/dependency evidence, and later determine readiness, sequence, and coding-agent dispatch for owner-authorized work.
- **Independent Review** retains its established exact-HEAD technical PR review responsibility. A Three Families assessment cannot replace required Independent Review, CI evidence, Checks & Merge, or owner acceptance.
- **Alexis** retains theological, editorial, and applicable ministry-facing visual authority.

## 3. When to call a Convocation

A Convocation is appropriate when a decision is consequential, cross-cutting, disputed, difficult to reverse, or likely to affect multiple milestones. Examples:

- Re-evaluating the engineering roadmap or selecting a major milestone sequence.
- Choosing between materially different architectures or service/security designs.
- Investigating significant discrepancies between repository reality and program reports.
- Reviewing major integration, alpha/beta qualification, launch-readiness, or migration risks.
- Resolving a substantive disagreement that ordinary departmental analysis cannot settle confidently.

A Convocation is **not** normally justified for routine Issue creation, ordinary technical PR review, small fixes, formatting, or a question already answered by accepted specifications and verified source. Any department may propose one; Aaron decides whether the expected value merits the cost.

## 4. Preparation: one controlled assessment brief

Before inviting the three models to a Convocation, the coordinating person prepares **one identical primary brief**, including:

1. A precise decision or assessment question and what outcome would be useful.
2. Repository and relevant systems, current `main` SHA, and assessment date. If the repository changes during the Convocation, the synthesizer must identify the delta and reverify affected claims.
3. The accepted documents, Issues, PRs, source areas, test/CI evidence, and constraints that each assessor must examine.
4. Clear separation of approved requirements, current implementation, unverified claims, open decisions, and proposed work.
5. Required questions, deliverable structure, evidence expectations, and explicit treatment of risks and alternatives.
6. A **read-only boundary** unless Aaron has separately and explicitly authorized a different task; no Issues, code, branches, PRs, service writes, deployment, or governance changes during an advisory assessment.
7. A prohibition on substituting earlier model explanations for repository evidence and on treating an AI recommendation as authorization.
8. A privacy/security check: do not include credentials, private tokens, protected user data, or unauthorized external-service information.

Keep the decision brief stable across all three assessments. If one assessor requires a material clarification, give the same clarification to the others or disclose the difference in the record.

## 5. Independent assessment: three sealed responses

- Give each selected model the same brief in a **separate conversation/context** with access to the same permissible sources, as far as practical.
- Do **not** share any assessor's response, interim recommendation, or reasoning with another assessor before all three have submitted their independent reports.
- Require each report to name the exact inspected `main` SHA; distinguish verified facts, inferences, assumptions, incomplete access, and recommended actions; link to relevant evidence.
- Require a direct answer, a dependency-aware recommendation, meaningful alternatives, uncertainties, and the strongest objection to its own recommendation.
- Preserve all three responses substantially unedited, with provider, exact model, configuration, date, and material tool/access limitations. If a model lacks independent repository access, mark the assessment as access-limited rather than treating it as fully corroborating source claims.
- If a selected provider cannot be represented, record the missing family. Do not describe the exercise as a completed three-family independent Convocation.

The goal is independent evidence-informed judgment, not three copies of a favored proposal.

## 6. Synthesis and adjudication

After all three independent reports are complete, a designated synthesizer (a model, Planning, Admin, or a person selected by Aaron) may read them together and verify material conflicts against current authoritative sources.

The synthesis must:

1. Identify genuine consensus **and** the extent to which shared prompts, documents, or existing Issues explain that consensus.
2. Identify material disagreements and adjudicate them by evidence, risk, reversibility, dependencies, and project constraints, **not majority vote**.
3. Distinguish source-verified observations from unverified findings and model recommendations.
4. Check for superseded Issues, duplicate work, stale PR/commit assumptions, and new changes since the common baseline.
5. Propose one defensible action sequence, specific acceptance evidence, parallelizable work, decisions required, and items to defer.
6. State any remaining dissent, testing/access limitations, and the consequence of choosing a different option.

A fourth Planning or expert contribution can inform synthesis, but it must be labeled as a **dependent evaluation**, not counted as a fourth independent family. A later synthesis model is an adjudicator, not another independent vote.

## 7. Owner decision and execution handoff

The synthesizer presents an **owner decision brief** containing:

- The exact question and baseline investigated.
- What the three independent reports established and what remains uncertain.
- Material agreements and adjudicated disagreements.
- The recommended decision and alternatives.
- Specific owner approvals needed and the consequence of deferral.
- Proposed Issue changes, candidate new Issues, milestones, dependencies, and verification gates.

**Aaron explicitly accepts, rejects, modifies, or defers each consequential recommendation.** Silence and apparent model consensus do not authorize action.

Once approved:

- **Planning** checks for existing Issue coverage, creates or clarifies bounded engineering candidate Issues within its authority, applies the canonical milestone/workstream classification, and places them in Triage.
- **Development Management** evaluates readiness and sequencing and coordinates separately authorized implementation.
- **Independent Review, General Administration's Checks & Merge, and Aaron** retain their normal respective review, check, merge, and release controls.
- Approved product or roadmap changes go through their established authoritative documents; raw assessment reports do **not** automatically amend the canonical roadmap.

## 8. Recordkeeping and continuity

Preserve one discoverable record for each consequential Convocation, preferably linked from the relevant existing decision Issue, milestone tracker, or administrative assignment. Record:

- Date, topic, decision owner, common prompt/brief, sources and baseline SHA.
- Three model/provider identities, configurations, independent responses, and source-access limitations.
- Synthesis, material disagreements, evidence checks, and owner dispositions.
- Links to resulting Issues/PRs or explicit deferred decisions.

Large original reports may be kept as linked attachments or one deliberately chosen research artifact where access and durability are appropriate. Do not turn every Convocation into a parallel roadmap or duplicate tracker. Durable approved requirements remain in existing authoritative product, roadmap, Issue, and governance records.

The next department/conversation must be able to recover the accepted outcome from GitHub without relying on a chat's memory.

## 9. Cost and quality controls

- Call a Convocation for high-impact questions, not every engineering decision.
- Use the most capable appropriate model from each family for the task, but record substitutions, reasoning settings, and access constraints rather than claiming fixed universal rankings.
- Reuse the same controlled dossier and agreed baseline to minimize redundant setup and unfair comparisons.
- Do not repeat the entire Convocation unless material new evidence, a new decision question, or a consequential changed requirement justifies it.
- No model receives authority to mutate project systems merely because it participated.

## 10. Operating checklist

- [ ] Aaron authorized the specific Convocation and defined the decision question.
- [ ] One common, evidence-linked, read-only brief is prepared with baseline SHA.
- [ ] Current frontier model and settings from OpenAI, Anthropic, and Google are recorded.
- [ ] Three separate, independent responses were collected before cross-sharing.
- [ ] Responses preserve their evidence, limitations, alternatives, and uncertainty.
- [ ] Synthesis adjudicated discrepancies against authoritative sources.
- [ ] Aaron recorded explicit decisions or deferrals.
- [ ] Approved actions were routed to Planning, Dev, Review, and Admin under existing authority.
- [ ] Resulting Issue/PR links and acceptance gates are traceable in GitHub.

**Governing principle:** *Three independent perspectives inform the decision. Verified evidence tests their claims. Aaron authorizes what Bibleberry does next.*
