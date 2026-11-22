import {
  READER_PROFILE_SCHEMA_VERSION,
  type AppearanceModeKind,
  type ContrastMode,
  type OnboardingStepStatus,
  type ReaderAppearance,
  type ReaderProfile,
  type ReaderProfileDiagnostic,
  type ReaderProfileEnvelopeV1,
  type ReaderProfileOrigin,
  type ReaderProfilePatch,
  type ReminderPreference,
  type TextScale,
} from './types.ts'

/**
 * Pure reader-profile model: defaults, field validation, envelope parsing/serialization,
 * legacy prototype mapping and patch application. No storage access lives here.
 */

const ONBOARDING_STATUSES: ReadonlySet<string> = new Set<OnboardingStepStatus>([
  'pending',
  'completed',
  'skipped',
])
const APPEARANCE_MODES: ReadonlySet<string> = new Set<AppearanceModeKind>([
  'followSeasons',
  'chooseColors',
])
const CONTRAST_MODES: ReadonlySet<string> = new Set<ContrastMode>(['system', 'light', 'dark'])
const TEXT_SCALES: ReadonlySet<string> = new Set<TextScale>(['compact', 'default', 'large'])

const PALETTE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const REMINDER_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/

export const DEFAULT_REMINDER_TIME = '08:00'

export function createDefaultReaderProfile(): ReaderProfile {
  return Object.freeze({
    introStatus: 'pending',
    tutorialStatus: 'pending',
    guestInviteDismissed: false,
    appearance: Object.freeze({ mode: 'followSeasons', chosenPaletteId: null }),
    contrastMode: 'system',
    textScale: 'default',
    reminder: Object.freeze({ enabled: false, time: DEFAULT_REMINDER_TIME }),
  })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isOnboardingStepStatus(value: unknown): value is OnboardingStepStatus {
  return typeof value === 'string' && ONBOARDING_STATUSES.has(value)
}

export function isContrastMode(value: unknown): value is ContrastMode {
  return typeof value === 'string' && CONTRAST_MODES.has(value)
}

export function isTextScale(value: unknown): value is TextScale {
  return typeof value === 'string' && TEXT_SCALES.has(value)
}

export function isPaletteId(value: unknown): value is string {
  return typeof value === 'string' && PALETTE_ID_PATTERN.test(value)
}

export function isReminderTime(value: unknown): value is string {
  return typeof value === 'string' && REMINDER_TIME_PATTERN.test(value)
}

export function parseAppearance(value: unknown): ReaderAppearance | null {
  if (!isPlainObject(value)) return null
  const { mode, chosenPaletteId } = value
  if (typeof mode !== 'string' || !APPEARANCE_MODES.has(mode)) return null
  if (chosenPaletteId !== null && !isPaletteId(chosenPaletteId)) return null
  if (mode === 'chooseColors' && chosenPaletteId === null) return null
  return Object.freeze({
    mode: mode as AppearanceModeKind,
    chosenPaletteId: chosenPaletteId as string | null,
  })
}

export function parseReminder(value: unknown): ReminderPreference | null {
  if (!isPlainObject(value)) return null
  if (typeof value.enabled !== 'boolean' || !isReminderTime(value.time)) return null
  return Object.freeze({ enabled: value.enabled, time: value.time })
}

export interface NormalizedProfile {
  readonly profile: ReaderProfile
  readonly diagnostics: readonly ReaderProfileDiagnostic[]
}

/**
 * Field-level normalization for a v1 profile object. Invalid or missing fields fall back to
 * their defaults individually (with a diagnostic) so one bad field never discards the rest.
 */
export function normalizeReaderProfile(raw: Record<string, unknown>): NormalizedProfile {
  const defaults = createDefaultReaderProfile()
  const diagnostics: ReaderProfileDiagnostic[] = []

  function pick<T>(field: keyof ReaderProfile, parsed: T | null, fallback: T): T {
    if (parsed !== null) return parsed
    diagnostics.push({
      field,
      reason: raw[field] === undefined ? 'missing; defaulted' : 'invalid; defaulted',
    })
    return fallback
  }

  const profile: ReaderProfile = Object.freeze({
    introStatus: pick(
      'introStatus',
      isOnboardingStepStatus(raw.introStatus) ? raw.introStatus : null,
      defaults.introStatus,
    ),
    tutorialStatus: pick(
      'tutorialStatus',
      isOnboardingStepStatus(raw.tutorialStatus) ? raw.tutorialStatus : null,
      defaults.tutorialStatus,
    ),
    guestInviteDismissed: pick(
      'guestInviteDismissed',
      typeof raw.guestInviteDismissed === 'boolean' ? raw.guestInviteDismissed : null,
      defaults.guestInviteDismissed,
    ),
    appearance: pick('appearance', parseAppearance(raw.appearance), defaults.appearance),
    contrastMode: pick(
      'contrastMode',
      isContrastMode(raw.contrastMode) ? raw.contrastMode : null,
      defaults.contrastMode,
    ),
    textScale: pick(
      'textScale',
      isTextScale(raw.textScale) ? raw.textScale : null,
      defaults.textScale,
    ),
    reminder: pick('reminder', parseReminder(raw.reminder), defaults.reminder),
  })

  return { profile, diagnostics }
}

export type ParsedEnvelope =
  | { readonly kind: 'absent' }
  | {
      readonly kind: 'valid'
      readonly profile: ReaderProfile
      readonly origin: ReaderProfileOrigin
      readonly diagnostics: readonly ReaderProfileDiagnostic[]
    }
  | { readonly kind: 'corrupt'; readonly reason: string }
  | { readonly kind: 'unsupportedNewerSchema'; readonly schemaVersion: number }

export function parseReaderProfileEnvelope(raw: string | null): ParsedEnvelope {
  if (raw === null || raw === '') return { kind: 'absent' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'corrupt', reason: 'Stored reader profile is not valid JSON.' }
  }
  if (!isPlainObject(parsed)) {
    return { kind: 'corrupt', reason: 'Stored reader profile is not an object.' }
  }

  const { schemaVersion } = parsed
  if (
    typeof schemaVersion === 'number'
    && Number.isInteger(schemaVersion)
    && schemaVersion > READER_PROFILE_SCHEMA_VERSION
  ) {
    return { kind: 'unsupportedNewerSchema', schemaVersion }
  }
  if (schemaVersion !== READER_PROFILE_SCHEMA_VERSION) {
    return { kind: 'corrupt', reason: 'Stored reader profile has an unknown schemaVersion.' }
  }
  if (!isPlainObject(parsed.profile)) {
    return { kind: 'corrupt', reason: 'Stored reader profile envelope has no profile object.' }
  }

  const origin: ReaderProfileOrigin =
    parsed.origin === 'legacyPrototypeMigration' ? 'legacyPrototypeMigration' : 'defaults'
  const { profile, diagnostics } = normalizeReaderProfile(parsed.profile)
  return { kind: 'valid', profile, origin, diagnostics }
}

