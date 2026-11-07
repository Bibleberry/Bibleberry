export const DEFAULT_SANITY_API_VERSION = '2026-11-01'

/**
 * Parameterized GROQ query for currently released, reviewed catalog summaries.
 */
export const CATALOG_GROQ_QUERY = `
  *[_type == "challenge"
    && !(_id in path("drafts.**"))
    && editorialReview.adaptationReviewed == true
    && defined(releaseAt)
    && dateTime(releaseAt) <= dateTime($nowUtc)
    && count(screens[].blocks[_type in ["comparisonBlock", "visualCardsBlock", "connectedSequenceBlock", "reflectionBlock", "optionalStudyBlock"] && reviewStatus != "approved"]) == 0
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
    "unapprovedBlockCount": count(screens[].blocks[_type in ["comparisonBlock", "visualCardsBlock", "connectedSequenceBlock", "reflectionBlock", "optionalStudyBlock"] && reviewStatus != "approved"])
  }
`

/**
 * Parameterized GROQ query for a single released, reviewed Challenge with reader screens.
 */
export const CHALLENGE_BY_SLUG_GROQ_QUERY = `
  *[_type == "challenge"
    && !(_id in path("drafts.**"))
    && slug.current == $slug
    && editorialReview.adaptationReviewed == true
    && defined(releaseAt)
    && dateTime(releaseAt) <= dateTime($nowUtc)
    && count(screens[].blocks[_type in ["comparisonBlock", "visualCardsBlock", "connectedSequenceBlock", "reflectionBlock", "optionalStudyBlock"] && reviewStatus != "approved"]) == 0
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
    }
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
  params: Record<string, string> = {},
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
