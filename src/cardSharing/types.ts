import type {
  EarnedAwardRecord,
  EarnedScriptureCardSnapshot,
  ReaderParticipationData,
} from '../participation/types.ts'

export type CardShareRejectionCode =
  | 'not-earned'
  | 'invalid-card-snapshot'
  | 'not-share-eligible'
  | 'rights-restricted'
  | 'incomplete-content'

export type CardShareFailureCode =
  | CardShareRejectionCode
  | 'unavailable-asset'
  | 'permission-denied'
  | 'unsupported'
  | 'export-failed'

export type CardShareEligibilityResult =
  | {
      readonly eligible: true
      readonly award: EarnedAwardRecord
      readonly card: EarnedScriptureCardSnapshot
    }
  | {
      readonly eligible: false
      readonly code: CardShareRejectionCode
      readonly message: string
    }

export interface CardShareInput {
  readonly award: EarnedAwardRecord
  readonly participationData?: ReaderParticipationData
}

export interface ExportedCardImage {
  readonly blob: Blob
  readonly mimeType: 'image/png' | 'image/jpeg' | string
  readonly fileName: string
  readonly width: number
  readonly height: number
  readonly attributionApplied: 'export-only'
  readonly sourceImageUrl: string
}

export interface CardShareSummary {
  readonly awardId: string
  readonly cardDocumentId: string
  readonly title: string
  readonly fileName: string
  readonly shareText: string
  readonly scriptureReference: string
  readonly theologicalExplanation: string
  readonly attribution: string
  readonly exportedWidth: number
  readonly exportedHeight: number
}

export interface CardSharePayload {
  readonly title: string
  readonly text: string
  readonly fileName: string
  readonly blob: Blob
  readonly mimeType: string
  readonly summary: CardShareSummary
}

export interface CardImageExporter {
  exportCardImage(card: EarnedScriptureCardSnapshot): Promise<ExportedCardImage>
}

export interface WebShareFileInput {
  readonly title: string
  readonly text: string
  readonly files: readonly File[]
}

export interface CardSharePlatformAdapter {
  /**
   * Optional native share hook (e.g., Capacitor Share bridge) injected by a native host.
   * When present and returning a handled result, takes precedence over browser Web Share.
   */
  nativeShare?(payload: CardSharePayload): Promise<'shared' | 'cancelled'>
  canShareFiles(files: readonly File[]): boolean
  webShare(input: WebShareFileInput): Promise<void>
  downloadFile(fileName: string, blob: Blob): Promise<void>
}

export type CardShareOutcome =
  | {
      readonly status: 'shared'
      readonly method: 'web-share' | 'native-share'
      readonly payload: CardShareSummary
    }
  | {
      readonly status: 'downloaded'
      readonly method: 'download-fallback'
      readonly payload: CardShareSummary
    }
  | {
      readonly status: 'cancelled'
      readonly message: string
    }
  | {
      readonly status: 'failed'
      readonly code: CardShareFailureCode
      readonly message: string
    }

export interface CardSharingService {
  evaluateEligibility(input: CardShareInput): CardShareEligibilityResult
  shareEarnedCard(input: CardShareInput): Promise<CardShareOutcome>
}
