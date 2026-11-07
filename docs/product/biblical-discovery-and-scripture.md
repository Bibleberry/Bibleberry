# Bibleberry — Biblical Discovery, Scripture, and Weekly Formation

> **Working product design record — not an implementation specification**
> **Established:** November 6, 2026
> **Status:** Settled principles, approved direction, exploratory experience ideas and research claims are separated.
> **Product lead:** Aaron Waid | **Theological/editorial and ministry-facing visual authority:** Alexis Waid
> **Related:** [Gamification and achievements](gamification-and-achievements.md) · [Product roadmap](application-development-roadmap.md) · [November 6 design-session record](2026-11-06-design-session-record.md)

## 1. The product this serves

Bibleberry is a free, mobile-first **Christian biblical formation** application presenting Alexis Waid's substantive biblical teaching as dated, interactive **Challenges**. The intended experience is theological learning with Scripture, not generic wellness, inspirational snippets, a quiz platform or a memorization application.

Alexis's material may include biblical context, historical setting, original languages, literary structures, symbolism, canonical relationships, careful theological argument and practical formation. The editorial manuscript determines what the interface needs to communicate, never the reverse.

The normal reader must be a complete, useful experience in its own right. Bibleberry can also help readers grow more capable of exploring Scripture **with their own Bible**. It is **not** a mandate to make every Challenge require a second Bible, another app, or leaving Bibleberry, and it is not a plan to reduce in-app biblical teaching.

A useful product aspiration emerging on November 6: a reader choosing to study Scripture beyond Bibleberry is a positive outcome; maximizing time spent inside the app is not the governing objective. This is a **formation-oriented design philosophy**, not a measurable or implemented requirement.

## 2. Scripture translation: deliberate WEBP choice

**Decided:**

- The **World English Bible, Protestant Edition (WEBP)** remains Bibleberry's chosen primary in-app Scripture translation for launch.
- Aaron values the World English Bible project as a faithful, openly usable English translation. Bibleberry's use of WEBP is **positive and intentional**, not an apology or a placeholder for “better” translations.
- A future **About Bibleberry / About Our Scripture Translation** explanation should plainly state why WEBP is used, emphasizing faithful translation and its public-domain availability. Final reader-facing copy requires editorial review.
- Biblical teaching in WEBP can be consumed entirely inside the app. Readers should not be required to find another Bible to participate in ordinary teaching.

**Separate question:** Verbatim memorization attaches readers to **particular wording**. Different readers have deeply established translation preferences (e.g. NASB editions, NIV, ESV, KJV). Aaron personally prefers NASB for memorization and has experienced translation-edition wording changes. This is why using a single WEBP text for *required in-app memorization* is a materially different proposition from using WEBP for teaching.

Potential future NIV, ESV, NASB and other translation access is **not licensed or approved by this decision**. KJV may merit exploration, but international rights and distribution need independent checking. Each translation's exact edition and permitted uses—including interactive presentation and storage—must be verified separately; permission to quote in commentary does not necessarily authorize a memorization engine.

Do not treat research estimates about publisher caps, API restrictions, app-wide ratio rules, cache periods or required technical infrastructure as universal legal conclusions.

## 3. Weekly experience: Biblical Discovery replaces the memorization slot

**Decided product direction (November 6):** Replace the dedicated **weekly verbatim Scripture Memorization Challenge** in the envisioned launch rhythm with a **Biblical Discovery Challenge**, currently envisaged for **Sunday**.

- It is another **Challenge**, with the same basic inclusion in date-based navigation, archive/completion and monthly participation as other Challenges.
- Its distinctive purpose is to let the reader **investigate, compare, notice, connect or synthesize Scripture**. It should complement, rather than duplicate, Alexis's substantive weekday teaching.
- Its specific investigative interaction is **selected to fit the actual biblical material** Alexis teaches, not imposed according to a fixed four-week rotation. No requirement for a chiasm, hyperlink, historical situation or required prayer component each week.
- **Biblical Discovery** is a useful **working name**; "Sunday Discovery Lab" and Argon's individual names are concepts, not mandatory user-facing branding.
- This direction was accepted by Aaron as likely a better fit for Bibleberry and a concept Alexis may favor. **It has not yet been presented to and approved by Alexis**; final content/editorial UX awaits her decision.
- No production Discovery format, authoring schema, full rotation or launch engineering scope is authorized merely by this vision record.

### Existing pilot and the change in intention

The development-only seven-day pilot currently demonstrates four teaching days (Monday, Tuesday, Thursday, Friday), a Wednesday guided spiritual discipline, a Saturday worksheet/PDF, and a Sunday WEBP progressive-reveal memorization exercise. Its test fixtures and working prototype should not be deleted or misrepresented as already replaced.

