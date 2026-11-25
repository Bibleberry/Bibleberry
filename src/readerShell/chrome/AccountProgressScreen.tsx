import { useState } from 'react'
import { defaultGuestParticipationStore } from '../../participation/defaultGuestStore.ts'
import type { ReaderParticipationStore } from '../../participation/store.ts'
import { useReaderParticipation } from '../../participation/useReaderParticipation.ts'
import { createPlatformReaderProfileStore } from '../../readerProfile/platformStore.ts'
import type { ReaderProfileStore } from '../../readerProfile/store.ts'
import { useReaderProfile } from '../../readerProfile/useReaderProfile.ts'
import { defaultGuestShelfStore } from '../../shelfPersistence/defaultGuestShelfStore.ts'
import type { GuestShelfStore } from '../../shelfPersistence/store.ts'
import { useGuestShelfStore } from '../../shelfPersistence/useGuestShelfStore.ts'
import { countDistinctCompletedChallenges } from '../today/guestInviteModel.ts'

export interface AccountProgressScreenProps {
  readonly onBack: () => void
  readonly backLabel?: string
  readonly participationStore?: ReaderParticipationStore
  readonly shelfStore?: GuestShelfStore
  readonly profileStore?: ReaderProfileStore
}

/**
 * Arctic Sextant (Issue #327): always-reachable More → Account & Progress destination.
 * Truthfully discloses device-local guest storage and guest-only alpha boundaries without
 * fabricating hosted sign-in, cloud restore, or server-side Card verification.
 */
export function AccountProgressScreen({
  onBack,
  backLabel = 'Back to More',
  participationStore = defaultGuestParticipationStore,
  shelfStore = defaultGuestShelfStore,
  profileStore,
}: AccountProgressScreenProps) {
  const [ownedProfileStore] = useState(() => profileStore ?? createPlatformReaderProfileStore())
  const activeProfileStore = profileStore ?? ownedProfileStore

  const participationSnapshot = useReaderParticipation(participationStore)
  const shelfSnapshot = useGuestShelfStore(shelfStore)
  const profileState = useReaderProfile(activeProfileStore)

  const participationReady = participationSnapshot.status === 'ready'
  const participationHealthy = participationReady && participationSnapshot.health === 'ok'
  const distinctCompletedCount = participationHealthy
    ? countDistinctCompletedChallenges(participationSnapshot.data)
    : null
  const earnedCardsCount = participationHealthy
    ? Object.keys(participationSnapshot.data.earnedAwards).length
    : null
  const savedScriptureCount = participationHealthy
    ? participationSnapshot.data.savedScriptures.length
    : null
  const shelfMonthsCount =
    shelfSnapshot.status === 'ready' && shelfSnapshot.health === 'ok'
      ? shelfSnapshot.state.months.length
      : null

  return (
    <div className="r06-landing r06-account-progress" data-testid="account-progress-screen">
      <div className="r06-account-progress__back">
        <button
          type="button"
          className="button button--secondary"
          data-testid="account-progress-back"
          onClick={onBack}
        >
          {backLabel}
        </button>
      </div>

      <header className="r06-account-progress__header">
        <p className="eyebrow">Guest Mode · Device-Local Only</p>
        <h1>Account &amp; Progress</h1>
      </header>

      <section
        className="r06-account-progress__card"
        aria-labelledby="account-status-heading"
        data-testid="account-status-card"
      >
        <div className="r06-account-progress__badge-row">
          <span className="r06-today__status-pill">Guest Mode · Device-Local Only</span>
        </div>
        <h2 id="account-status-heading" className="r06-account-progress__title">
          Guest participation is stored on this device
        </h2>
        <p className="r06-account-progress__body">
          Your reading progress, earned Scripture Cards, and saved passages are stored only on this
          device or browser. Clearing browser or app data, uninstalling, or switching devices can
          permanently erase your local guest records.
        </p>
        <p className="r06-account-progress__body">
          Hosted sign-in, account creation, cloud backup, and cross-device sync are not enabled in
          this guest-only alpha.
        </p>
        {profileState.status === 'ready' &&
          profileState.health === 'ok' &&
          profileState.profile.guestInviteDismissed && (
            <p className="r06-account-progress__note" data-testid="account-invite-dismissed-note">
              You dismissed the automatic Today account invitation; it will not reappear on Today,
              while this Account &amp; Progress page remains available anytime.
            </p>
          )}
        {((profileState.status === 'ready' && profileState.health !== 'ok') ||
          profileState.status === 'error') && (
          <p className="r06-account-progress__alert" role="alert">
            Guest profile preferences could not be read safely on this device. Your stored data has
            not been changed.
          </p>
        )}
      </section>

      <section
        className="r06-account-progress__card"
        aria-labelledby="account-summary-heading"
        data-testid="account-local-summary"
      >
        <p className="eyebrow">Local Participation Summary</p>
        <h2 id="account-summary-heading" className="r06-account-progress__title">
          Saved on this device
        </h2>
        {!participationReady && <p role="status">Loading local progress…</p>}
        {participationReady && !participationHealthy && (
          <p className="r06-account-progress__alert" role="alert">
            Your local participation records could not be read safely on this device. Your stored
            data has not been overwritten.
          </p>
        )}
        {participationHealthy && (
          <dl className="r06-account-progress__summary">
            <div>
              <dt>Distinct Challenges finished</dt>
              <dd data-testid="account-summary-completed">{distinctCompletedCount}</dd>
            </div>
            <div>
              <dt>Earned Scripture Cards</dt>
              <dd data-testid="account-summary-cards">{earnedCardsCount}</dd>
            </div>
            <div>
              <dt>Saved Scripture</dt>
              <dd data-testid="account-summary-scripture">{savedScriptureCount}</dd>
            </div>
            {shelfMonthsCount !== null && (
              <div>
                <dt>Shelf months</dt>
                <dd data-testid="account-summary-shelf">{shelfMonthsCount} of 3</dd>
              </div>
            )}
          </dl>
        )}
      </section>
    </div>
  )
}
