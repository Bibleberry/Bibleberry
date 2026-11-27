import { useCallback, useEffect, useState } from 'react'
import { createPlatformReaderProfileStore } from '../../readerProfile/platformStore.ts'
import type { ReaderProfileStore } from '../../readerProfile/store.ts'
import type { AppearanceModeKind } from '../../readerProfile/types.ts'
import {
  applyAppearanceModeChoice,
  buildAppearanceSettingsViewModel,
  formatAppearanceModeLabel,
  type AppearanceSettingsLoadState,
} from './appearanceSettingsModel.ts'
import './appearanceSettings.css'

export interface AppearanceSettingsScreenProps {
  readonly onBack: () => void
  readonly backLabel?: string
  readonly profileStore?: ReaderProfileStore
}

/**
 * Nomadic Vortex (Issue #326): bounded R06 More → Appearance & Settings surface.
 * Uses the existing durable reader-profile store to expose Follow Bibleberry Seasons
 * and Choose My Colors without introducing unapproved palettes, seasonal dates, visual
 * assets, or unsupported contrast interactions.
 */
export function AppearanceSettingsScreen({
  onBack,
  backLabel = 'Back to More',
  profileStore,
}: AppearanceSettingsScreenProps) {
  const [ownedProfileStore] = useState(() => profileStore ?? createPlatformReaderProfileStore())
  const activeProfileStore = profileStore ?? ownedProfileStore

  const [loadState, setLoadState] = useState<AppearanceSettingsLoadState>({ status: 'loading' })
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)

  const reloadProfile = useCallback(
    (isActive: () => boolean) => {
      void activeProfileStore
        .load()
        .then(result => {
          if (!isActive()) return
          setLoadState({ status: 'ready', result })
        })
        .catch(() => {
          if (!isActive()) return
          setLoadState({ status: 'error' })
        })
    },
    [activeProfileStore],
  )

  useEffect(() => {
    let active = true
    const isActive = () => active

    reloadProfile(isActive)

    const unsubscribe = activeProfileStore.subscribe(profile => {
      if (!active) return
      setLoadState(prev => {
        if (prev.status === 'ready') {
          return {
            status: 'ready',
            result: {
              ...prev.result,
              profile,
              health: 'ok',
              persisted: true,
              diagnostics: prev.result.diagnostics.filter(item => item.field !== 'appearance'),
            },
          }
        }
        return {
          status: 'ready',
          result: {
            profile,
            health: 'ok',
            source: 'stored',
            persisted: true,
            diagnostics: [],
          },
        }
      })
    })

    const unsubscribeExternal = activeProfileStore.subscribeExternalChanges?.(() => {
      setSaveError(null)
      setSaveStatus(null)
      reloadProfile(isActive)
    })

    return () => {
      active = false
      unsubscribe()
      unsubscribeExternal?.()
    }
  }, [activeProfileStore, reloadProfile])

  const view = buildAppearanceSettingsViewModel(loadState)

  const handleSelectMode = async (targetMode: AppearanceModeKind) => {
    if (loadState.status !== 'ready' || isSaving) return
    setIsSaving(true)
    setSaveError(null)
    setSaveStatus(null)
    try {
      const outcome = await applyAppearanceModeChoice(
        activeProfileStore,
        loadState.result.profile,
        targetMode,
      )
      if (!outcome.ok) {
        setSaveError(outcome.message)
        return
      }
      setLoadState(prev =>
        prev.status === 'ready'
          ? {
              status: 'ready',
              result: {
                ...prev.result,
                profile: outcome.profile,
                health: 'ok',
                persisted: true,
                diagnostics: prev.result.diagnostics.filter(item => item.field !== 'appearance'),
              },
            }
          : prev,
      )
      const label = formatAppearanceModeLabel(outcome.profile.appearance.mode)
      const paletteSuffix =
        outcome.profile.appearance.mode === 'chooseColors' && outcome.profile.appearance.chosenPaletteId
          ? ` (${outcome.profile.appearance.chosenPaletteId})`
          : ''
      setSaveStatus(
        `Saved preference: ${label}${paletteSuffix}. `
          + 'The reader continues using its standard palette.',
      )
    } catch {
      setSaveError('Appearance preference could not be saved. Your previous saved preference is unchanged.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="r06-landing r06-appearance" data-testid="appearance-settings-screen">
      <div className="r06-appearance__back">
        <button
          type="button"
          className="button button--secondary"
          data-testid="appearance-settings-back"
          onClick={onBack}
        >
          {backLabel}
        </button>
      </div>

      <header className="r06-appearance__header">
        <p className="eyebrow">Reader Preferences</p>
        <h1>Appearance &amp; Settings</h1>
      </header>

      {view.status === 'loading' && (
        <p role="status" className="r06-appearance__body" data-testid="appearance-loading">
          Loading appearance preferences…
        </p>
      )}

      {view.status !== 'loading' && (
        <>
          {view.storageAlert && (
            <div className="r06-appearance__alert-card" role="alert" data-testid="appearance-storage-alert">
              <p className="r06-appearance__alert">{view.storageAlert}</p>
              {view.canRetryInitialSave && (
                <div className="r06-actions">
                  <button
                    type="button"
                    className="button button--secondary"
                    data-testid="appearance-retry-save-button"
                    disabled={isSaving}
                    onClick={() => void handleSelectMode(view.savedMode)}
                  >
                    Retry saving preference
                  </button>
                </div>
              )}
            </div>
          )}

          {view.invalidAppearanceNotice && (
            <p
              className="r06-appearance__notice"
              role="status"
              data-testid="appearance-invalid-notice"
            >
              {view.invalidAppearanceNotice}
            </p>
          )}

          <section
            className="r06-appearance__card"
            aria-labelledby="appearance-applied-heading"
            data-testid="appearance-applied-card"
          >
            <p className="eyebrow">Applied vs. Saved</p>
            <h2 id="appearance-applied-heading" className="r06-appearance__title">
              Current reader appearance
            </h2>
            <dl className="r06-appearance__summary">
              <div>
                <dt>Applied right now</dt>
                <dd data-testid="appearance-applied-palette">{view.appliedPaletteLabel}</dd>
              </div>
              <div>
                <dt>Saved preference</dt>
                <dd data-testid="appearance-saved-preference">
                  {view.savedModeLabel}
                  {!view.isSavedOnDevice && (
                    <span className="r06-appearance__unsaved-tag"> (Not saved on this device)</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Contrast preference</dt>
                <dd data-testid="appearance-contrast-preference">{view.contrastModeLabel}</dd>
              </div>
            </dl>
            <p className="r06-appearance__body">{view.appliedAppearanceExplanation}</p>
            <p className="r06-appearance__note">{view.contrastModeNote}</p>
          </section>

          <section
            className="r06-appearance__card"
            aria-labelledby="appearance-mode-heading"
            data-testid="appearance-mode-section"
          >
            <p className="eyebrow">Palette Preference</p>
            <h2 id="appearance-mode-heading" className="r06-appearance__title">
              Appearance mode
            </h2>

            <fieldset className="r06-appearance__fieldset" disabled={isSaving || !view.canSavePreferences}>
              <legend className="r06-appearance__legend">Choose your saved appearance preference</legend>

              <label
                className={`r06-appearance__option${view.savedMode === 'followSeasons' ? ' is-selected' : ''}`}
                data-testid="appearance-option-follow-seasons"
              >
                <span className="r06-appearance__option-control">
                  <input
                    type="radio"
                    name="appearance-mode"
                    value="followSeasons"
                    data-testid="appearance-mode-follow-seasons"
                    checked={view.savedMode === 'followSeasons'}
                    disabled={!view.canSelectFollowSeasons || isSaving}
                    onChange={() => void handleSelectMode('followSeasons')}
                  />
                  <span className="r06-appearance__option-title">Follow Bibleberry Seasons</span>
                </span>
                <span className="r06-appearance__option-description">
                  Default for first-time readers. Saves your preference to follow approved seasonal
                  palettes once available, while keeping any remembered manual palette choice.
                </span>
              </label>

              <label
                className={`r06-appearance__option${view.savedMode === 'chooseColors' ? ' is-selected' : ''}${!view.canSelectChooseColors ? ' is-unavailable' : ''}`}
                data-testid="appearance-option-choose-colors"
              >
                <span className="r06-appearance__option-control">
                  <input
                    type="radio"
                    name="appearance-mode"
                    value="chooseColors"
                    data-testid="appearance-mode-choose-colors"
                    checked={view.savedMode === 'chooseColors'}
                    disabled={!view.canSelectChooseColors || isSaving}
                    aria-describedby={
                      view.chooseColorsUnavailableReason
                        ? 'appearance-choose-colors-unavailable'
                        : 'appearance-choose-colors-description'
                    }
                    onChange={() => void handleSelectMode('chooseColors')}
                  />
                  <span className="r06-appearance__option-title">Choose My Colors</span>
                </span>
                <span
                  id="appearance-choose-colors-description"
                  className="r06-appearance__option-description"
                >
                  Keeps a chosen manual palette preference year-round so seasonal transitions never
                  overwrite it.
                </span>
                {view.rememberedPaletteId !== null ? (
                  <span
                    className="r06-appearance__remembered"
                    data-testid="appearance-remembered-palette"
                  >
                    Remembered manual palette: <code>{view.rememberedPaletteId}</code>
                  </span>
                ) : (
                  <span
                    id="appearance-choose-colors-unavailable"
                    className="r06-appearance__unavailable"
                    data-testid="appearance-choose-colors-unavailable"
                  >
                    {view.chooseColorsUnavailableReason}
                  </span>
                )}
              </label>
            </fieldset>

            {saveError && (
              <p className="r06-appearance__alert" role="alert" data-testid="appearance-save-error">
                {saveError}
              </p>
            )}

            {saveStatus && (
              <p className="r06-appearance__status" role="status" data-testid="appearance-save-status">
                {saveStatus}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
