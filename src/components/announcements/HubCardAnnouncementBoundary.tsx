import type { ReaderParticipationStore } from '../../participation/store.ts'
import type { AnnouncementPreferencesStore } from './announcementPreferencesStorage.ts'
import { HubCardAnnouncementDialog } from './HubCardAnnouncementDialog.tsx'
import type { HubSurface } from './hubCardAnnouncementModel.ts'
import { useHubCardAnnouncements } from './useHubCardAnnouncements.ts'

export interface HubCardAnnouncementBoundaryProps {
  readonly store?: ReaderParticipationStore
  readonly preferencesStore?: AnnouncementPreferencesStore
  readonly surface?: HubSurface
  readonly isHubActive?: boolean
  /**
   * Optional real Field Notebook navigation callback. When omitted, no Field Notebook
   * button is rendered.
   */
  readonly onOpenFieldNotebook?: () => void
  readonly fieldNotebookLabel?: string
  readonly returnFocusRef?: { readonly current: HTMLElement | null }
}

/**
 * Ready-to-mount Hub boundary component connecting `useHubCardAnnouncements` to
 * `HubCardAnnouncementDialog`. Mount only on a genuine Hub surface/route.
 */
export function HubCardAnnouncementBoundary({
  store,
  preferencesStore,
  surface,
  isHubActive,
  onOpenFieldNotebook,
  fieldNotebookLabel,
  returnFocusRef,
}: HubCardAnnouncementBoundaryProps) {
  const controller = useHubCardAnnouncements({
    store,
    preferencesStore,
    surface,
    isHubActive,
  })

  return (
    <HubCardAnnouncementDialog
      isOpen={controller.isOpen}
      items={controller.items}
      ackStatus={controller.ackStatus}
      ackErrorMessage={controller.ackErrorMessage}
      onDismiss={() => {
        void controller.dismissAnnouncement()
      }}
      onRetryAcknowledge={() => {
        void controller.retryAcknowledge()
      }}
      onCloseAfterFailure={controller.closeAfterAckFailure}
      onOpenFieldNotebook={
        onOpenFieldNotebook
          ? () => {
              void controller.openFieldNotebook(onOpenFieldNotebook)
            }
          : undefined
      }
      fieldNotebookLabel={fieldNotebookLabel}
      returnFocusRef={returnFocusRef}
    />
  )
}

export interface CardAnnouncementPreferenceControlProps {
  readonly enabled: boolean
  readonly disabled?: boolean
  readonly onToggle: (nextEnabled: boolean) => void
}

/**
 * Reusable accessible toggle for earned-Card announcement presentation opt-out.
 * Suppresses Hub presentation only; never disables earning or Field Notebook indicators.
 */
export function CardAnnouncementPreferenceControl({
  enabled,
  disabled = false,
  onToggle,
}: CardAnnouncementPreferenceControlProps) {
  return (
    <div className="hub-card-announcement-pref">
      <div>
        <h2>Earned Scripture Card announcements</h2>
        <p>
          Show one combined announcement when returning to the Hub after earning new Scripture
          Cards. Turning this off hides announcements only; cards are still earned and saved.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Earned Scripture Card announcements"
        className={`switch ${enabled ? 'is-on' : ''}`}
        disabled={disabled}
        onClick={() => onToggle(!enabled)}
      >
        <span />
      </button>
    </div>
  )
}
