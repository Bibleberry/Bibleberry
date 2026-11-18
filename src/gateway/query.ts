export const DEFAULT_SANITY_API_VERSION = '2026-11-01'

const UNAPPROVED_BLOCK_COUNT_GROQ =
  'count(screens[].blocks[_type in ["comparisonBlock", "visualCardsBlock", "connectedSequenceBlock", "reflectionBlock", "optionalStudyBlock"] && reviewStatus != "approved"])'

const DUAL_PATH_RELEASE_FILTER_GROQ = `
    withdrawn != true
    && editorialReview.adaptationReviewed == true
    && ${UNAPPROVED_BLOCK_COUNT_GROQ} == 0
    && (
      (
        count(*[_type == "monthlyPublication" && !(_id in path("drafts.**")) && ^._id in slots[].challenge._ref]) == 1
        && count(*[
          _type == "monthlyPublication"
          && !(_id in path("drafts.**"))
          && editorialStatus == "scheduled"
          && withdrawn != true
          && ^._id in slots[].challenge._ref
          && count(slots[challenge._ref == ^.^._id && slotStatus == "scheduled" && date <= $authorizedLocalDate]) == 1
          && count(slots[challenge._ref == ^.^._id]) == 1
        ]) == 1
      )
      || (
        count(*[_type == "monthlyPublication" && !(_id in path("drafts.**")) && ^._id in slots[].challenge._ref]) == 0
        && defined(releaseAt)
        && dateTime(releaseAt) <= dateTime($nowUtc)
      )
    )`

const MONTHLY_ASSIGNMENTS_PROJECTION_GROQ = `"monthlyAssignments": *[_type == "monthlyPublication" && !(_id in path("drafts.**")) && ^._id in slots[].challenge._ref] {
      _id,
      yearMonth,
      year,
      month,
      title,
      editorialStatus,
      withdrawn,
      "slots": slots[challenge._ref == ^.^._id] {
        _key,
        dayOfMonth,
        date,
        slotStatus,
        "challengeRef": challenge._ref
      }
    }`

/**
 * Parameterized GROQ query for currently released, reviewed catalog summaries.
 */
export const CATALOG_GROQ_QUERY = `
  *[_type == "challenge"
    && !(_id in path("drafts.**"))
    &&${DUAL_PATH_RELEASE_FILTER_GROQ}
  ] | order(releaseAt asc) {
    _id,
    _type,
    title,
    "slug": slug.current,
    challengeType,
    "series": series->{
      _id,
      title,
      "slug": slug.current
    },
    sequence,
    releaseAt,
    withdrawn,
    summary,
    primaryScripture{
      reference,
      translation,
      textStatus,
      passage,
      usageRightsConfirmed,
      practiceStatus
    },
    "editorialEligibility": {
      "adaptationReviewed": editorialReview.adaptationReviewed,
      "reviewedAt": editorialReview.reviewedAt
    },
    "unapprovedBlockCount": ${UNAPPROVED_BLOCK_COUNT_GROQ},
    ${MONTHLY_ASSIGNMENTS_PROJECTION_GROQ}
  }
`


/**
 * Parameterized GROQ query for a single released, reviewed Challenge with reader screens.
 */
export const CHALLENGE_BY_SLUG_GROQ_QUERY = `
  *[_type == "challenge"
    && !(_id in path("drafts.**"))
    && slug.current == $slug
    &&${DUAL_PATH_RELEASE_FILTER_GROQ}
  ][0] {
    _id,
    _type,
    title,
    "slug": slug.current,
    challengeType,
    "series": series->{
      _id,
      title,
      "slug": slug.current
    },
    sequence,
    releaseAt,
    withdrawn,
    summary,
    primaryScripture{
      reference,
      translation,
      textStatus,
      passage,
      usageRightsConfirmed,
      practiceStatus
    },
    "screens": screens[]{
      _key,
      _type,
      screenLabel,
      heading,
      "blocks": blocks[]{
        _key,
        _type,
        scripture{
          reference,
          translation,
          textStatus,
          passage,
          usageRightsConfirmed,
          practiceStatus
        },
        body,
        text,
        label,
        left{title, body},
        right{title, body},
        footer,
        cards[]{_key, _type, title, body},
        steps[]{_key, _type, title, body},
        cycle,
        returnCaption,
        conclusion,
        question,
        choices[]{_key, _type, label, prompt},
        closing,
        title,
        scriptures[]{
          _key,
          _type,
          reference,
          translation,
          textStatus,
          passage,
          usageRightsConfirmed,
          practiceStatus
        },
        paragraphs,
        reviewStatus
      }
    },
    "companionLinks": companionLinks[]{
      _key,
      _type,
      provider,
      label,
      description,
      url,
      availability
    },
    "editorialEligibility": {
      "adaptationReviewed": editorialReview.adaptationReviewed,
      "reviewedAt": editorialReview.reviewedAt
    },
    "unapprovedBlockCount": ${UNAPPROVED_BLOCK_COUNT_GROQ},
    ${MONTHLY_ASSIGNMENTS_PROJECTION_GROQ}
  }
`

