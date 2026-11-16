import { evaluateCardShareEligibility } from './eligibility.ts'
import { CardShareError, createCanvasCardImageExporter } from './exportImage.ts'
import { buildCardSharePayload } from './payload.ts'
import type {
  CardImageExporter,
  CardShareFailureCode,
  CardShareInput,
  CardShareOutcome,
  CardSharePlatformAdapter,
  CardSharingService,
  WebShareFileInput,
} from './types.ts'

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (
    typeof error === 'object'
    && error !== null
    && 'name' in error
    && (error as { readonly name?: unknown }).name === 'AbortError'
  ) {
    return true
  }
  if (error instanceof Error && /\bcancel(l)?ed\b/i.test(error.message)) {
    return true
  }
  return false
}

function isPermissionError(error: unknown): boolean {
  if (
    error instanceof DOMException
    && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
  ) {
    return true
  }
  if (
    typeof error === 'object'
    && error !== null
    && 'name' in error
    && (
      (error as { readonly name?: unknown }).name === 'NotAllowedError'
      || (error as { readonly name?: unknown }).name === 'SecurityError'
    )
  ) {
    return true
  }
  if (error instanceof Error && /\bpermission\b|\bnot allowed\b|\bdenied\b/i.test(error.message)) {
    return true
  }
  return false
}

function classifyFailure(error: unknown, fallbackCode: CardShareFailureCode): {
  readonly code: CardShareFailureCode
  readonly message: string
} {
  if (error instanceof CardShareError) {
    return { code: error.code, message: error.message }
  }
  if (isPermissionError(error)) {
    return {
      code: 'permission-denied',
      message: 'Sharing permission was denied by your browser or device.',
    }
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return { code: fallbackCode, message: error.message }
  }
  return {
    code: fallbackCode,
    message: 'Unable to share this Scripture Card right now.',
  }
}

export function createBrowserCardSharePlatformAdapter(): CardSharePlatformAdapter {
  return {
    canShareFiles(files: readonly File[]): boolean {
      if (typeof navigator === 'undefined') return false
      if (typeof navigator.share !== 'function') return false
      if (typeof navigator.canShare !== 'function') return false
      try {
        return navigator.canShare({ files: [...files] })
      } catch {
        return false
      }
    },

    async webShare(input: WebShareFileInput): Promise<void> {
      if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
        throw new CardShareError('unsupported', 'Web Share is not available in this browser.')
      }
      await navigator.share({
        title: input.title,
        text: input.text,
        files: [...input.files],
      })
    },

    async downloadFile(fileName: string, blob: Blob): Promise<void> {
      if (
        typeof document === 'undefined'
        || typeof URL === 'undefined'
        || typeof URL.createObjectURL !== 'function'
      ) {
        throw new CardShareError(
          'unsupported',
          'File download fallback is not supported in this environment.',
        )
      }

      const objectUrl = URL.createObjectURL(blob)
      try {
        const anchor = document.createElement('a')
        anchor.href = objectUrl
        anchor.download = fileName
        anchor.rel = 'noopener'
        anchor.style.display = 'none'
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    },
  }
}

export interface CardSharingServiceDeps {
  readonly exporter?: CardImageExporter
  readonly platform?: CardSharePlatformAdapter
}

/**
 * Injectable browser/native sharing service for earned Scripture Cards (R14-9).
 *
 * - Validates earned status, rights, and `shareEligible` before exporting.
 * - Uses the original approved card image and applies subtle Bibleberry attribution
 *   only to the exported image.
 * - Preserves full theological explanation, Scripture reference, and attribution.
 * - Never mutates awards, `cardViewed`, `hubAnnouncementAcked`, or participation progress.
 */
export function createCardSharingService(
  deps: CardSharingServiceDeps = {},
): CardSharingService {
  const exporter = deps.exporter ?? createCanvasCardImageExporter()
  const platform = deps.platform ?? createBrowserCardSharePlatformAdapter()

  return {
    evaluateEligibility(input: CardShareInput) {
      return evaluateCardShareEligibility(input)
    },

    async shareEarnedCard(input: CardShareInput): Promise<CardShareOutcome> {
      const eligibility = evaluateCardShareEligibility(input)
      if (!eligibility.eligible) {
        return {
          status: 'failed',
          code: eligibility.code,
          message: eligibility.message,
        }
      }

      let exportedImage
      try {
        exportedImage = await exporter.exportCardImage(eligibility.card)
      } catch (error) {
        const failure = classifyFailure(error, 'export-failed')
        return {
          status: 'failed',
          code: failure.code,
          message: failure.message,
        }
      }

      const payload = buildCardSharePayload(
        eligibility.award,
        eligibility.card,
        exportedImage,
      )
      if (!payload) {
        return {
          status: 'failed',
          code: 'incomplete-content',
          message:
            'Unable to export an incomplete Scripture Card. Explanation, Scripture reference, and attribution are required.',
        }
      }

      if (platform.nativeShare) {
        try {
          const nativeResult = await platform.nativeShare(payload)
          if (nativeResult === 'cancelled') {
            return {
              status: 'cancelled',
              message: 'Sharing was cancelled. No changes were made to your earned cards.',
            }
          }
          return {
            status: 'shared',
            method: 'native-share',
            payload: payload.summary,
          }
        } catch (error) {
          if (isAbortError(error)) {
            return {
              status: 'cancelled',
              message: 'Sharing was cancelled. No changes were made to your earned cards.',
            }
          }
          const failure = classifyFailure(error, 'export-failed')
          return {
            status: 'failed',
            code: failure.code,
            message: failure.message,
          }
        }
      }

      if (typeof File !== 'undefined') {
        const shareFile = new File([payload.blob], payload.fileName, {
          type: payload.mimeType,
        })

        if (platform.canShareFiles([shareFile])) {
          try {
            await platform.webShare({
              title: payload.title,
              text: payload.text,
              files: [shareFile],
            })
            return {
              status: 'shared',
              method: 'web-share',
              payload: payload.summary,
            }
          } catch (error) {
            if (isAbortError(error)) {
              return {
                status: 'cancelled',
                message: 'Sharing was cancelled. No changes were made to your earned cards.',
              }
            }
            const failure = classifyFailure(error, 'export-failed')
            return {
              status: 'failed',
              code: failure.code,
              message: failure.message,
            }
          }
        }
      }

      try {
        await platform.downloadFile(payload.fileName, payload.blob)
        return {
          status: 'downloaded',
          method: 'download-fallback',
          payload: payload.summary,
        }
      } catch (error) {
        const failure = classifyFailure(error, 'unsupported')
        return {
          status: 'failed',
          code: failure.code,
          message: failure.message,
        }
      }
    },
  }
}
