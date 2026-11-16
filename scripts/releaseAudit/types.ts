import type { GatewayEnv } from '../../src/gateway/types.ts'

export type AuditStatus = 'PASS' | 'FAIL'

export type AuditContractId =
  | 'ADVANCE_PREVIEW_ALLOWLIST'
  | 'EMBARGOED_CHALLENGE_BODY_LEAK'
  | 'HIDDEN_DISCOVERY_MAPPING_LEAK'
  | 'UNREWARDED_CARD_ARTWORK_LEAK'
  | 'UNAUTHORIZED_ASSET_REFERENCE_LEAK'
  | 'PRIVATE_PARTICIPATION_LEAK'
  | 'MONTH_PHASE_LIFECYCLE'
  | 'FEBRUARY_PREVIEW_TIMING'
  | 'WITHDRAWAL_AND_UNAVAILABLE_STATE'
  | 'DIRECT_SLUG_GUESS_PROTECTION'
  | 'TIMEZONE_AUTHORIZATION_FALLBACK'
  | 'UNPUBLISHED_CONTENT_EXCLUSION'
  | 'UNAUTHORIZED_PROJECTION_FAIL_CLOSED'
  | 'FIXTURE_INTEGRITY_VALIDATION'
  | 'AUTHORIZATION_CONTEXT_REQUIRED'

export interface AuditFinding {
  readonly checkId: string
  readonly title: string
  readonly contract: AuditContractId
  readonly status: AuditStatus
  readonly summary: string
  readonly details?: readonly string[]
}

export interface AuditReport {
  readonly ok: boolean
  readonly auditVersion: string
  readonly mode: 'offline-synthetic'
  readonly executedAtUtc: string
  readonly summary: {
    readonly total: number
    readonly passed: number
    readonly failed: number
  }
  readonly findings: readonly AuditFinding[]
}

export interface SecretMarker {
  readonly markerId: string
  readonly token: string
}

export interface AuditGatewayProjectors {
  readonly validateAndProjectMonthPreview: typeof import('../../src/gateway/monthlyProjection.ts').validateAndProjectMonthPreview
  readonly validateAndProjectMonthDetail: typeof import('../../src/gateway/monthlyProjection.ts').validateAndProjectMonthDetail
  readonly evaluateMonthProgress: typeof import('../../src/gateway/monthlyProjection.ts').evaluateMonthProgress
  readonly validateAndProjectNewsArticle: typeof import('../../src/gateway/monthlyProjection.ts').validateAndProjectNewsArticle
  readonly validateAndProjectLibraryMonthSummary: typeof import('../../src/gateway/monthlyProjection.ts').validateAndProjectLibraryMonthSummary
  readonly validateAndProjectChallenge: typeof import('../../src/gateway/projection.ts').validateAndProjectChallenge
  readonly handleGatewayRequest: typeof import('../../src/gateway/handler.ts').handleGatewayRequest
}

export interface AuditFixtureBundle {
  readonly bundleId: string
  readonly previewDoc209803: Record<string, unknown>
  readonly previewDoc209603: Record<string, unknown>
  readonly detailDoc209803: Record<string, unknown>
  readonly detailDoc209802: Record<string, unknown>
  readonly detailDoc209602: Record<string, unknown>
  readonly detailDoc209804: Record<string, unknown>
  readonly futureChallenge209803Day20: Record<string, unknown>
  readonly activeChallenge209803Day05: Record<string, unknown>
  readonly draftChallengeDoc: Record<string, unknown>
  readonly unreviewedChallengeDoc: Record<string, unknown>
  readonly unapprovedBlockChallengeDoc: Record<string, unknown>
  readonly unlicensedScriptureChallengeDoc: Record<string, unknown>
  readonly duplicateSlotDetailDoc: Record<string, unknown>
  readonly foreignSlotDetailDoc: Record<string, unknown>
  readonly immediateWithdrawalDetailDoc: Record<string, unknown>
  readonly retractedWithdrawalDetailDoc: Record<string, unknown>
  readonly amendedV2WithdrawalDetailDoc: Record<string, unknown>
  readonly previewNewsDocs: readonly Record<string, unknown>[]
  readonly libraryMonthDocs: readonly Record<string, unknown>[]
  readonly secretMarkers: readonly SecretMarker[]
}

export interface AuditRunOptions {
  readonly env?: Partial<GatewayEnv> | null
  readonly serverNowUtc?: Date
  readonly timeZone?: string
  readonly fixtures?: AuditFixtureBundle
  readonly projectors?: Partial<AuditGatewayProjectors>
}