The future ordinary-reader plan is **to substitute a Biblical Discovery experience for Sunday's memorization**. The full seven-format taxonomy, exact weekly content plan and CMS authoring contract still require coordination. A weekday/monthly rhythm can remain recognizable without rigidly requiring every date's content to follow the same layout.

## 4. Research ideas for Biblical Discovery — catalogue, not approvals

Gemini Argon's *Reimagining Scripture Memorization: Researching Alternative Weekly Biblical Formation Experiences* (41-page November 6 report, shared in the AppDev conversation as **Bibleberry Weekly Formation Alternatives.docx**) investigated 12 different experiences. They are retained as an **idea library**, not a ready-to-build sequence.

| Concept from research | Possible experience | Current disposition |
| --- | --- | --- |
| **Hyperlink Detective** | Follow a meaningful quotation, allusion, narrative echo or motif between Scripture passages; compare their contexts | High-interest candidate |
| **First-Century Lens** | Test a modern assumption against historically grounded ancient context | High-interest candidate; historical claims require editorial verification |
| **Monthly Constellation** | Connect the week's or month's teachings into a broader theological understanding | High-interest synthesis candidate |
| **The Winepress** | Unpack the meaning of a key passage through progressive facets rather than word-for-word recall | Candidate; name and fixed four-stage pattern are not approved |
| **The Chiastic Lens** | Visually explore a genuinely evidenced chiasm or other literary structure | Candidate; never manufacture symmetry to fit a widget |
| **Contrastive Case Lab** | Compare two biblical narratives, prayers, figures or situations to observe significant differences | Additional candidate |
| **Original-Language Prism** | Explore Hebrew/Greek concepts and translation choices with disciplined contextual exegesis | Additional candidate; avoid root/etymology fallacies |
| **Exegetical Mystery** | Investigate a meaningful, initially puzzling detail in a text | Additional candidate; guard against speculative trivia |
| **VIM Kingdom Laboratory** | Connect teaching to a modest voluntary practice or real-life situation | Additional candidate; distinguish from Wednesday's discipline |
| **Architectural Memory Palace** | Build a visual map of a passage's literary/theological structure | Additional candidate; custom artwork/editorial burden may be higher |
| **Voices of the Cloud** | Compare carefully sourced voices from Christian history on a passage | Additional candidate; quote permissions and scholarly curation matter |
| **Teach-It-Forward Studio** | Practice explaining an insight using a scenario, analogy or structured response | Additional candidate; don't reduce theology to a scored multiple-choice test |

The report's **top five** were Hyperlink Detective, First-Century Lens, Monthly Constellation, The Winepress and The Chiastic Lens. Its three illustrated prototype briefs explored Noah/flood narrative structure (Genesis 6–9), Peter's charcoal-fire scenes (John 18/21), and the returning son/father in Luke 15. These are **Argon-created illustrative content**, not Alexis's manuscripts or approved exegetical claims.

The report recommended a **fixed four-week “Sunday Discovery Lab” rotation** ending in a monthly synthesis. **Not adopted.** Aaron selected a flexible investigative family driven by the biblical material. A monthly synthesis could be useful when content warrants it, but it is not required every fourth or final Sunday.

### A second, distinct approach: guided use of one's own Bible

Aaron subsequently proposed Sunday experiences resembling a **biblical scavenger hunt** or **theme trail**: readers might move through passages in their own Bibles and trace an image or theme (for instance Psalm 23 → Ezekiel 34 → John 10). Bibleberry could guide the investigation, pose observation questions and provide Alexis's explanation.

**Status: exploratory**, no fixed sequence or interaction design approved.

This idea is **one** way to deliver Biblical Discovery, not a requirement that *all* Discovery Challenges or Bibleberry teaching leave the app. The existing WEBP reader can present Scripture fully in-app, while an occasional Challenge may invite voluntary use of the reader's personal Bible for added value.

### Interaction design considerations to explore

- What does the reader actually do beyond tapping to reveal an answer? Can they make an observation or compare material before the explanation is given?
- Which interactions can use existing screen navigation, comparison, choice/reveal and optional-deeper-study components? Which truly require a new reusable content block?
- Can the experience remain complete for someone with only one phone and no physical Bible nearby?
- How do we support Bible novices as well as experienced readers without compulsory testing or fabricated certainty about interpretive allusions?
- How much genuinely new editorial effort is created after Alexis's original material is completed? The research's estimates of 15–30 minutes/week are unverified planning hypotheses.
- Can interactive investigation remain faithful to the argument and voice of an actual Alexis-approved teaching manuscript?

