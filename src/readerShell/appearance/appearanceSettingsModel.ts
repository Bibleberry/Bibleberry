import { isPaletteId } from '../../readerProfile/model.ts'
import type { ReaderProfileStore } from '../../readerProfile/store.ts'
import type {
  AppearanceModeKind,
  ContrastMode,
  ReaderProfile,
  ReaderProfileHealth,
  ReaderProfileLoadResult,
  ReaderProfileUpdateResult,
} from '../../readerProfile/types.ts'

export type AppearanceSettingsLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly result: ReaderProfileLoadResult }
  | { readonly status: 'error' }

export interface AppearanceSettingsViewModel {
  readonly status: 'loading' | 'ready' | 'error'
  readonly savedMode: AppearanceModeKind
  readonly savedModeLabel: string
  readonly preferenceTermLabel: string
  readonly preferenceQualifier: string | null
  readonly rememberedPaletteId: string | null
  readonly isSavedOnDevice: boolean
  readonly canSavePreferences: boolean
  readonly canSelectFollowSeasons: boolean
  readonly canSelectChooseColors: boolean
  readonly chooseColorsUnavailableReason: string | null
  readonly appliedPaletteLabel: string
  readonly appliedAppearanceExplanation: string
  readonly contrastModeLabel: string
  readonly contrastModeNote: string
  readonly invalidAppearanceNotice: string | null
  readonly storageAlert: string | null
  readonly canRetryInitialSave: boolean
}

const MODE_LABELS: Readonly<Record<AppearanceModeKind, string>> = {
  followSeasons: 'Follow Bibleberry Seasons',
  chooseColors: 'Choose My Colors',
}

const CONTRAST_LABELS: Readonly<Record<ContrastMode, string>> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

export const APPLIED_PALETTE_LABEL = 'Standard Bibleberry palette'

export const APPLIED_APPEARANCE_SAVED_EXPLANATION =
  'Your saved preference is stored on this device, while this reader currently keeps the '
  + 'standard Bibleberry palette until approved seasonal and manual palettes are added. '
  + 'Appearance preferences never change Scripture Cards, Card artwork, teaching content, or reading progress.'

export const APPLIED_APPEARANCE_FALLBACK_EXPLANATION =
  'Bibleberry is showing the default Follow Bibleberry Seasons fallback for display only because '
  + 'the stored appearance preference was not valid. This reader currently keeps the standard '
  + 'Bibleberry palette until approved seasonal and manual palettes are added. '
  + 'Appearance preferences never change Scripture Cards, Card artwork, teaching content, or reading progress.'

export const APPLIED_APPEARANCE_UNSAVED_EXPLANATION =
  'No appearance preference is currently saved on this device. This reader continues using the '
  + 'standard Bibleberry palette until approved seasonal and manual palettes are added. '
  + 'Appearance preferences never change Scripture Cards, Card artwork, teaching content, or reading progress.'

export const CHOOSE_COLORS_UNAVAILABLE_REASON =
  'Manual color palettes are not yet offered in this reader. Because Choose My Colors requires '
  + 'a valid palette choice, it cannot be saved until approved palettes are available.'

export const CONTRAST_MODE_NOTE =
  'Light, dark, and system contrast behavior stays separate from palette preferences and is unchanged here.'

export const INVALID_APPEARANCE_NOTICE =
  'Your previously stored appearance preference was not valid, so Bibleberry safely fell back '
  + 'to Follow Bibleberry Seasons without inventing a palette choice.'

export function formatAppearanceModeLabel(mode: AppearanceModeKind): string {
  return MODE_LABELS[mode]
}

function formatStorageAlert(health: ReaderProfileHealth): string | null {
  switch (health) {
    case 'ok':
      return null
    case 'corruptStoredData':
      return (
        'Your stored reader profile could not be read safely on this device. '
        + 'Bibleberry is showing safe defaults without overwriting your stored data, '
        + 'so appearance preferences cannot be saved right now.'
      )
    case 'unsupportedNewerSchema':
      return (
        'Your stored reader profile was saved by a newer version of Bibleberry. '
        + 'Your stored data has been left untouched, so appearance preferences cannot be changed here.'
      )
    case 'storageUnavailable':
      return (
        'Device storage is unavailable right now. Bibleberry is showing safe defaults, '
        + 'and appearance preferences cannot be saved until storage is available.'
      )
    case 'writeFailed':
      return (
        'Bibleberry could not save your default reader profile to this device. '
        + 'The preference shown below is not yet saved on this device.'
      )
  }
}

