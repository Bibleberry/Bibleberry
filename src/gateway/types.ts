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
