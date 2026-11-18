import { validateEarnedCardSnapshot } from '../participation/awards.ts'
import {
  parseCanonicalMonthlyAwardId,
  parseLocalCalendarDate,
  parsePublicationYearMonth,
} from '../participation/identity.ts'
import type {
  EarnedAwardRecord,
  EarnedScriptureCardSnapshot,
} from '../participation/types.ts'
import type { CardShareEligibilityResult, CardShareInput } from './types.ts'

/**
 * Explicit allowlist of normalized `rightsStatus` values that prove export/share rights
 * clearance for earned Scripture Cards (R14-9). Any unknown, pending, unverified,
 * restricted, synthetic, or ambiguous status fails closed.
 */
const APPROVED_RIGHTS_STATUSES = new Set<string>([
  'approved-ministry-use',
  'ministry-owned-original-illustration',
  'ministry-owned',
  'cleared-for-export',
  'approved-for-export',
  'rights-cleared',
  'public-domain',
])

function normalizeRightsStatus(rightsStatus: string): string {
  return rightsStatus
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
}

export function isRightsStatusShareable(rightsStatus: string): boolean {
  const normalized = normalizeRightsStatus(rightsStatus)
  if (!normalized) return false
  return APPROVED_RIGHTS_STATUSES.has(normalized)
}

function hasCompleteCardContent(card: EarnedScriptureCardSnapshot): boolean {
  return (
    card.title.trim().length > 0
    && card.accessibleTranscription.trim().length > 0
    && card.scripture.book.trim().length > 0
    && card.scripture.reference.trim().length > 0
    && card.scripture.translation.trim().length > 0
    && card.attribution.trim().length > 0
    && card.rightsStatus.trim().length > 0
  )
}

function isMatchingStoredAward(
  award: EarnedAwardRecord,
  stored: EarnedAwardRecord | undefined,
): boolean {
  if (!stored) return false
  if (
    stored.awardId !== award.awardId
    || stored.kind !== award.kind
    || stored.publicationYearMonth !== award.publicationYearMonth
    || stored.discoveryId !== award.discoveryId
    || stored.earnedOn !== award.earnedOn
    || stored.cardDocumentId !== award.cardDocumentId
  ) {
    return false
  }
  if (!stored.earnedCard || !award.earnedCard) {
    return false
  }
  return (
    stored.earnedCard.cardDocumentId === award.earnedCard.cardDocumentId
    && stored.earnedCard.imageUrl === award.earnedCard.imageUrl
    && stored.earnedCard.accessibleTranscription === award.earnedCard.accessibleTranscription
    && stored.earnedCard.attribution === award.earnedCard.attribution
    && stored.earnedCard.rightsStatus === award.earnedCard.rightsStatus
    && stored.earnedCard.shareEligible === award.earnedCard.shareEligible
  )
}

/**
 * Pure validation of whether an award represents a genuinely earned Scripture Card
 * that is complete, rights-cleared, and eligible for sharing (R14-9).
 *
 * Performs zero storage reads, network requests, or state mutations.
 */
export function evaluateCardShareEligibility(
  input: CardShareInput,
): CardShareEligibilityResult {
  const { award, participationData } = input

  if (!award || typeof award !== 'object') {
    return {
      eligible: false,
      code: 'not-earned',
      message: 'This Scripture Card has not been earned.',
    }
  }

  const canonicalAwardId = parseCanonicalMonthlyAwardId(award.awardId)
  const validYearMonth = parsePublicationYearMonth(award.publicationYearMonth)
  const validEarnedOn = parseLocalCalendarDate(award.earnedOn)

  if (!canonicalAwardId || !validYearMonth || !validEarnedOn) {
    return {
      eligible: false,
      code: 'not-earned',
      message: 'This Scripture Card does not have a verified earned award record.',
    }
  }

  if (
    !participationData
    || typeof participationData !== 'object'
    || !participationData.earnedAwards
    || typeof participationData.earnedAwards !== 'object'
  ) {
    return {
      eligible: false,
      code: 'not-earned',
      message: 'Only Scripture Cards recorded in your earned collection can be shared.',
    }
  }

  const storedAward = participationData.earnedAwards[canonicalAwardId]
  if (!isMatchingStoredAward(award, storedAward)) {
    return {
      eligible: false,
      code: 'not-earned',
      message: 'Only Scripture Cards recorded in your earned collection can be shared.',
    }
  }

  if (!award.earnedCard) {
    return {
      eligible: false,
      code: 'incomplete-content',
      message: 'This earned award does not include a complete Scripture Card snapshot to share.',
    }
  }

  const validatedCard = validateEarnedCardSnapshot(award.earnedCard, validYearMonth)
  if (!validatedCard) {
    return {
      eligible: false,
      code: 'invalid-card-snapshot',
      message: 'This Scripture Card snapshot is invalid or from an unauthorized asset source.',
    }
  }

  if (award.cardDocumentId && award.cardDocumentId !== validatedCard.cardDocumentId) {
    return {
      eligible: false,
      code: 'not-earned',
      message: 'This Scripture Card identity does not match the earned award record.',
    }
  }

  if (!hasCompleteCardContent(validatedCard)) {
    return {
      eligible: false,
      code: 'incomplete-content',
      message:
        'This Scripture Card is missing required explanation, Scripture reference, or attribution details.',
    }
  }

  if (!isRightsStatusShareable(validatedCard.rightsStatus)) {
    return {
      eligible: false,
      code: 'rights-restricted',
      message: 'Sharing is unavailable because this card’s artwork rights are not cleared for export.',
    }
  }

  if (validatedCard.shareEligible !== true) {
    return {
      eligible: false,
      code: 'not-share-eligible',
      message: 'This Scripture Card is marked as not eligible for sharing.',
    }
  }

  return {
    eligible: true,
    award,
    card: validatedCard,
  }
}