export function buildAppearanceSettingsViewModel(
  state: AppearanceSettingsLoadState,
): AppearanceSettingsViewModel {
  if (state.status === 'loading') {
    return {
      status: 'loading',
      savedMode: 'followSeasons',
      savedModeLabel: MODE_LABELS.followSeasons,
      preferenceTermLabel: 'Preference',
      preferenceQualifier: null,
      rememberedPaletteId: null,
      isSavedOnDevice: false,
      canSavePreferences: false,
      canSelectFollowSeasons: false,
      canSelectChooseColors: false,
      chooseColorsUnavailableReason: null,
      appliedPaletteLabel: APPLIED_PALETTE_LABEL,
      appliedAppearanceExplanation: APPLIED_APPEARANCE_UNSAVED_EXPLANATION,
      contrastModeLabel: CONTRAST_LABELS.system,
      contrastModeNote: CONTRAST_MODE_NOTE,
      invalidAppearanceNotice: null,
      storageAlert: null,
      canRetryInitialSave: false,
    }
  }

  if (state.status === 'error') {
    return {
      status: 'error',
      savedMode: 'followSeasons',
      savedModeLabel: MODE_LABELS.followSeasons,
      preferenceTermLabel: 'Fallback preference',
      preferenceQualifier: 'Not saved on this device',
      rememberedPaletteId: null,
      isSavedOnDevice: false,
      canSavePreferences: false,
      canSelectFollowSeasons: false,
      canSelectChooseColors: false,
      chooseColorsUnavailableReason: CHOOSE_COLORS_UNAVAILABLE_REASON,
      appliedPaletteLabel: APPLIED_PALETTE_LABEL,
      appliedAppearanceExplanation: APPLIED_APPEARANCE_UNSAVED_EXPLANATION,
      contrastModeLabel: CONTRAST_LABELS.system,
      contrastModeNote: CONTRAST_MODE_NOTE,
      invalidAppearanceNotice: null,
      storageAlert:
        'Reader preferences could not be loaded on this device. Your stored data has not been changed.',
      canRetryInitialSave: false,
    }
  }

  const { profile, health, persisted, diagnostics } = state.result
  const rememberedPaletteId =
    profile.appearance.chosenPaletteId !== null && isPaletteId(profile.appearance.chosenPaletteId)
      ? profile.appearance.chosenPaletteId
      : null
  const canSavePreferences = health === 'ok' || health === 'writeFailed'
  const canSelectChooseColors = canSavePreferences && rememberedPaletteId !== null
  const hasInvalidAppearanceDiagnostic = diagnostics.some(item => item.field === 'appearance')
  const isSavedOnDevice = persisted && health === 'ok' && !hasInvalidAppearanceDiagnostic

  let preferenceTermLabel = 'Saved preference'
  let preferenceQualifier: string | null = null
  let appliedAppearanceExplanation = APPLIED_APPEARANCE_SAVED_EXPLANATION

  if (hasInvalidAppearanceDiagnostic) {
    preferenceTermLabel = 'Fallback preference'
    preferenceQualifier = 'Display fallback — not saved'
    appliedAppearanceExplanation = APPLIED_APPEARANCE_FALLBACK_EXPLANATION
  } else if (!isSavedOnDevice) {
    preferenceTermLabel = health === 'writeFailed' ? 'Default preference' : 'Fallback preference'
    preferenceQualifier = 'Not saved on this device'
    appliedAppearanceExplanation = APPLIED_APPEARANCE_UNSAVED_EXPLANATION
  }

  return {
    status: 'ready',
    savedMode: profile.appearance.mode,
    savedModeLabel: MODE_LABELS[profile.appearance.mode],
    preferenceTermLabel,
    preferenceQualifier,
    rememberedPaletteId,
    isSavedOnDevice,
    canSavePreferences,
    canSelectFollowSeasons: canSavePreferences,
    canSelectChooseColors,
    chooseColorsUnavailableReason:
      rememberedPaletteId === null ? CHOOSE_COLORS_UNAVAILABLE_REASON : null,
    appliedPaletteLabel: APPLIED_PALETTE_LABEL,
    appliedAppearanceExplanation,
    contrastModeLabel: CONTRAST_LABELS[profile.contrastMode],
    contrastModeNote: CONTRAST_MODE_NOTE,
    invalidAppearanceNotice: hasInvalidAppearanceDiagnostic ? INVALID_APPEARANCE_NOTICE : null,
    storageAlert: formatStorageAlert(health),
    canRetryInitialSave: health === 'writeFailed' && !persisted,
  }
}

/**
 * Persists a validated appearance mode change using the existing reader-profile store.
 * Never fabricates a palette identifier when `chooseColors` is requested without a valid
 * remembered choice.
 */
export async function applyAppearanceModeChoice(
  store: ReaderProfileStore,
  current: ReaderProfile,
  targetMode: AppearanceModeKind,
): Promise<ReaderProfileUpdateResult> {
  if (targetMode === 'followSeasons') {
    return store.followSeasons()
  }
  const paletteId = current.appearance.chosenPaletteId
  if (paletteId === null || !isPaletteId(paletteId)) {
    return {
      ok: false,
      error: 'invalidValue',
      profile: current,
      message: CHOOSE_COLORS_UNAVAILABLE_REASON,
    }
  }
  return store.chooseColors(paletteId)
}
