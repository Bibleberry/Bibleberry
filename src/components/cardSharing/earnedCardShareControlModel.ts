import type { CardShareOutcome } from '../../cardSharing/types.ts'

export interface ShareOutcomePresentation {
  readonly role: 'status' | 'alert'
  readonly message: string
  readonly shareText?: string
}

export function formatShareOutcomeMessage(outcome: CardShareOutcome): ShareOutcomePresentation {
  switch (outcome.status) {
    case 'shared':
      return {
        role: 'status',
        message: `Shared "${outcome.payload.title}" with complete Scripture reference, explanation, and attribution.`,
        shareText: outcome.payload.shareText,
      }
    case 'downloaded':
      return {
        role: 'status',
        message: `Downloaded ${outcome.payload.fileName}. Complete Scripture reference, explanation, and attribution are preserved.`,
        shareText: outcome.payload.shareText,
      }
    case 'cancelled':
      return {
        role: 'status',
        message: outcome.message,
      }
    case 'failed':
      return {
        role: 'alert',
        message: outcome.message,
      }
  }
}