const INTRO_SCREEN_PROJECTION_GROQ = `
  _key,
  _type,
  screenLabel,
  heading,
  ctaLabel,
  "blocks": blocks[]{
    _key,
    _type,
    text,
    label,
    body,
    scripture{
      reference,
      translation,
      textStatus,
      passage,
      usageRightsConfirmed,
      practiceStatus
    }
  }
`

const MONTHLY_COVER_IMAGE_PROJECTION_GROQ = `
  "coverImage": select(defined(coverImage.asset) => {
    "url": coverImage.asset->url,
    "alt": coverImage.alt
  }, null)
`

const MONTHLY_EDITORIAL_REVIEW_PROJECTION_GROQ = `
  "editorialReview": editorialReview{
    reviewedBy,
    reviewerRole,
    reviewedAt
  }
`

const LINKED_SCRIPTURE_CARD_PROJECTION_GROQ = `
  "rawCardRef": card._ref,
  "card": card->{
    _id,
    _type,
    title,
    "slug": slug.current,
    cardCategory,
    plannedYearMonth,
    assetRevision,
    "artwork": select(defined(artwork.asset) => {
      "url": artwork.asset->url
    }, null),
    illustrationAlt,
    accessibleTranscription,
    scriptureCitation{
      book,
      reference,
      translation,
      usageRightsConfirmed
    },
    theologicalThemes,
    keywords,
    rightsAndAttribution{
      attribution,
      rightsStatus,
      usageRightsConfirmed
    },
    shareEligible,
    editorialStatus,
    withdrawn,
    "editorialReview": editorialReview{
      reviewedBy,
      reviewerRole,
      reviewedAt
    }
  }
`

/**
 * Parameterized GROQ query for advance-preview monthly publication metadata.
 * Intentionally omits welcomeScreen, discoveries, fullMonthCard, Challenge slugs, and Challenge screens.
 */
export const MONTHLY_PREVIEW_BY_ID_GROQ_QUERY = `
  *[_type == "monthlyPublication"
    && !(_id in path("drafts.**"))
    && _id == $monthDocId
    && yearMonth == $yearMonth
    && editorialStatus == "scheduled"
    && withdrawn != true
  ][0] {
    _id,
    _type,
    yearMonth,
    year,
    month,
    title,
    subtitle,
    ${MONTHLY_COVER_IMAGE_PROJECTION_GROQ},
    editorialStatus,
    withdrawn,
    ${MONTHLY_EDITORIAL_REVIEW_PROJECTION_GROQ},
    "introduction": {
      "previewScreens": introduction.previewScreens[]{
        ${INTRO_SCREEN_PROJECTION_GROQ}
      }
    },
    "slots": slots[]{
      _key,
      dayOfMonth,
      date,
      slotStatus,
      "rawChallengeRef": challenge._ref,
      "challenge": challenge->{
        _id,
        _type,
        title,
        withdrawn,
        "editorialEligibility": {
          "adaptationReviewed": editorialReview.adaptationReviewed,
          "reviewedAt": editorialReview.reviewedAt
        },
        "unapprovedBlockCount": ${UNAPPROVED_BLOCK_COUNT_GROQ},
        primaryScripture{
          reference,
          translation,
          textStatus,
          passage,
          usageRightsConfirmed,
          practiceStatus
        },
        "assignedMonthIds": *[_type == "monthlyPublication" && !(_id in path("drafts.**")) && ^._id in slots[].challenge._ref]._id
      }
    },
    "rosterFinalization": rosterFinalization{
      isFinalized,
      rosterVersion,
      finalizedChallengeIds
    }
  }
`

const MONTHLY_DETAIL_FIELDS_GROQ = `
    _id,
    _type,
    yearMonth,
    year,
    month,
    title,
    subtitle,
    ${MONTHLY_COVER_IMAGE_PROJECTION_GROQ},
    editorialStatus,
    withdrawn,
    ${MONTHLY_EDITORIAL_REVIEW_PROJECTION_GROQ},
    "introduction": {
      "previewScreens": introduction.previewScreens[]{
        ${INTRO_SCREEN_PROJECTION_GROQ}
      },
      "welcomeScreen": introduction.welcomeScreen{
        ${INTRO_SCREEN_PROJECTION_GROQ}
      }
    },
    "slots": slots[]{
      _key,
      dayOfMonth,
      date,
      slotStatus,
      "rawChallengeRef": challenge._ref,
      "challenge": challenge->{
        _id,
        _type,
        title,
        "slug": slug.current,
        challengeType,
        withdrawn,
        "editorialEligibility": {
          "adaptationReviewed": editorialReview.adaptationReviewed,
          "reviewedAt": editorialReview.reviewedAt
        },
        "unapprovedBlockCount": ${UNAPPROVED_BLOCK_COUNT_GROQ},
        primaryScripture{
          reference,
          translation,
          textStatus,
          passage,
          usageRightsConfirmed,
          practiceStatus
        },
        "assignedMonthIds": *[_type == "monthlyPublication" && !(_id in path("drafts.**")) && ^._id in slots[].challenge._ref]._id
      }
    },
    "rosterFinalization": rosterFinalization{
      isFinalized,
      rosterVersion,
      finalizedAt,
      finalizedBy,
      finalizedChallengeIds
    },
    "discoveries": discoveries[]{
      _key,
      discoverySlug,
      title,
      "qualifyingChallengeIds": qualifyingChallenges[]._ref,
      reservedCardId,
      ${LINKED_SCRIPTURE_CARD_PROJECTION_GROQ}
    },
    "fullMonthCard": fullMonthCard{
      title,
      reservedCardId,
      ${LINKED_SCRIPTURE_CARD_PROJECTION_GROQ}
    }`

