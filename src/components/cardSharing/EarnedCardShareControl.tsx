import { useId, useMemo, useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import {
  createCardSharingService,
  type CardShareOutcome,
  type CardSharingService,
} from '../../cardSharing/index.ts'
import type { EarnedAwardRecord, ReaderParticipationData } from '../../participation/types.ts'
import { formatShareOutcomeMessage } from './earnedCardShareControlModel.ts'
import './earnedCardShareControl.css'

export interface EarnedCardShareControlProps {
  readonly award: EarnedAwardRecord
  readonly participationData?: ReaderParticipationData
  readonly shareService?: CardSharingService
  readonly onShareComplete?: (outcome: CardShareOutcome) => void
  readonly className?: string
}

const defaultShareService = createCardSharingService()

/**
 * Accessible standalone Share control for an earned Scripture Card (R14-9).
 *
 * Designed for future integration into the Field Notebook and Month Screen without
 * mutating awards, `cardViewed`, `hubAnnouncementAcked`, or challenge progress.
 */
export function EarnedCardShareControl({
  award,
  participationData,
  shareService = defaultShareService,
  onShareComplete,
  className,
}: EarnedCardShareControlProps) {
  const [isSharing, setIsSharing] = useState(false)
  const [lastOutcome, setLastOutcome] = useState<CardShareOutcome | null>(null)
  const [copiedText, setCopiedText] = useState(false)

  const statusId = useId()
  const ineligibleId = useId()

  const eligibility = useMemo(
    () => shareService.evaluateEligibility({ award, participationData }),
    [shareService, award, participationData],
  )

  const cardTitle = eligibility.eligible
    ? eligibility.card.title
    : award.earnedCard?.title ?? 'Scripture Card'

  const outcomePresentation = useMemo(
    () => (lastOutcome ? formatShareOutcomeMessage(lastOutcome) : null),
    [lastOutcome],
  )

  async function handleShare() {
    if (isSharing || !eligibility.eligible) return
    setIsSharing(true)
    setCopiedText(false)
    try {
      const outcome = await shareService.shareEarnedCard({ award, participationData })
      setLastOutcome(outcome)
      onShareComplete?.(outcome)
    } finally {
      setIsSharing(false)
    }
  }

  async function handleCopyText(shareText: string) {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return
    }
    try {
      await navigator.clipboard.writeText(shareText)
      setCopiedText(true)
    } catch {
      setCopiedText(false)
    }
  }

  const canCopyText =
    lastOutcome?.status === 'downloaded'
    && typeof navigator !== 'undefined'
    && typeof navigator.clipboard?.writeText === 'function'

  return (
    <div
      className={
        className
          ? `earned-card-share-control ${className}`
          : 'earned-card-share-control'
      }
    >
      <div className="earned-card-share-control__actions">
        <button
          type="button"
          className="button button--secondary button--small earned-card-share-control__button"
          disabled={!eligibility.eligible || isSharing}
          aria-busy={isSharing || undefined}
          aria-label={`Share ${cardTitle}`}
          aria-describedby={!eligibility.eligible ? ineligibleId : outcomePresentation ? statusId : undefined}
          onClick={() => {
            void handleShare()
          }}
        >
          <Share2 size={16} aria-hidden="true" />
          <span>{isSharing ? 'Preparing card…' : 'Share card'}</span>
        </button>

        {canCopyText && outcomePresentation?.shareText && (
          <button
            type="button"
            className="button button--secondary button--small earned-card-share-control__copy"
            onClick={() => {
              void handleCopyText(outcomePresentation.shareText!)
            }}
          >
            {copiedText ? (
              <>
                <Check size={16} aria-hidden="true" />
                <span>Text copied</span>
              </>
            ) : (
              <>
                <Copy size={16} aria-hidden="true" />
                <span>Copy card text</span>
              </>
            )}
          </button>
        )}
      </div>

      {!eligibility.eligible && (
        <p id={ineligibleId} className="earned-card-share-control__reason">
          {eligibility.message}
        </p>
      )}

      {eligibility.eligible && outcomePresentation && (
        <p
          id={statusId}
          role={outcomePresentation.role}
          aria-live={outcomePresentation.role === 'alert' ? 'assertive' : 'polite'}
          className={
            outcomePresentation.role === 'alert'
              ? 'earned-card-share-control__status earned-card-share-control__status--error'
              : 'earned-card-share-control__status'
          }
        >
          {outcomePresentation.message}
        </p>
      )}
    </div>
  )
}
