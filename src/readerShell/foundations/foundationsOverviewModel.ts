export type FoundationsOverviewAvailability = 'empty' | 'unavailable'

export interface FoundationsOverviewViewModel {
  readonly availability: FoundationsOverviewAvailability
  readonly eyebrow: string
  readonly title: string
  readonly intro: string
  readonly statusBadge: string
  readonly statusHeading: string
  readonly statusRole: 'status' | 'alert'
  readonly paragraphs: readonly string[]
  /**
   * Bounded R06 scope (Issue #319 / owner decision Nov 27, 2026):
   * Do not fabricate Resume Reading or Begin with the First Reading actions
   * until owner/editorial-approved Foundations resources exist.
   */
  readonly primaryReadingAction: null
  readonly resources: readonly []
}

const FOUNDATIONS_EYEBROW = 'Library · Optional Reading'
const FOUNDATIONS_TITLE = 'Foundations'
const FOUNDATIONS_INTRO =
  'Foundations is an optional place for foundational reading in Bibleberry. There is no required schedule, order, or pace.'

export function buildFoundationsOverviewModel(
  availability: FoundationsOverviewAvailability = 'empty',
): FoundationsOverviewViewModel {
  if (availability === 'unavailable') {
    return {
      availability: 'unavailable',
      eyebrow: FOUNDATIONS_EYEBROW,
      title: FOUNDATIONS_TITLE,
      intro: FOUNDATIONS_INTRO,
      statusBadge: 'Currently Unavailable',
      statusHeading: 'Foundations readings are currently unavailable',
      statusRole: 'alert',
      paragraphs: [
        'Foundations content could not be loaded right now. Because Foundations is optional, your Library, Shelf, participation progress, and earned Scripture Cards remain unchanged.',
        'Return to Library to continue reading from your Shelf or Browse All Months.',
      ],
      primaryReadingAction: null,
      resources: [],
    }
  }

  return {
    availability: 'empty',
    eyebrow: FOUNDATIONS_EYEBROW,
    title: FOUNDATIONS_TITLE,
    intro: FOUNDATIONS_INTRO,
    statusBadge: 'Optional · No Readings Yet',
    statusHeading: 'No Foundations readings are available yet',
    statusRole: 'status',
    paragraphs: [
      'Approved Foundations readings have not been added here yet. When foundational readings are available, you will be able to begin from this overview at your own pace.',
      'Nothing is required or missing from your reading. Your Library, Shelf, participation progress, and earned Scripture Cards remain unchanged.',
    ],
    primaryReadingAction: null,
    resources: [],
  }
}
