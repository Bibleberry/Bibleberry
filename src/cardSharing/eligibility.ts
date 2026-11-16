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

const RESTRICTED_RIGHTS_PATTERNS: readonly RegExp[] = [
  /\bunverified\b/i,
  /\brestricted\b/i,
  /\bnot[- ]approved\b/i,
  /\bdo[- ]not[- ]share\b/i,
  /\bno[- ]share\b/i,
  /\bprohibited\b/i,
  /\brevoked\b/i,
  /\bexpired\b/i,
  /\bsynthetic\b/i,
  /\btest[- ]only\b/i,
  /\btest placeholder\b/i,
]

export function isRightsStatusShareable(rightsStatus: string): boolean {
  const normalized = rightsStatus.trim()
  if (!normalized) return false
  return !RESTRICTED_RIGHTS_PATTERNS.some(pattern => pattern.test(normalized))
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
  return (
    stored.awardId === award.awardId
    && stored.publicationYearMonth === award.publicationYearMonth
    && stored.discoveryId === award.discoveryId
    && stored.earnedOn === award.earnedOn
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

  if (participationData !== undefined) {
    const storedAward = participationData.earnedAwards[canonicalAwardId]
    if (!isMatchingStoredAward(award, storedAward)) {
      return {
        eligible: false,
        code: 'not-earned',
        message: 'Only Scripture Cards recorded in your earned collection can be shared.',
      }
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