## 5. Personal Scripture library: distinct from memorization

**Previously decided and retained:** A reader should be able to **Save Scripture** encountered anywhere in Bibleberry into a personal reference collection, independently of saving a Challenge.

A saved reference is useful on its own, even if a reader never memorizes it. Verse/reference identity should support deduplication and should not require storing unlicensed copyrighted wording.

**Decided for launch direction:** Bibleberry is **not launching a weekly WEBP memorization drill or a full multi-translation memorization application**. Do not assume an interactive memorization option or memorization-specific quiz belongs in the launch scope.

**Emerging idea, not yet a defined launch feature:** Offer an optional, self-directed **“Memorize with Your Bible”** guided practice accessed from My Scripture or a Foundations resource. The app could identify a saved *reference*, invite the reader to open their preferred Bible/translation, and walk through techniques such as understanding the passage, breaking it into sections, reading aloud, attempting recall, checking the text, and later review. This **teaches a discipline rather than reproducing the text in a proprietary memorization utility**. It would not be the weekly Sunday Challenge.

Potential controls such as “I want to memorize this,” “Practicing,” and “I learned it!” (honor-system, optional, dated) are **candidates** that need UX and launch-scope decisions. Prior discussion accepted an honor-system declaration in principle; that does not override the newer decision **not to ship a fully integrated memorization app**. Saving a reference and choosing it as a memorization goal must remain **distinct**.

The previous progressive-reveal React prototype may be retained for tests or repurposed to interpret a passage. **No repurposing is mandatory or approved as engineering scope**. It should not dictate the reader-facing format.

## 6. Research interpretation and limitations

Argon's new report offered several useful research-informed *hypotheses*: generative learning, case comparison, retrieval and elaboration can support meaningful comprehension; curiosity, contrast and an unresolved information gap may make investigative experiences appealing; repeated identical activities can lose novelty.

We should **not** adopt these stronger assertions as established Bibleberry facts:

- That once-weekly verbatim memory is inherently inferior, or that memory necessarily demands a rigid **12–24 hour** review schedule. Spacing intervals depend on learning goals and retention horizons.
- That clicking a preset answer automatically constitutes **constructive** learning in the ICAP sense. Genuine generation, inference, explanation and accessibility all matter.
- That a particular interactive mode guarantees an “aha” moment, spiritual transformation or a quantified outcome in Bibleberry.
- That every proposed activity is absolutely translation- or licensing-independent. References and original summaries reduce dependence on copyrighted English wording; supplied full-text excerpts or derivative presentation still require rights review.
- That fixed rating scores (e.g. 38/40), claimed editorial minutes or engineering tiers are validated measurements of this project's exact codebase and Alexis's editorial work.

The report explicitly acknowledged that it could not read the GitHub files supplied to it, so implementation estimates were based on the assignment brief. Current code and contract design must be independently reviewed before assigning work.

Aaron explicitly **did not** accept an argument that Scripture memorization must be disparaged in order to choose Biblical Discovery. Memorization remains a legitimate Christian practice; the scope decision is about what Bibleberry is prepared to provide.

## 7. Open product questions (no automatic engineering authorization)

1. **Alexis's review:** Does she approve the Biblical Discovery direction, and what investigative modes best reflect how she actually teaches?
2. **Weekly taxonomy:** Is Sunday the stable label, what is the exact Challenge contract, and how do non-teaching formats share date/Archive/completion mechanics?
3. **Discovery interaction:** Choose a first modest prototype from the research candidates and/or the Bible-in-hand theme-trail idea. Decide whether any user-generated response is stored (default: no).
4. **Content source and rights:** Resolve which passage texts versus summaries/reference pointers can be displayed, and how optional personal-Bible interaction works without making outside apps obligatory.
5. **Scripture library:** Define saved-reference organization, optional personal translation labels, and whether memorization guidance, goals or honor-system “learned” declarations are launch scope or later additions.
6. **Editorial cadence:** What can be prepared alongside monthly/weekly material without creating a second large authoring workload? No mandatory four-week rotation.
7. **Accessibility and tests:** Verify no timer-gated completion, inclusive alternatives to touch-only interaction, and truthful completion tracking.
8. **About WEBP:** Agree the brief positive explanation for readers, with Alexis reviewing final Scripture description.

## 8. Scope boundary

This is a **record of November 6 discussions and research**. It does not delete the existing memorization prototypes, change Sanity schemas, authorize user text uploads/pasting copyrighted translations, alter the release schedule, or approve new UI components. Implementation requires separate scoped assignments, code review, tests and Aaron's PR approval. Alexis's editorial/theological and relevant visual approvals remain separate.
