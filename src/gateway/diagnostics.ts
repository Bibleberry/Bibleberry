import type { ValidationFailureReason } from './projection.ts'

/**
 * Operator-facing diagnostics for the Release Gateway (Anthropic Addresses #369).
 *
 * The gateway deliberately fails closed: readers see the same neutral 404 or 502 whatever went
 * wrong. These events give operators the distinction in Worker logs instead, without changing
 * any reader response.
 *
 * PRIVACY CONTRACT: an event may carry only the fields declared below. The values are
 * gateway-chosen enums, HTTP status numbers, counts, durations, configuration *names*, and
 * request identifiers that have already passed route validation (a `YYYY-MM` month or a
 * slug matching the slug pattern). Events never carry the Sanity token, upstream URLs or
 * query text, upstream response bodies, document bodies, titles, Scripture, review notes,
 * or any other unreleased content.
 */

export type GatewayRouteId =
  | 'unknown'
  | 'catalog'
  | 'challenge'
  | 'monthPreview'
  | 'monthDetail'
  | 'monthProgress'
  | 'libraryMonths'
  | 'news'

export type GatewayLogLevel = 'info' | 'warn' | 'error'

/** How the upstream Sanity exchange failed. */
export type UpstreamFailureKind =
  /** `fetch` rejected before a response arrived (DNS, TLS, connection reset). */
  | 'network'
  /** No complete response within the gateway's upstream timeout. */
  | 'timeout'
  /** Sanity answered with a non-2xx status; see `upstreamStatus` and `upstreamStatusHint`. */
  | 'httpStatus'
  /** A 2xx response whose body was not valid JSON. */
  | 'invalidJson'
  /** Valid JSON without the GROQ `result` member. */
  | 'missingResult'
  /** `result` had the wrong shape for the route (for example not an array for a list route). */
  | 'unexpectedResultShape'
  /** The bounded Library scan could not produce a canonical continuation cursor. */
  | 'libraryScanIncomplete'

/**
 * Coarse reading of an upstream HTTP status, so a log search can find "token rejected"
 * without remembering status codes.
 */
export type UpstreamStatusHint =
  | 'authorization'
  | 'notFound'
  | 'rateLimited'
  | 'clientError'
  | 'serverError'
  | 'unexpected'

/**
 * Why a single month or Challenge request answered with the neutral 404.
 * - `notYetReleased`: the authorized reader date is before the route's release gate, so the
 *   gateway did not contact Sanity at all.
 * - `noEligibleDocument`: Sanity returned no published, scheduled, non-withdrawn document.
 * - any `ValidationFailureReason`: the document came back but projection rejected it.
 */
export type ContentUnavailableReason =
  | 'notYetReleased'
  | 'noEligibleDocument'
  | ValidationFailureReason

export type ContentUnavailableStage = 'releaseGate' | 'upstream' | 'projection'

interface GatewayDiagnosticBase {
  readonly source: 'bibleberry-gateway'
  readonly level: GatewayLogLevel
  readonly route: GatewayRouteId
  /** The HTTP status the reader actually received. */
  readonly responseStatus: number
}

export interface UpstreamFailureEvent extends GatewayDiagnosticBase {
  readonly event: 'upstreamFailure'
  readonly failure: UpstreamFailureKind
  readonly upstreamStatus?: number
  readonly upstreamStatusHint?: UpstreamStatusHint
  readonly elapsedMs?: number
  readonly timeoutMs?: number
}

export interface ContentUnavailableEvent extends GatewayDiagnosticBase {
  readonly event: 'contentUnavailable'
  readonly stage: ContentUnavailableStage
  readonly reason: ContentUnavailableReason
  /** Present on month routes; already validated as `YYYY-MM`. */
  readonly yearMonth?: string
  /** Present on the single-Challenge route; already validated against the slug pattern. */
  readonly slug?: string
}

export interface ItemsRejectedEvent extends GatewayDiagnosticBase {
  readonly event: 'itemsRejected'
  readonly inspected: number
  readonly rejected: number
  readonly reasons: Readonly<Partial<Record<ValidationFailureReason, number>>>
}

export interface ConfigurationErrorEvent extends GatewayDiagnosticBase {
  readonly event: 'configurationError'
  /** Names of the bindings that were missing or invalid. Never their values. */
  readonly bindings: readonly string[]
}

export type GatewayDiagnosticEvent =
  | UpstreamFailureEvent
  | ContentUnavailableEvent
  | ItemsRejectedEvent
  | ConfigurationErrorEvent

export type GatewayLogger = (event: GatewayDiagnosticEvent) => void

type EventFields<E extends GatewayDiagnosticEvent> = Omit<E, 'source' | 'route'>

/** Writes one JSON line per event so Workers Logs can index the fields. */
export const consoleGatewayLogger: GatewayLogger = event => {
  const line = JSON.stringify(event)
  if (event.level === 'error') {
    console.error(line)
  } else if (event.level === 'warn') {
    console.warn(line)
  } else {
    console.info(line)
  }
}

export function classifyUpstreamStatus(status: number): UpstreamStatusHint {
  if (status === 401 || status === 403) return 'authorization'
  if (status === 404) return 'notFound'
  if (status === 429) return 'rateLimited'
  if (status >= 400 && status < 500) return 'clientError'
  if (status >= 500 && status < 600) return 'serverError'
  return 'unexpected'
}

export interface RouteDiagnostics {
  readonly route: GatewayRouteId
  upstreamFailure(fields: EventFields<UpstreamFailureEvent>): void
  contentUnavailable(fields: EventFields<ContentUnavailableEvent>): void
  itemsRejected(fields: EventFields<ItemsRejectedEvent>): void
  configurationError(fields: EventFields<ConfigurationErrorEvent>): void
}

/**
 * Binds a logger to one route. Logging is best-effort: a throwing logger never changes the
 * reader's response.
 */
export function createRouteDiagnostics(
  route: GatewayRouteId,
  logger: GatewayLogger = consoleGatewayLogger,
): RouteDiagnostics {
  const emit = (event: GatewayDiagnosticEvent) => {
    try {
      logger(event)
    } catch {
      // Diagnostics must never affect the response.
    }
  }
  return {
    route,
    upstreamFailure: fields => emit({ source: 'bibleberry-gateway', route, ...fields }),
    contentUnavailable: fields => emit({ source: 'bibleberry-gateway', route, ...fields }),
    itemsRejected: fields => emit({ source: 'bibleberry-gateway', route, ...fields }),
    configurationError: fields => emit({ source: 'bibleberry-gateway', route, ...fields }),
  }
}

/**
 * Tallies projection rejections in list routes (catalog, News, Library) so one summary event
 * can be emitted per request instead of one per document.
 */
export class RejectionTally {
  inspected = 0
  rejected = 0
  readonly reasons: Partial<Record<ValidationFailureReason, number>> = {}

  record(result: { readonly ok: true } | { readonly ok: false; readonly reason: ValidationFailureReason }): void {
    this.inspected += 1
    if (!result.ok) {
      this.rejected += 1
      this.reasons[result.reason] = (this.reasons[result.reason] ?? 0) + 1
    }
  }

  report(diagnostics: RouteDiagnostics, responseStatus: number): void {
    if (this.rejected === 0) return
    diagnostics.itemsRejected({
      event: 'itemsRejected',
      level: 'info',
      responseStatus,
      inspected: this.inspected,
      rejected: this.rejected,
      reasons: { ...this.reasons },
    })
  }
}
