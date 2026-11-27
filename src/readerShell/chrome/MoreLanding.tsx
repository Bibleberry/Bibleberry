import { NewsReaderHost } from '../../components/news/NewsReaderHost.tsx'
import { CardAnnouncementPreferenceControl } from '../../components/announcements/HubCardAnnouncementBoundary.tsx'
import {
  defaultAnnouncementPreferencesStore,
  useAnnouncementPreferences,
  type AnnouncementPreferencesStore,
} from '../../components/announcements/announcementPreferencesStorage.ts'

interface MoreLandingProps {
  readonly onOpenFeatured: (documentId: string) => void
  readonly onOpenNews: () => void
  readonly onOpenAbout: () => void
  readonly onOpenAppearanceSettings?: () => void
  readonly onOpenAccountProgress?: () => void
  readonly onReplayIntroduction: () => void
  readonly onReplayTutorial?: () => void
  readonly announcementPreferencesStore?: AnnouncementPreferencesStore
}

const TODAY_PREFERENCE_DESCRIPTION =
  'Show one combined announcement on Today after earning new Scripture Cards. '
  + 'Turning this off hides announcements only; cards are still earned and saved.'

/**
 * Coastal Osprey: the earned-Card announcement opt-out. It suppresses only the Today
 * notice. Earning, dates, New Discoveries and per-Card New keep working, and switching it
 * back on yields one combined catch-up on the next Today visit.
 */
function AnnouncementPreference({ store }: { readonly store: AnnouncementPreferencesStore }) {
  const preferences = useAnnouncementPreferences(store)
  return (
    <CardAnnouncementPreferenceControl
      enabled={preferences.data.earnedCardAnnouncementsEnabled}
      disabled={preferences.status !== 'ready'}
      onToggle={enabled => { void store.setAnnouncementsEnabled(enabled).catch(() => {}) }}
      description={TODAY_PREFERENCE_DESCRIPTION}
    />
  )
}

export function MoreLanding({
  onOpenFeatured,
  onOpenNews,
  onOpenAbout,
  onOpenAppearanceSettings,
  onOpenAccountProgress,
  onReplayIntroduction,
  onReplayTutorial,
  announcementPreferencesStore = defaultAnnouncementPreferencesStore,
}: MoreLandingProps) {
  return (
    <div className="r06-landing r06-more">
      <h1>More</h1>
      <NewsReaderHost onOpenFeatured={onOpenFeatured} />
      <ul className="r06-more__entries">
        <li><button type="button" className="button button--secondary" onClick={onOpenNews}>View All News</button></li>
        <li>
          <strong>Podcasts &amp; Resources</strong>
          <p>No resources are available here yet.</p>
        </li>
        <li><button type="button" className="button button--secondary" onClick={onOpenAbout}>About Bibleberry</button></li>
        <li>
          <button
            type="button"
            className="button button--secondary"
            data-testid="more-appearance-settings-button"
            onClick={onOpenAppearanceSettings}
            disabled={!onOpenAppearanceSettings}
          >
            Appearance &amp; Settings
          </button>
        </li>
        <li className="r06-more__preference">
          <AnnouncementPreference store={announcementPreferencesStore} />
        </li>
        <li>
          <button
            type="button"
            className="button button--secondary"
            data-testid="more-account-progress-button"
            onClick={onOpenAccountProgress}
            disabled={!onOpenAccountProgress}
          >
            Account &amp; Progress
          </button>
        </li>
        <li>
          <button type="button" className="button button--secondary" onClick={onReplayIntroduction}>Review Introduction</button>
        </li>
        <li>
          <button
            type="button"
            className="button button--secondary"
            data-testid="more-app-tutorial-button"
            onClick={onReplayTutorial}
            disabled={!onReplayTutorial}
          >
            App Tutorial
          </button>
        </li>
      </ul>
    </div>
  )
}