export function serializeReaderProfileEnvelope(
  profile: ReaderProfile,
  origin: ReaderProfileOrigin,
): string {
  const envelope: ReaderProfileEnvelopeV1 = {
    schemaVersion: READER_PROFILE_SCHEMA_VERSION,
    profile: {
      introStatus: profile.introStatus,
      tutorialStatus: profile.tutorialStatus,
      guestInviteDismissed: profile.guestInviteDismissed,
      appearance: {
        mode: profile.appearance.mode,
        chosenPaletteId: profile.appearance.chosenPaletteId,
      },
      contrastMode: profile.contrastMode,
      textScale: profile.textScale,
      reminder: { enabled: profile.reminder.enabled, time: profile.reminder.time },
    },
    origin,
  }
  return JSON.stringify(envelope)
}

export type LegacyMapping =
  | { readonly kind: 'absent' }
  | {
      readonly kind: 'mapped'
      readonly profile: ReaderProfile
      readonly diagnostics: readonly ReaderProfileDiagnostic[]
    }
  | { readonly kind: 'unreadable'; readonly reason: string }

/**
 * Maps the legacy prototype blob (`bibleberry-prototype-v1`) onto a fresh profile.
 *
 * Only safely representable values are carried over:
 * - `onboarded: true` → `introStatus: 'completed'` (the old three-screen introduction).
 *   It never implies the new Guided App Tutorial: `tutorialStatus` always stays `pending`.
 * - `appearance` (`light|dark|system`) → `contrastMode`. Palette mode stays `followSeasons`
 *   because the prototype had no palette concept.
 * - `textSize` (`compact|default|large`) → `textScale`.
 * - `reminderEnabled` + `reminderTime` → `reminder`.
 *
 * Everything else in the legacy blob (explored ids, journey, lastOpened, resume dismissal) is
 * ignored. Invalid individual values fall back to defaults with a diagnostic.
 */
