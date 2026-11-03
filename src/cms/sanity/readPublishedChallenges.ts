export const SANITY_PROJECT_ID = '80016lrq'
export const SANITY_DATASET = 'production'
export const SANITY_API_VERSION = '2026-11-01'

/**
 * Reader-safe projection: no drafts, source provenance, internal notes, or reviewer identity.
 * `body` retains the complete Portable Text arrays defined by the Studio schema.
 */
export const PUBLISHED_CHALLENGE_QUERY = `
  *[_type == "challenge"] | order(releaseAt asc) {
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

export type SanityFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export type SanityReadResult =
  | { ok: true; documents: unknown[] }
  | {
      ok: false
      error: {
        kind: 'network' | 'http' | 'invalidResponse'
        message: string
        status?: number
      }
    }

export type ReadPublishedChallengesOptions = {
  projectId?: string
  dataset?: string
  apiVersion?: string
  fetchImpl?: SanityFetch
  signal?: AbortSignal
}

/** Read only the public published perspective. Release-time authorization is deliberately not implemented here. */
export async function readPublishedChallenges(
  options: ReadPublishedChallengesOptions = {},
): Promise<SanityReadResult> {
  const projectId = options.projectId ?? SANITY_PROJECT_ID
  const dataset = options.dataset ?? SANITY_DATASET
  const apiVersion = options.apiVersion ?? SANITY_API_VERSION
  const fetchImpl = options.fetchImpl ?? fetch
  const url = new URL(`https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${dataset}`)
  url.searchParams.set('query', PUBLISHED_CHALLENGE_QUERY)
  url.searchParams.set('perspective', 'published')

  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'omit',
      signal: options.signal,
    })
  } catch {
    return {
      ok: false,
      error: { kind: 'network', message: 'The Sanity request could not be completed.' },
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      error: {
        kind: 'http',
        message: 'Sanity returned an unsuccessful response.',
        status: response.status,
      },
    }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return {
      ok: false,
      error: { kind: 'invalidResponse', message: 'Sanity returned invalid JSON.' },
    }
  }

  if (
    typeof payload !== 'object'
    || payload === null
    || !('result' in payload)
    || !Array.isArray(payload.result)
  ) {
    return {
      ok: false,
      error: { kind: 'invalidResponse', message: 'Sanity response did not contain a result array.' },
    }
  }

  return { ok: true, documents: payload.result }
}
