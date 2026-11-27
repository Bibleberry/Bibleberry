import { useId } from 'react'
import { Sparkles } from 'lucide-react'
import type { AnnouncementPreferencesStore } from '../../components/announcements/announcementPreferencesStorage.ts'
import { buildCombinedAnnouncementCopy } from '../../components/announcements/hubCardAnnouncementModel.ts'
import {
  useHubCardAnnouncements,
  type UseHubCardAnnouncementsResult,
} from '../../components/announcements/useHubCardAnnouncements.ts'
import type { ReaderParticipationStore } from '../../participation/store.ts'
import type { CanonicalAwardId } from '../../participation/types.ts'
import { handOffDiscoveriesBatch } from './discoveriesBatch.ts'

export interface TodayCardAnnouncementProps {
  readonly participationStore: ReaderParticipationStore
  readonly preferencesStore?: AnnouncementPreferencesStore
  /**
   * Opens the gallery for the exact award IDs this announcement presented. Returns
   * `false` when the handoff failed; the batch then stays pending and unacknowledged.
   */
  readonly onViewDiscoveries?: (awardIds: readonly CanonicalAwardId[]) => boolean
  /** Where focus goes once the notice leaves Today (the Today heading). */
  readonly returnFocusRef: { readonly current: HTMLElement | null }
}

export interface TodayCardAnnouncementViewProps {
  readonly controller: UseHubCardAnnouncementsResult
  readonly onViewDiscoveries?: (awardIds: readonly CanonicalAwardId[]) => boolean
  readonly returnFocusRef: { readonly current: HTMLElement | null }
}

/**
 * Coastal Osprey (Issue #322): the R06 Today-only inline earned-Card announcement.
 *
 * Mounted only by the Today landing, so every mount is a Today arrival or return. It
 * reuses the R14-6 Hub batch controller over committed (persisted) awards only: one frozen combined batch per visit, nothing
 * during hydration, nothing while announcements are switched off (awards still persist),
 * and a single catch-up on the next Today visit once they are switched back on.
 *
 * Dismissing or opening `View Discoveries` acknowledges only this batch's
 * `hubAnnouncementAcked`. It never clears New Discoveries or any Card's `New` marker.
 */
export function TodayCardAnnouncement({
  participationStore,
  preferencesStore,
  onViewDiscoveries,
  returnFocusRef,
}: TodayCardAnnouncementProps) {
  const controller = useHubCardAnnouncements({
    store: participationStore,
    preferencesStore,
    isHubActive: true,
    awardSource: 'committed',
  })

  return (
    <TodayCardAnnouncementView
      controller={controller}
      onViewDiscoveries={onViewDiscoveries}
      returnFocusRef={returnFocusRef}
    />
  )
}

export function TodayCardAnnouncementView({
  controller,
  onViewDiscoveries,
  returnFocusRef,
}: TodayCardAnnouncementViewProps) {
  const headingId = useId()

  if (!controller.isOpen) return null

  const copy = buildCombinedAnnouncementCopy(controller.items)
  const saving = controller.ackStatus === 'saving'
  const failed = controller.ackStatus === 'failed'
  const moveFocusToToday = () => returnFocusRef.current?.focus({ preventScroll: true })

  const dismiss = async () => {
    if (await controller.dismissAnnouncement()) moveFocusToToday()
  }

  const retry = async () => {
    if (await controller.retryAcknowledge()) moveFocusToToday()
  }

  const viewDiscoveries = (trigger: HTMLButtonElement) => {
    if (!onViewDiscoveries || saving) return
    const awardIds = controller.items.map(item => item.awardId)
    // Focus Today first so the shell records it as the return target for this entry.
    moveFocusToToday()
    // Acknowledge only after the gallery route was accepted. The batch is captured
    // synchronously, before Today unmounts. If the save fails, the same batch is offered
    // again on a later Today visit.
    const handedOff = handOffDiscoveriesBatch(awardIds, onViewDiscoveries, () => { void controller.dismissAnnouncement() })
    if (!handedOff) trigger.focus()
  }

  return (
    <section
      className="r06-today__announcement"
      aria-labelledby={headingId}
      data-testid="today-card-announcement"
      data-award-count={copy.itemCount}
    >
      <p className="eyebrow r06-today__announcement-eyebrow">
        <Sparkles size={14} aria-hidden="true" />
        <span>Discoveries</span>
      </p>
      <h2 id={headingId} className="r06-today__announcement-title">{copy.heading}</h2>
      <p className="r06-today__announcement-summary">{copy.summary}</p>
      {controller.items.length > 1 && (
        <ul className="r06-today__announcement-list">
          {controller.items.map(item => (
            <li key={item.awardId}>
              {item.title}
              <span className="r06-today__announcement-meta"> · {item.monthHeading}</span>
            </li>
          ))}
        </ul>
      )}
      {failed && (
        <div className="r06-today__announcement-error" role="alert">
          <p>{controller.ackErrorMessage}</p>
          <div className="r06-actions">
            <button type="button" className="button button--secondary" onClick={() => { void retry() }}>
              Retry
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                controller.closeAfterAckFailure()
                moveFocusToToday()
              }}
            >
              Close for Now
            </button>
          </div>
        </div>
      )}
      {!failed && (
        <div className="r06-actions">
          {onViewDiscoveries && (
            <button
              type="button"
              className="button button--secondary"
              data-testid="today-view-discoveries"
              disabled={saving}
              onClick={event => viewDiscoveries(event.currentTarget)}
            >
              View Discoveries
            </button>
          )}
          <button
            type="button"
            className="button button--secondary"
            data-testid="today-dismiss-announcement"
            aria-label={`${copy.dismissLabel} ${copy.heading}`}
            disabled={saving}
            onClick={() => { void dismiss() }}
          >
            {saving ? 'Saving…' : copy.dismissLabel}
          </button>
        </div>
      )}
    </section>
  )
}