export function mapLegacyPrototypeState(raw: string | null): LegacyMapping {
  if (raw === null || raw === '') return { kind: 'absent' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'unreadable', reason: 'Legacy prototype settings are not valid JSON.' }
  }
  if (!isPlainObject(parsed)) {
    return { kind: 'unreadable', reason: 'Legacy prototype settings are not an object.' }
  }

  const defaults = createDefaultReaderProfile()
  const diagnostics: ReaderProfileDiagnostic[] = []
  const note = (field: string) => diagnostics.push({ field, reason: 'invalid legacy value; defaulted' })

  let introStatus = defaults.introStatus
  if (parsed.onboarded === true) introStatus = 'completed'
  else if (parsed.onboarded !== undefined && parsed.onboarded !== false) note('onboarded')

  let contrastMode = defaults.contrastMode
  if (isContrastMode(parsed.appearance)) contrastMode = parsed.appearance
  else if (parsed.appearance !== undefined) note('appearance')

  let textScale = defaults.textScale
  if (isTextScale(parsed.textSize)) textScale = parsed.textSize
  else if (parsed.textSize !== undefined) note('textSize')

  let enabled = defaults.reminder.enabled
  if (typeof parsed.reminderEnabled === 'boolean') enabled = parsed.reminderEnabled
  else if (parsed.reminderEnabled !== undefined) note('reminderEnabled')

  let time = defaults.reminder.time
  if (isReminderTime(parsed.reminderTime)) time = parsed.reminderTime
  else if (parsed.reminderTime !== undefined) note('reminderTime')

  return {
    kind: 'mapped',
    profile: Object.freeze({
      ...defaults,
      introStatus,
      tutorialStatus: 'pending',
      contrastMode,
      textScale,
      reminder: Object.freeze({ enabled, time }),
    }),
    diagnostics,
  }
}

export type ApplyPatchResult =
  | { readonly ok: true; readonly profile: ReaderProfile; readonly changed: boolean }
  | { readonly ok: false; readonly message: string }

function sameProfile(a: ReaderProfile, b: ReaderProfile): boolean {
  return (
    a.introStatus === b.introStatus
    && a.tutorialStatus === b.tutorialStatus
    && a.guestInviteDismissed === b.guestInviteDismissed
    && a.appearance.mode === b.appearance.mode
    && a.appearance.chosenPaletteId === b.appearance.chosenPaletteId
    && a.contrastMode === b.contrastMode
    && a.textScale === b.textScale
    && a.reminder.enabled === b.reminder.enabled
    && a.reminder.time === b.reminder.time
  )
}

/** Validates every provided field, then applies the patch atomically (all or nothing). */
export function applyReaderProfilePatch(
  current: ReaderProfile,
  patch: ReaderProfilePatch,
): ApplyPatchResult {
  if (!isPlainObject(patch)) return { ok: false, message: 'Patch must be an object.' }
  const p = patch as Record<string, unknown>

  if (p.introStatus !== undefined && !isOnboardingStepStatus(p.introStatus)) {
    return { ok: false, message: 'introStatus must be pending, completed or skipped.' }
  }
  if (p.tutorialStatus !== undefined && !isOnboardingStepStatus(p.tutorialStatus)) {
    return { ok: false, message: 'tutorialStatus must be pending, completed or skipped.' }
  }
  if (p.guestInviteDismissed !== undefined && p.guestInviteDismissed !== true) {
    return { ok: false, message: 'Guest invite dismissal is permanent and can only be set to true.' }
  }
  let appearance: ReaderAppearance | undefined
  if (p.appearance !== undefined) {
    const parsed = parseAppearance(p.appearance)
    if (!parsed) {
      return { ok: false, message: 'appearance requires a valid mode and, for chooseColors, a palette id.' }
    }
    appearance = parsed
  }
  if (p.contrastMode !== undefined && !isContrastMode(p.contrastMode)) {
    return { ok: false, message: 'contrastMode must be system, light or dark.' }
  }
  if (p.textScale !== undefined && !isTextScale(p.textScale)) {
    return { ok: false, message: 'textScale must be compact, default or large.' }
  }
  let reminder: ReminderPreference | undefined
  if (p.reminder !== undefined) {
    const parsed = parseReminder(p.reminder)
    if (!parsed) return { ok: false, message: 'reminder requires a boolean enabled and HH:MM time.' }
    reminder = parsed
  }

  const next: ReaderProfile = Object.freeze({
    introStatus: (p.introStatus as OnboardingStepStatus | undefined) ?? current.introStatus,
    tutorialStatus: (p.tutorialStatus as OnboardingStepStatus | undefined) ?? current.tutorialStatus,
    guestInviteDismissed: current.guestInviteDismissed || p.guestInviteDismissed === true,
    appearance: appearance ?? current.appearance,
    contrastMode: (p.contrastMode as ContrastMode | undefined) ?? current.contrastMode,
    textScale: (p.textScale as TextScale | undefined) ?? current.textScale,
    reminder: reminder ?? current.reminder,
  })

  if (sameProfile(current, next)) return { ok: true, profile: current, changed: false }
  return { ok: true, profile: next, changed: true }
}

/** Follow Bibleberry Seasons while remembering the prior manual palette for a later switch back. */
export function followSeasonsAppearance(current: ReaderAppearance): ReaderAppearance {
  return Object.freeze({ mode: 'followSeasons', chosenPaletteId: current.chosenPaletteId })
}

export function chooseColorsAppearance(paletteId: string): ReaderAppearance {
  return Object.freeze({ mode: 'chooseColors', chosenPaletteId: paletteId })
}
