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
