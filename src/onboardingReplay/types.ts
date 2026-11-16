export type OnboardingEntryMode = 'first-use' | 'replay'

export type OnboardingStepId = 'welcome' | 'rhythm' | 'reminder'

export type OnboardingDestination = 'today' | 'foundations'

export type OnboardingFlowStatus = 'active' | 'completed' | 'skipped' | 'interrupted'

export interface OnboardingOriginContext {
  /** Human-readable label for the prior destination, e.g. "Today", "Library", or "Saved Scripture". */
  label: string
  /** Optional route hash or path token for the future app-shell integration to restore. */
  routeHash?: string
  /** Optional primary view identifier from the app shell. */
  view?: string
  /** Optional opaque detail payload for restoring nested views. */
  detail?: unknown
}

export interface OnboardingStepDefinition {
  id: OnboardingStepId
  stepNumber: 1 | 2 | 3
  eyebrow: string
  /** Plain-text heading used for accessible announcements and tests. */
  headingText: string
  /** Line-broken heading lines matching the existing onboarding typography. */
  headingLines: readonly [string, string]
  lede: string
  body?: string
  /** Optional fine-print note shown below the reminder input on Step 3. */
  finePrint?: string
  primaryActionLabel: string
  secondaryActionLabel?: string
}

export interface OnboardingAsideContent {
  verse: string
  reference: string
}

export interface OnboardingWordmarkContent {
  name: string
  note: string
}

export interface OnboardingFlowState {
  mode: OnboardingEntryMode
  currentStepIndex: number
  totalSteps: number
  status: OnboardingFlowStatus
  origin: OnboardingOriginContext | null
  draftReminderTime: string
  /** Records how the flow ended, if no longer active. */
  exitReason: 'finish' | 'skip' | 'continue-to-today' | 'interrupted' | null
  /** Target destination chosen by the reader, when applicable. */
  destination: OnboardingDestination | null
}

export interface OnboardingCompletionResult {
  mode: OnboardingEntryMode
  reason: 'finish' | 'skip' | 'continue-to-today'
  destination: OnboardingDestination
  origin: OnboardingOriginContext | null
  reminderEnabled?: boolean
  reminderTime?: string
}

export interface OnboardingProtectedPreferences {
  appearance: 'light' | 'dark' | 'system'
  textSize: 'compact' | 'default' | 'large'
  reminderEnabled: boolean
  reminderTime: string
}

/**
 * Snapshot of durable reader state used to enforce and verify R12-3's
 * no-data-loss invariants across genuine first-use, replay, and interrupted replay.
 */
export interface OnboardingProtectedReaderState {
  onboarded: boolean
  readingPositions: Record<string, string>
  savedScripture: readonly string[]
  earnedAwards: readonly string[]
  preferences: OnboardingProtectedPreferences
  shelfMembership: readonly string[]
}

export interface OnboardingFlowCallbacks {
  onComplete?: (result: OnboardingCompletionResult) => void
  onSkip?: (result: OnboardingCompletionResult) => void
  onReturnToOrigin?: (origin: OnboardingOriginContext | null) => void
  onStepChange?: (stepIndex: number, stepId: OnboardingStepId, mode: OnboardingEntryMode) => void
  onReminderPreferenceChange?: (patch: { reminderEnabled?: boolean; reminderTime?: string }) => void
}
