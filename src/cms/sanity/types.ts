export type CmsChallengeType = 'teaching' | 'discipline' | 'reflection' | 'memorization'

export type CmsPortableTextSpan = {
  [key: string]: unknown
  _key: string
  _type: 'span'
  text: string
  marks: string[]
}

export type CmsPortableTextLink = {
  [key: string]: unknown
  _key: string
  _type: 'link'
  href: string
}

export type CmsPortableTextBlock = {
  [key: string]: unknown
  _key: string
  _type: 'block'
  style: 'normal' | 'h2' | 'h3' | 'blockquote'
  children: CmsPortableTextSpan[]
  markDefs: CmsPortableTextLink[]
  listItem?: 'bullet' | 'number'
  level?: number
}

export type CmsPortableText = CmsPortableTextBlock[]

export type CmsScripture = {
  id: string
  reference: string
  translation: string
  passage?: string
  textStatus: 'provided' | 'referenceOnly'
  practiceStatus: 'configured' | 'notConfigured'
  usageRightsConfirmed: boolean
}

type CmsBlockBase = {
  id: string
  requiredForCompletion: boolean
  reviewStatus?: 'approved' | 'proposed'
}

export type CmsBlock = CmsBlockBase & (
  | { type: 'scripture'; scripture: CmsScripture }
  | { type: 'teachingText'; body: CmsPortableText }
  | { type: 'statement'; text: string; label?: string }
  | {
      type: 'contrast'
      left: { title: string; body: CmsPortableText }
      right: { title: string; body: CmsPortableText }
      footer?: string
    }
  | {
      type: 'visualCards'
      cards: { id: string; title: string; body?: string }[]
    }
  | {
      type: 'connectedSequence'
      steps: { id: string; title: string; body: string }[]
      cycle: boolean
      returnCaption?: string
      conclusion?: string
    }
  | {
      type: 'reflectionChoice'
      question: string
      choices: { id: string; label: string; prompt: string }[]
      closing?: string
    }
  | {
      type: 'optionalExploration'
      title: string
      body: CmsPortableText
      scriptures: CmsScripture[]
    }
  | { type: 'prayer'; paragraphs: string[] }
)

export type CmsScreen = {
  id: string
  stepLabel: string
  title: string
  blocks: CmsBlock[]
}

export type CmsCompanionLink = {
  id: string
  provider: 'social' | 'patreon' | 'podcast' | 'walkingReel' | 'youtube' | 'other'
  label: string
  description?: string
  url?: string
  availability?: string
  requiredForCompletion: false
}

export type CmsChallenge = {
  /**
   * Reader route/presentation slug (`slug.current`). Frozen once imported under BerryMark's
   * create-only Sanity importer (`PR #11`); not used as the durable participation storage key.
   */
  id: string
  /**
   * Published Sanity base document `_id` (without `drafts.`). Canonical durable reader
   * participation identity in `src/participation/` is derived from this field (`cms:<documentId>`).
   */
  documentId: string
  title: string
  challengeType: CmsChallengeType
  series: {
    documentId: string
    id: string
    title: string
  }
  sequence: number
  /** Authored instant, including its original offset. */
  releaseAt: string
  /** The same instant normalized to UTC for consistent comparisons in a later, authorized release layer. */
  releaseAtUtc: string
  summary?: string
  primaryScripture: CmsScripture
  screens: CmsScreen[]
  companionLinks: CmsCompanionLink[]
  editorial: {
    adaptationReviewed: true
    reviewedAt: string
  }
}
