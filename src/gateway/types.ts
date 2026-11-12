/**
 * Environment bindings required by the Cloudflare Worker gateway.
 */
export interface GatewayEnv {
  readonly SANITY_PROJECT_ID: string
  readonly SANITY_DATASET: string
  readonly SANITY_API_VERSION?: string
  /**
   * Private Sanity read-only viewer token.
   * Stored strictly in Cloudflare Worker secrets; never exposed to browser bundles.
   */
  readonly SANITY_READ_TOKEN: string
  /**
   * Comma-delimited list of authorized browser origins (or '*' for public dev).
   * Example: 'http://localhost:3000,http://127.0.0.1:3000'
   */
  readonly ALLOWED_ORIGINS?: string
}

export type GatewayFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

/**
 * Cloudflare Workers Static Assets binding interface.
 */
export interface WorkerAssetsBinding {
  readonly fetch: (request: Request | string, init?: RequestInit) => Promise<Response>
}

/**
 * Environment bindings for the Cloudflare Worker runtime,
 * including GatewayEnv and optional static assets binding.
 */
export interface WorkerEnv extends GatewayEnv {
  readonly ASSETS?: WorkerAssetsBinding
}

export interface GatewayOptions {
  /**
   * Injectable server clock for deterministic testing of exact release boundaries.
   * Defaults to `() => new Date()`.
   */
  readonly getNow?: () => Date
  /**
   * Injectable HTTP fetch client for upstream requests.
   * Defaults to global `fetch`.
   */
  readonly fetchImpl?: GatewayFetch
}

export type GatewayErrorKind =
  | 'notFound'
  | 'methodNotAllowed'
  | 'upstreamError'
  | 'serverConfigurationError'
  | 'badRequest'

export interface GatewayErrorResponse {
  readonly ok: false
  readonly error: {
    readonly kind: GatewayErrorKind
    readonly message: string
  }
}

export interface GatewayServerContext {
  readonly authorizedLocalDate: string
  readonly effectiveTimeZone: string
}

export interface GatewayCalendarSlot {
  readonly monthId: string
  readonly documentId: string
  readonly monthTitle: string
  readonly publicationDate: string
  readonly dayOfMonth: number
}

export interface GatewayCatalogSummary {
  readonly _id: string
  readonly _type: 'challenge'
  readonly title: string
  readonly slug: string
  readonly challengeType: string
  readonly series?: {
    readonly _id: string
    readonly title: string
    readonly slug: string
  }
  readonly sequence?: number
  readonly releaseAt?: string
  readonly calendarSlot?: GatewayCalendarSlot
  readonly summary?: string
  readonly primaryScripture: unknown
  readonly editorialEligibility: {
    readonly adaptationReviewed: true
    readonly reviewedAt: string
  }
}

export interface GatewayCatalogResponse {
  readonly ok: true
  readonly serverContext: GatewayServerContext
  readonly challenges: readonly GatewayCatalogSummary[]
}

export interface GatewayChallengeResponse {
  readonly ok: true
  readonly serverContext: GatewayServerContext
  readonly challenge: Record<string, unknown>
}

export interface GatewayCoverImage {
  readonly url: string
  readonly alt: string
}

export interface GatewayIntroductionScreen {
  readonly id: string
  readonly stepLabel?: string
  readonly title?: string
  readonly ctaLabel?: string
  readonly blocks: readonly Record<string, unknown>[]
}

export type GatewayMonthSlotPreview =
  | {
      readonly dayOfMonth: number
      readonly date: string
      readonly title: string
      readonly availability: 'comingSoon'
    }
  | {
      readonly dayOfMonth: number
      readonly date: string
      readonly availability: 'unavailable'
    }

export interface GatewayMonthPreviewResponse {
  readonly ok: true
  readonly serverContext: GatewayServerContext
  readonly month: {
    readonly monthId: string
    readonly documentId: string
    readonly year: number
    readonly month: number
    readonly daysInMonth: number
    readonly phase: 'advancePreview'
    readonly monthStartsOn: string
    readonly title: string
    readonly subtitle?: string
    readonly coverImage?: GatewayCoverImage
    readonly introduction: {
      readonly version: string
      readonly previewScreens: readonly GatewayIntroductionScreen[]
    }
    readonly slots: readonly GatewayMonthSlotPreview[]
  }
}

