import { useId, useState } from 'react'
import type { ReaderProfileUpdateResult } from '../../readerProfile/types.ts'

export interface TodayGuestInviteProps {
  readonly distinctCompletedCount: number
  readonly onDismiss: () => Promise<ReaderProfileUpdateResult>
  readonly onOpenAccountProgress?: () => void
  /** Where focus moves once the invitation is dismissed (the Today heading). */
  readonly returnFocusRef?: { readonly current: HTMLElement | null }
}

/**
 * Arctic Sextant (Issue #327): optional, compact, permanently dismissible guest
 * account invitation on Today (§3.4), subordinate to today's teaching and never
 * shown simultaneously with a pending earned-Card announcement.
 */
export function TodayGuestInvite({
  distinctCompletedCount,
  onDismiss,
  onOpenAccountProgress,
  returnFocusRef,
}: TodayGuestInviteProps) {
  const headingId = useId()
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleDismiss = async () => {
    if (saving) return
    setSaving(true)
    setErrorMessage(null)
    try {
      const result = await onDismiss()
      if (result.ok) {
        returnFocusRef?.current?.focus({ preventScroll: true })
      } else {
        setErrorMessage(result.message || 'Could not save your preference on this device.')
      }
    } catch {
      setErrorMessage('Could not save your preference on this device.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      className="r06-today__guest-invite"
      aria-labelledby={headingId}
      data-testid="today-guest-invite"
    >
      <p className="eyebrow">Optional Account</p>
      <h2 id={headingId} className="r06-today__guest-invite-title">
        Your progress is saved on this device
      </h2>
      <p className="r06-today__guest-invite-summary">
        You have finished {distinctCompletedCount} Challenges as a guest. Right now your progress
        is stored only on this device. Optional hosted accounts are not enabled in this guest-only
        alpha, and creating an account is never required.
      </p>
      {errorMessage && (
        <div className="r06-today__guest-invite-error" role="alert" data-testid="today-guest-invite-error">
          <p>{errorMessage}</p>
        </div>
      )}
      <div className="r06-actions">
        {onOpenAccountProgress && (
          <button
            type="button"
            className="button button--secondary"
            data-testid="today-guest-invite-account"
            disabled={saving}
            onClick={onOpenAccountProgress}
          >
            Account &amp; Progress
          </button>
        )}
        <button
          type="button"
          className="button button--secondary"
          data-testid="today-guest-invite-dismiss"
          disabled={saving}
          onClick={() => { void handleDismiss() }}
        >
          {saving ? 'Saving…' : errorMessage ? 'Retry Continue as Guest' : 'Continue as Guest'}
        </button>
      </div>
    </section>
  )
}
