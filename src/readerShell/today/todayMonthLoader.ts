import {
  detectReaderTimeZone,
  resolveReaderTimeZone,
  type MonthDetailResult,
  type MonthGatewayProvider,
} from '../../cms/reader/monthProvider.ts'
import { formatCivilYearMonthFromDate } from '../../components/month/monthScreenModel.ts'
import { parseLocalCalendarDate, parsePublicationYearMonth } from '../../participation/identity.ts'
import type { PublicationYearMonth } from '../../participation/types.ts'

/**
 * Opal Lantern (Issue #307): Bounded, fail-closed current-Month bootstrap and recovery
 * for the R06 Today host.
 *
 * Contract:
 * 1. Device civil `YYYY-MM` is used as a bootstrap lookup key only. It never authorizes
 *    a Challenge or becomes the final Current Month link.
 * 2. If `loadMonth(bootstrapYearMonth)` returns `status: 'ready'`, validate its gateway
 *    `serverContext.authorizedLocalDate`. If that authoritative date points to a different
 *    `YYYY-MM`, issue at most one corrected `loadMonth(authoritativeYearMonth)` using the
 *    same resolved reader timezone and validate the second response against its own context.
 * 3. If the initial `loadMonth(bootstrapYearMonth)` returns `status: 'notFound'` without
 *    `serverContext`, call `loadNews()` solely to obtain a validated gateway
 *    `serverContext.authorizedLocalDate` (articles are ignored). If its authoritative
 *    `YYYY-MM` differs from the attempted month, request that month once and validate the
 *    final response. If it matches the attempted month, leave the Month unavailable (`notFound`).
 * 4. If `loadNews()` fails, returns `notFound`/invalid context, or if the retried Month is
 *    `notFound`, malformed, mismatched, fails, or shifts to yet another authoritative month
 *    during retry, fail closed with no retry loops, no guessed slugs, and no unverified
 *    Current Month link.
 */

export interface LoadAuthorizedTodayMonthOptions {
  readonly monthProvider: Pick<MonthGatewayProvider, 'loadMonth' | 'loadNews'>
  readonly signal?: AbortSignal
  readonly timeZone?: string
  readonly bootstrapYearMonth?: string
  readonly getNow?: () => Date
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractAuthorizedYearMonth(serverContext: unknown): PublicationYearMonth | null {
  if (!isPlainObject(serverContext)) return null
  const authorizedLocalDate = parseLocalCalendarDate(serverContext.authorizedLocalDate)
  const effectiveTimeZone =
    typeof serverContext.effectiveTimeZone === 'string'
      ? serverContext.effectiveTimeZone.trim()
      : ''
  if (!authorizedLocalDate || !effectiveTimeZone) return null
  return parsePublicationYearMonth(authorizedLocalDate.slice(0, 7))
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  )
}

function unauthorizedMonthResult(requestedYearMonth: string): MonthDetailResult {
  // Returning a ready envelope whose monthId mismatches an empty/invalid context or phase
  // guarantees `deriveTodayPrimaryAction` classifies it as `unavailable` (`unauthorizedContext`)
  // without exposing any Month or Challenge metadata.
  return Object.freeze({
    status: 'ready',
    source: 'gateway',
    serverContext: Object.freeze({
      authorizedLocalDate: '',
      effectiveTimeZone: '',
    }),
    month: Object.freeze({
      monthId: requestedYearMonth,
      documentId: '',
      year: 0,
      month: 0,
      daysInMonth: 0,
      phase: 'historical',
      rosterVersion: 1,
      totalChallenges: 0,
      title: '',
      introduction: Object.freeze({
        version: '',
        previewScreens: Object.freeze([]),
        welcomeScreen: Object.freeze({ id: '', blocks: Object.freeze([]) }),
      }),
      slots: Object.freeze([]),
      discoveries: Object.freeze([]),
    }),
  }) as MonthDetailResult
}

function isAuthoritativeReadyMonthFor(
  result: MonthDetailResult,
  expectedYearMonth: PublicationYearMonth,
): boolean {
  if (result.status !== 'ready' || result.source !== 'gateway') return false
  if (!isPlainObject(result.month) || !isPlainObject(result.serverContext)) return false
  const authoritativeYearMonth = extractAuthorizedYearMonth(result.serverContext)
  if (!authoritativeYearMonth || authoritativeYearMonth !== expectedYearMonth) return false
  const monthId = parsePublicationYearMonth(result.month.monthId)
  if (!monthId || monthId !== expectedYearMonth) return false
  if (result.month.phase !== 'active') return false
  return true
}