export type GatewayMonthSlot =
  | {
      readonly dayOfMonth: number
      readonly date: string
      readonly availability: 'available'
      readonly title: string
      readonly slug: string
      readonly challengeId: string
      readonly challengeType: string
    }
  | {
      readonly dayOfMonth: number
      readonly date: string
      readonly availability: 'comingSoon'
      readonly title: string
    }
  | {
      readonly dayOfMonth: number
      readonly date: string
      readonly availability: 'unavailable'
      readonly formerChallengeId?: string
    }

export interface GatewayMonthDiscoverySummary {
  readonly discoveryId: string
  readonly kind: 'thematic' | 'fullMonth'
  readonly title: string
  readonly targetCount: number
}

export interface GatewayMonthDetailResponse {
  readonly ok: true
  readonly serverContext: GatewayServerContext
  readonly month: {
    readonly monthId: string
    readonly documentId: string
    readonly year: number
    readonly month: number
    readonly daysInMonth: number
    readonly phase: 'active' | 'historical'
    readonly rosterVersion: number
    readonly totalChallenges: number
    readonly title: string
    readonly subtitle?: string
    readonly coverImage?: GatewayCoverImage
    readonly introduction: {
      readonly version: string
      readonly previewScreens: readonly GatewayIntroductionScreen[]
      readonly welcomeScreen: GatewayIntroductionScreen
    }
    readonly slots: readonly GatewayMonthSlot[]
    readonly discoveries: readonly GatewayMonthDiscoverySummary[]
  }
}

export interface GatewayEarnedScriptureCard {
  readonly cardDocumentId: string
  readonly title: string
  readonly publicationYearMonth: string
  readonly imageUrl: string
  readonly assetRevision: string
  readonly illustrationAlt: string
  readonly accessibleTranscription: string
  readonly scripture: {
    readonly book: string
    readonly reference: string
    readonly translation: string
  }
  readonly attribution: string
  readonly rightsStatus: string
  readonly shareEligible: boolean
  readonly theologicalThemes?: readonly string[]
  readonly keywords?: readonly string[]
}

export interface GatewayMonthProgressDiscovery {
  readonly discoveryId: string
  readonly kind: 'thematic' | 'fullMonth'
  readonly title: string
  readonly achievedCount: number
  readonly targetCount: number
  readonly isEarned: boolean
  readonly awardId?: string
  readonly reservedCardId?: string
  readonly earnedCard?: GatewayEarnedScriptureCard
}

export interface GatewayMonthProgressResponse {
  readonly ok: true
  readonly serverContext: GatewayServerContext
  readonly monthId: string
  readonly rosterVersion: number
  readonly completedInMonthCount: number
  readonly totalChallenges: number
  readonly thematicEarnedCount: number
  readonly thematicTotalCount: number
  readonly discoveries: readonly GatewayMonthProgressDiscovery[]
}

export type GatewayNewsCategory = 'monthlyPreview' | 'ministryUpdate' | 'announcement'

export interface GatewayNewsArticle {
  readonly id: string
  readonly documentId: string
  readonly category: GatewayNewsCategory
  readonly publishedOn: string
  readonly title: string
  readonly summary: string
  readonly body?: readonly Record<string, unknown>[]
  readonly coverImage?: GatewayCoverImage
  readonly destination?: {
    readonly kind: 'month'
    readonly monthId: string
  }
}

export interface GatewayNewsResponse {
  readonly ok: true
  readonly serverContext: GatewayServerContext
  readonly articles: readonly GatewayNewsArticle[]
}

export interface GatewayLibraryMonthSummary {
  readonly yearMonth: string
  readonly year: number
  readonly month: number
  readonly title: string
  readonly subtitle?: string
  readonly coverImage?: GatewayCoverImage
}

export interface GatewayLibraryMonthsPage {
  readonly limit: number
  readonly hasMore: boolean
  readonly nextCursor: string | null
}

export interface GatewayLibraryMonthsResponse {
  readonly ok: true
  readonly serverContext: GatewayServerContext
  readonly items: readonly GatewayLibraryMonthSummary[]
  readonly page: GatewayLibraryMonthsPage
}