/**
 * Parameterized GROQ query for active/historical monthly publication calendar and discovery evaluation.
 */
export const MONTHLY_DETAIL_BY_ID_GROQ_QUERY = `
  *[_type == "monthlyPublication"
    && !(_id in path("drafts.**"))
    && _id == $monthDocId
    && yearMonth == $yearMonth
    && editorialStatus == "scheduled"
    && withdrawn != true
  ][0] {${MONTHLY_DETAIL_FIELDS_GROQ}
  }
`

/**
 * INTERNAL, SERVER-ONLY (R13-VERIFY1). Same validated detail projection as
 * `MONTHLY_DETAIL_BY_ID_GROQ_QUERY` plus `_rev` (bounded version stamp for the admission
 * attestation) and `rosterFinalization.priorRosters` (historical evidence only). Used solely by
 * the trusted award verifier with `perspective=published`; never by a public Gateway route.
 */
export const TRUSTED_AWARD_VERIFICATION_MONTH_GROQ_QUERY = `
  *[_type == "monthlyPublication"
    && !(_id in path("drafts.**"))
    && !(_id in path("versions.**"))
    && _id == $monthDocId
    && yearMonth == $yearMonth
  ][0] {
    _rev,${MONTHLY_DETAIL_FIELDS_GROQ.replace(
      `"rosterFinalization": rosterFinalization{
      isFinalized,
      rosterVersion,
      finalizedAt,
      finalizedBy,
      finalizedChallengeIds
    }`,
      `"rosterFinalization": rosterFinalization{
      isFinalized,
      rosterVersion,
      finalizedAt,
      finalizedBy,
      finalizedChallengeIds,
      "priorRosters": priorRosters[]{ rosterVersion, finalizedChallengeIds, supersededAt }
    }`,
    )}
  }
`

/**
 * Parameterized GROQ query for bounded, newest-first historical Library month index candidates.
 * Projects the full validation fields so the gateway can re-verify publication, review, slot,
 * and roster invariants fail-closed before projecting minimal reader-safe Library summaries.
 */
export const LIBRARY_MONTHS_GROQ_QUERY = `
  *[_type == "monthlyPublication"
    && !(_id in path("drafts.**"))
    && !(_id in path("versions.**"))
    && _id == "month-" + yearMonth
    && yearMonth < $upperBoundYearMonth
    && editorialStatus == "scheduled"
    && withdrawn != true
  ] | order(yearMonth desc, _id asc) [0...$fetchLimit] {${MONTHLY_DETAIL_FIELDS_GROQ}
  }
`

/**
 * Parameterized GROQ query for published, reviewed, non-withdrawn ministry news articles.
 */
export const NEWS_ARTICLES_GROQ_QUERY = `
  *[_type == "newsArticle"
    && !(_id in path("drafts.**"))
    && withdrawn != true
    && defined(editorialReview.reviewedAt)
    && defined(editorialReview.reviewedBy)
    && editorialReview.reviewerRole in ["theological_editorial", "technical_synthetic"]
    && publishOnDate <= $authorizedLocalDate
    && ($category == "" || category == $category)
  ] | order(publishOnDate desc, _id asc) {
    _id,
    _type,
    title,
    "slug": slug.current,
    category,
    summary,
    body,
    ${MONTHLY_COVER_IMAGE_PROJECTION_GROQ},
    publishOnDate,
    withdrawn,
    "relatedMonth": relatedMonth->{
      _id,
      yearMonth,
      year,
      month,
      editorialStatus,
      withdrawn
    },
    ${MONTHLY_EDITORIAL_REVIEW_PROJECTION_GROQ}
  }
`

/**
 * Builds the authenticated Sanity query URL with parameterized GROQ inputs.
 */
export function buildSanityQueryUrl(
  projectId: string,
  dataset: string,
  apiVersion: string = DEFAULT_SANITY_API_VERSION,
  query: string,
  params: Record<string, string | number> = {},
): URL {
  const url = new URL(`https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${dataset}`)
  url.searchParams.set('query', query)
  url.searchParams.set('perspective', 'published')

  for (const [key, value] of Object.entries(params)) {
    const paramKey = key.startsWith('$') ? key : `$${key}`
    // Sanity GROQ requires JSON-encoded values for query parameters
    url.searchParams.set(paramKey, JSON.stringify(value))
  }

  return url
}
