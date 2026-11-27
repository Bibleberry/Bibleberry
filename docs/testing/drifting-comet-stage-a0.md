# Drifting Comet · Stage A0 preparation

[Issue #333](https://github.com/Bibleberry/Bibleberry/issues/333) · [Dev commissioning](https://github.com/Bibleberry/Bibleberry/issues/333#issuecomment-7209480867) · [Proposed roster](drifting-comet-march-2027-roster.csv)

Stage A0 delivers a proposal and offline evidence for Alpha A. Aaron's disposition is pending for the month, dates, manifest, assets, operator, review attribution and permitted Stage A1 actions. A2 and A5 remain **NOT VERIFIED**. The March records below are proposed only.

## Proposed March 2027 manifest

March exercises the February 27 preview boundary and affords preparation time before the live date windows. Reserve `2027-03` only after the authorized operator clears the collision preflight and Aaron approves the date plan. The month avoids the existing R08A far-future fixture identities. Actual availability is unverified.

| Schema and purpose | Published base ID | Slug or key |
| --- | --- | --- |
| `monthlyPublication`, Synthetic QA · Drifting Comet · March 2027 | `month-2027-03` | `yearMonth=2027-03`, `year=2027`, `month=3` |
| `newsArticle`, Synthetic QA · March rehearsal preview | `news-preview-2027-03` | `drifting-comet-2027-03-preview` |
| `challenge`, Synthetic QA · Calendar check DD (31 records) | Studio-assigned, capture each base ID against its CSV row in the restricted rehearsal record | Exact slugs and civil dates in the [roster](drifting-comet-march-2027-roster.csv) |
| `scriptureCard`, Synthetic QA · Pattern pair | `card-drifting-comet-2027-03-thematic` | `drifting-comet-2027-03-thematic` |
| `scriptureCard`, Synthetic QA · Full calendar | `card-drifting-comet-2027-03-full` | `drifting-comet-2027-03-full` |

The four deterministic IDs open via the existing Studio Structure. Ordinary Challenge creation assigns an opaque ID. Its stable slug identifies the planned record before creation. Record the ID immediately, and link only that actual base ID in the roster, finalization and discovery references. Reader identities for Finish/progress use `cms:<base-id>`. Retain each ID and slug across corrections. A series is optional and omitted. The introduction, welcome, discovery and roster audit are embedded in the month. The baseline is 35 documents plus the two image assets below.

- **Challenges.** Use `challengeType=reflection`, a synthetic source title and one guided screen containing a plain statement such as “Synthetic calendar check for March DD.” Use `primaryScripture` reference metadata only (proposed Psalm 19:1, WEBP), `textStatus=referenceOnly` and `practiceStatus=notConfigured`. Omit passage, standalone `releaseAt`, series, sequence, import provenance and companion links. Make days 01 and 02 the pattern pair by labeling their statements as the first and second parts of the same synthetic observation. Use each CSV row once.
- **Month.** Generate 31 civil-date slots with the existing month template. Use one ordered `scheduled` slot for each CSV row and link its Challenge. Embedded preview screen heading “March rehearsal preview” with one statement “This is a synthetic calendar rehearsal.” Welcome heading “Welcome to the March rehearsal” with one statement “The March test calendar is open” and CTA “Open March Calendar.” No cover image.
- **News.** Use the deterministic monthly preview template, `category=monthlyPreview`, `publishOnDate=2027-02-27`, `relatedMonth` pointing to the base month ID, and a short summary “Preview the synthetic March calendar rehearsal.” Link the month’s `previewNews` back to this base News ID. Both references are weak. Omit body, artwork and generated snapshot.
- **Cards and earning.** Both use `plannedYearMonth=2027-03` and different base Card IDs. Link the `monthlyThematic` Card from discovery slug `pattern-pair`, title “Pattern pair,” with exactly the Day 01 and Day 02 Challenge references. Link the `monthlyFull` Card from `fullMonthCard.card`, with title “Full calendar.” Its qualifying set is the full active finalized roster. Use actual Card references and leave `reservedCardId` unset. Keep sharing disabled for both. Use Psalm 19:1 (book Psalms) as citation metadata with no passage text. The Card reference-only convention is `scriptureCitation.translation="Not configured"` with Scripture translation usage rights unasserted. Verify it against the existing Card tests and readiness inspector.

### Proposed assets

| Asset filename | Card | Original illustration to prepare | Illustration alt | Accessible transcription |
| --- | --- | --- | --- | --- |
| `drifting-comet-2027-03-thematic-v1.png` | Pattern pair | Two offset circles on a solid field with the short label below | Two overlapping circles on a dark background. | Synthetic QA · Pattern pair |
| `drifting-comet-2027-03-full-v1.png` | Full calendar | Calendar grid with 31 marked cells and the short label below | A calendar grid with thirty-one marked cells. | Synthetic QA · Full calendar |

The designated creator makes the two flat PNGs from original geometric shapes and the specified synthetic labels. Record the creator, source, exact file checksum, approved use, attribution, actual Sanity asset ref and `assetRevision=v1`. Confirm the labels match the transcription and remain legible and distinct from the illustration descriptions. Leave `rightsAndAttribution.usageRightsConfirmed` unset or false until Aaron accepts documented rights for the exact file. Artwork is pending. There are no additional uploads or stock assets in this proposal.

## Read-only preflight

1. Match the current Studio revision and workspace config to project `80016lrq`, dataset `staging`, title **Bibleberry Staging** and route `/staging`. In approved project metadata, have the operator confirm staging is private and their authorized read role can see both drafts and published content. Confirm the production boundary against the separate `/production` configuration and the CLI's **production** default. Restrict any live production check to existing authorized project metadata. Use the explicit staging query endpoint below for inventory. Leave permissions, credentials, CORS and all datasets as found. A workspace label or empty query cannot prove privacy or draft visibility.
2. In the existing authorized read-only GROQ client, use **GET** on `https://80016lrq.api.sanity.io/v2026-11-01/data/query/staging` with `perspective=raw` on the non-CDN host. Bind `$month` to `"2027-03"`, `$ids` to the four deterministic base IDs **plus each corresponding `drafts.<id>`**, `$slugs` to the 31 CSV slugs plus the three News/Card slugs, and `$filenames` to both proposed filenames. Inspect authorized release-version inventory for the target IDs if releases are present, including records with different field values. Once files and Studio IDs exist, also check the exact asset refs and actual base/draft IDs. Use separate bounded queries for unrelated fixture baseline counts by type and perspective, plus scoped existing fixture IDs/revisions where authorized. Preserve [#63](https://github.com/Bibleberry/Bibleberry/issues/63) and existing fixture evidence.

   ```groq
   *[
     _id in $ids ||
     (_type == "monthlyPublication" && yearMonth == $month) ||
     (_type == "scriptureCard" && plannedYearMonth == $month) ||
     (_type == "newsArticle" && relatedMonth._ref in $ids) ||
     slug.current in $slugs ||
     (_type == "sanity.imageAsset" && originalFilename in $filenames)
   ]{_id, _rev, _type}
   ```

3. For assigned Challenge IDs, check `*[_type == "monthlyPublication" && count(slots[challenge._ref in $challengeIds]) > 0]{_id, _rev}` in raw perspective, with both base and draft IDs in `$challengeIds`. Before finalization, the only expected reference owner is this rehearsal month. Record collisions and stop before touching an existing record. After a partial run, resume only when the existing record's ID, slug, revision and provenance match the authorized run. Recheck immediately before the authorized operation. A collision, incomplete inventory, unverified role, wrong target or failed query is a hold.
4. Keep tokens and raw readback in the authorized operator environment. For shared evidence, record UTC timestamp, operator/role, verified workspace and privacy status, query scope, counts and disposition. Keep existing unrelated IDs/revisions and private screenshots in a restricted record. If access is absent, mark inventory **NOT RUN**, and route it through Dev to an authorized operator. The [accepted fixture CLI](../../scripts/r08a-monthly-fixtures.ts) preflights only its own far-future identities. Its output cannot clear this manifest.

**A0 preflight result:** Repository configuration confirms the intended staging route and distinct production default. The accepted fixture probe reported `NOT_RUN` because an authorized read token was absent. Live privacy, draft visibility, fixture inventory and collision status are pending. No Sanity requests were sent by that probe.

## Manual Studio rehearsal · Stage A1 procedure for owner review

**Entry gate.** Begin only after Aaron records Stage A1 authorization covering the exact staging workspace, month, manifest, asset rights, named operators/reviewers and permissible draft, publish, correction, withdrawal and recovery actions. Resolve the Challenge review gate below before starting the sequence. Separate future gateway/reader acceptance is Alpha B. Keep a restricted log from the first operation.

1. **Open the verified staging workspace.** Use an already approved Studio origin and the `/staging` route. Confirm project and dataset before editing and after each workspace switch or restart. Start with **Monthly publications → 2027 calendar months → 2027-03 → Monthly publication**. Check the deterministic ID, populated dates and draft status. Opening an initial-value editor and entering content belongs to the authorized A1 session.
2. **Author the content manually.** Under **Challenges**, create one ordinary Challenge per CSV row. Capture the opaque base ID from the Studio document inspector and pair it with the stable slug and date before advancing. Populate and validate identity, Scripture metadata and guided screens. Replace the `statementBlock.label` default (“Alexis’s teaching”) with “Synthetic QA” in every Challenge, preview and Welcome statement. Under **Scripture Cards → Open or create Scripture Card**, enter each manifest slug without `card-` and confirm the resulting ID. Attach only the approved exact images, fill accessibility and rights metadata, select the correct category and set the planned month. Create preview News via the month’s **Advance preview News** pane and verify its date and reciprocal link. In the month draft, link the roster, News, discoveries and Cards and fill the Introduction & Welcome fields.
3. **Review and validate.** Move the month and Cards from draft into review, inspect all form errors and verify the 31 date/slot/Challenge matches. Review the two thematic links and confirm distinct Card IDs, correct placement, rights and alt/transcription. For month, Cards and News, record the real reviewer, actual review time and `technical_synthetic` role when the authorized technical review happens. Keep unreviewed Challenge drafts blocked. **Challenge review gate:** the Challenge has a legacy `editorialReview.adaptationReviewed` gate whose validation explicitly requires Alexis review, while the newer monthly types have a named synthetic role. Obtain a truthful review that satisfies this existing gate or hold publication and route the mismatch via Dev for separate disposition. Do not use the offline fixture's simulated reviewer or approval values in Studio.
4. **Finalize and schedule only within the approved actions.** After truthful review and zero blocking errors, publish the Challenges and approved Cards in staging so published references resolve. Review the month’s finalized set against all 31 actual base IDs. Record `isFinalized=true`, `rosterVersion=1`, real `finalizedBy` and `finalizedAt`, exact `finalizedChallengeIds`, no prior rosters and all slots scheduled. Record the approved state, then set `editorialStatus=scheduled` and publish to staging. Publish the reviewed preview News with its configured date. “Scheduled” is the month’s editorial state. Sanity Publish puts a record in the published perspective, and the gateway controls date-based reader eligibility. There is no need to create a Sanity scheduled release. Capture revisions and sanitized validation/readback at each milestone.
5. **Inspect published readiness.** Open **Monthly publications → 2027 calendar months → 2027-03 → Editorial readiness report**, or use **Inspect monthly readiness (YYYY-MM)**. Record dataset, report time, status, counts and diagnostics. Compare raw and published results for draft overlays. Require `checksPass` on the baseline and independently confirm all 31 published Challenges, exactly two published approved Card links, finalized roster, and published preview News. Draft-only progress may show blocked or needs review. A query/permission error or unknown state requires resolution. Inspect the [accepted readiness workflow](r08a-7-monthly-readiness-inspector.md) for the meaning of each status.
6. **Exercise a copy-only correction.** After the baseline is captured, propose a Day 01 statement wording correction (“Synthetic calendar check” to “Synthetic calendar check updated”). Recheck workspace, ID and prior revision, have the authorized reviewer review the actual change, then validate and publish only that Challenge if approved. Keep slug, date, references, artwork and roster version stable. Record before/after revisions, actor/time, diff and subsequent readiness. For an authorized reversal, inspect the prior wording in Studio history, restore only that field in a draft, review and publish a new revision.
7. **Exercise whole-month withdrawal after historical and earned-Card evidence.** With separate action approval, record the baseline month revision and rationale, set its whole-month `withdrawn` flag and publish only that month change. Keep the roster and references intact. Expect the inspector to report withdrawal and the gateway to suppress month, linked Challenge delivery and linked preview News. Capture actual direct-route and listing results, including cache observations, on the Alpha B candidate. Preserve the pre-withdrawal snapshot and any earned evidence. For authorized recovery, review the unchanged roster and linked published revisions, clear the flag on the same month, publish a fresh revision and recheck readiness and routes. Record the final owner disposition and current state. Formal slot withdrawal needs a versioned amendment and is covered by the offline fixture suite. It is outside this proposed live action. Preserve all records without automatic deletion.

## Timing and Alpha B handoff

Use actual server time and the authorized reader-local civil date. Use `America/New_York` for the primary replay and record UTC and effective zone for each case. Finish rehearsal authoring and publish sufficiently before the pre-preview observation if the owner approves this calendar. Record any missed or unavailable window as unobserved. Reschedule through an approved replacement manifest or use offline time-controlled evidence labeled as such.

| Reader-local date | Evidence to collect on the separately authorized connected candidate |
| --- | --- |
| 2027-02-26 | Before preview, guessed month/Challenge URLs fail closed and the preview News is absent. |
| 2027-02-27 through 2027-02-28 | Preview News links to the month preview. Inspect preview-safe calendar and introduction only. Welcome, Challenge identities and unearned artwork/qualifying links stay withheld. |
| 2027-03-01 | Welcome and Day 01 become available. Day 02 direct access is still denied. Finish Day 01 once to record partial thematic progress with no artwork. |
| 2027-03-02 | Day 02 opens. With the same guest, Finish Day 02 and check the thematic Card becomes earned while full-month artwork remains withheld. Test unearned behavior with a fresh guest. |
| 2027-03-31 or later | Day 31 can count only after release and Finish. Complete all 31 distinct eligible Challenges to earn the full-month Card. |
| 2027-04-01 or later | Confirm historical month and Challenges remain readable before withdrawal. After authorized withdrawal, repeat direct URL, listing and preview-News checks and record recovery if performed. |

The handoff to Alpha B carries the accepted Studio and candidate SHAs, approved manifest and rights evidence, exact ID-to-date/slug/asset mapping, before/after revisions, UTC action timestamps, operators and approval links, validation/readiness evidence, and access/collision disposition. Keep sensitive details in the restricted operator record and publish a sanitized summary. Distinguish Studio readiness, gateway behavior and guest-earned evidence. Stage A0 executed none of these live actions.

## Offline evidence

Run from the repository root:

```sh
node --experimental-strip-types scripts/r08a-monthly-fixtures.ts
npm --prefix studio ci
CI=1 npm --prefix studio run test:schema
CI=1 npm --prefix studio run typecheck
```

The existing R08A-4A fixtures stay offline and unchanged. The dry run reported **110/110 gateway checks**, with 127 deterministic documents and SHA-256 `3622899c2eae45ada31d0de81a43113b128afff6fafee452e6823a16683e76a8`.

| Days | Offline fixture month | Preview start |
| --- | --- | --- |
| 28 | 2098-02 | 2098-01-28 |
| 29 | 2096-02 | 2096-01-28 |
| 30 | 2098-04 | 2098-03-28 |
| 31 | 2098-03 | 2098-02-27 |

The existing Studio suite passed **58/58 tests**, including actual schema validation for all four fixture months, 118 Challenges and five News articles, formal roster withdrawal and rejection cases, linked Card validation, and read-only readiness evaluation for each month length. Its local clients simulate queries and editorial approval conditions. The proposed March roster and asset/ID plan still require actual Studio validation and live readback in the approved rehearsal.

The proposed CSV was also compared row by row to `buildMonthlySlots(2027, 3)` and its preview date to `computeAdvancePreviewStartDate(2027, 3)`. All 31 dates, ordered slug suffixes, scheduled slot values and two thematic qualifiers matched the plan. Studio typecheck and a local Studio bundle build passed.