export async function loadAuthorizedTodayMonth(
  options: LoadAuthorizedTodayMonthOptions,
): Promise<MonthDetailResult> {
  const { monthProvider, signal } = options
  const timeZone = resolveReaderTimeZone(options.timeZone ?? detectReaderTimeZone())
  const rawBootstrap =
    options.bootstrapYearMonth ??
    formatCivilYearMonthFromDate(options.getNow ? options.getNow() : new Date())
  const bootstrapYearMonth =
    parsePublicationYearMonth(typeof rawBootstrap === 'string' ? rawBootstrap.trim() : rawBootstrap) ??
    (formatCivilYearMonthFromDate(new Date()) as PublicationYearMonth)

  let initialResult: MonthDetailResult
  try {
    initialResult = await monthProvider.loadMonth(bootstrapYearMonth, { signal, timeZone })
  } catch (err: unknown) {
    if (isAbortError(err) || signal?.aborted) throw err
    return {
      status: 'requestError',
      message: err instanceof Error ? err.message : 'Unable to load current month',
      source: 'gateway',
    }
  }

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  if (!isPlainObject(initialResult) || initialResult.source !== 'gateway') {
    return unauthorizedMonthResult(bootstrapYearMonth)
  }

  if (initialResult.status === 'requestError' || initialResult.status === 'validationError') {
    return initialResult
  }

  if (initialResult.status === 'ready') {
    const authoritativeYearMonth = extractAuthorizedYearMonth(initialResult.serverContext)
    if (!authoritativeYearMonth) {
      return unauthorizedMonthResult(bootstrapYearMonth)
    }

    const returnedMonthId = isPlainObject(initialResult.month)
      ? parsePublicationYearMonth(initialResult.month.monthId)
      : null
    if (!returnedMonthId || returnedMonthId !== bootstrapYearMonth) {
      return unauthorizedMonthResult(bootstrapYearMonth)
    }

    if (authoritativeYearMonth === bootstrapYearMonth) {
      return initialResult
    }

    // Authoritative month differs from device bootstrap candidate: request that authoritative month once.
    let retryResult: MonthDetailResult
    try {
      retryResult = await monthProvider.loadMonth(authoritativeYearMonth, { signal, timeZone })
    } catch (err: unknown) {
      if (isAbortError(err) || signal?.aborted) throw err
      return {
        status: 'requestError',
        message: err instanceof Error ? err.message : 'Unable to load authoritative month',
        source: 'gateway',
      }
    }

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    if (!isPlainObject(retryResult) || retryResult.source !== 'gateway') {
      return unauthorizedMonthResult(authoritativeYearMonth)
    }

    if (
      retryResult.status === 'notFound' ||
      retryResult.status === 'requestError' ||
      retryResult.status === 'validationError'
    ) {
      return retryResult
    }

    if (retryResult.status === 'ready') {
      if (!isAuthoritativeReadyMonthFor(retryResult, authoritativeYearMonth)) {
        return unauthorizedMonthResult(authoritativeYearMonth)
      }
      return retryResult
    }

    return {
      status: 'validationError',
      message: 'Unexpected gateway month response status',
      source: 'gateway',
    }
  }

  if (initialResult.status === 'notFound') {
    // Initial 404 lacks serverContext: query loadNews() solely to inspect validated serverContext.
    let newsResult: Awaited<ReturnType<MonthGatewayProvider['loadNews']>>
    try {
      newsResult = await monthProvider.loadNews({ signal, timeZone })
    } catch (err: unknown) {
      if (isAbortError(err) || signal?.aborted) throw err
      return initialResult
    }

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    if (
      !isPlainObject(newsResult) ||
      newsResult.source !== 'gateway' ||
      newsResult.status !== 'ready'
    ) {
      // Fail closed to the neutral unavailable (notFound) state without loops or guessed actions.
      return initialResult
    }

    const authoritativeYearMonth = extractAuthorizedYearMonth(newsResult.serverContext)
    if (!authoritativeYearMonth) {
      return unauthorizedMonthResult(bootstrapYearMonth)
    }

    if (authoritativeYearMonth === bootstrapYearMonth) {
      // Genuine unpublished Month: News reports the same unavailable YYYY-MM -> leave unavailable, no retry loop.
      return initialResult
    }

    // News serverContext identifies a different authoritative month: request that month once.
    let retryResult: MonthDetailResult
    try {
      retryResult = await monthProvider.loadMonth(authoritativeYearMonth, { signal, timeZone })
    } catch (err: unknown) {
      if (isAbortError(err) || signal?.aborted) throw err
      return {
        status: 'requestError',
        message: err instanceof Error ? err.message : 'Unable to load authoritative month',
        source: 'gateway',
      }
    }

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    if (!isPlainObject(retryResult) || retryResult.source !== 'gateway') {
      return unauthorizedMonthResult(authoritativeYearMonth)
    }

    if (
      retryResult.status === 'notFound' ||
      retryResult.status === 'requestError' ||
      retryResult.status === 'validationError'
    ) {
      return retryResult
    }

    if (retryResult.status === 'ready') {
      if (!isAuthoritativeReadyMonthFor(retryResult, authoritativeYearMonth)) {
        return unauthorizedMonthResult(authoritativeYearMonth)
      }
      return retryResult
    }

    return {
      status: 'validationError',
      message: 'Unexpected gateway month response status',
      source: 'gateway',
    }
  }

  return {
    status: 'validationError',
    message: 'Unexpected gateway month response status',
    source: 'gateway',
  }
}
