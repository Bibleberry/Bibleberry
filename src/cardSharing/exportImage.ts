import type { EarnedScriptureCardSnapshot } from '../participation/types.ts'
import { buildCardExportFileName } from './payload.ts'
import type {
  CardImageExporter,
  CardShareFailureCode,
  ExportedCardImage,
} from './types.ts'

export class CardShareError extends Error {
  readonly code: CardShareFailureCode

  constructor(code: CardShareFailureCode, message: string) {
    super(message)
    this.name = 'CardShareError'
    this.code = code
  }
}

export interface CanvasCardImageExporterDeps {
  readonly fetchImageBlob?: (imageUrl: string) => Promise<Blob>
  readonly decodeImage?: (blob: Blob) => Promise<CanvasImageSource & { readonly width: number; readonly height: number }>
  readonly createCanvas?: (width: number, height: number) => HTMLCanvasElement
}

async function defaultFetchImageBlob(imageUrl: string): Promise<Blob> {
  let response: Response
  try {
    response = await fetch(imageUrl, {
      mode: 'cors',
      credentials: 'omit',
    })
  } catch {
    throw new CardShareError(
      'unavailable-asset',
      'Unable to load the Scripture Card illustration right now. Please check your connection and try again.',
    )
  }

  if (!response.ok) {
    throw new CardShareError(
      'unavailable-asset',
      `The Scripture Card illustration is unavailable (status ${response.status}).`,
    )
  }

  const blob = await response.blob()
  if (!blob || blob.size <= 0) {
    throw new CardShareError(
      'unavailable-asset',
      'The Scripture Card illustration returned an empty asset.',
    )
  }

  return blob
}

async function defaultDecodeImage(
  blob: Blob,
): Promise<HTMLImageElement> {
  if (typeof URL === 'undefined' || typeof Image === 'undefined') {
    throw new CardShareError(
      'unsupported',
      'Image export is not supported in this environment.',
    )
  }

  const objectUrl = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () =>
        reject(
          new CardShareError(
            'unavailable-asset',
            'The Scripture Card illustration could not be decoded for export.',
          ),
        )
      element.src = objectUrl
    })
    return img
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function defaultCreateCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new CardShareError(
      'unsupported',
      'Canvas export is not supported in this environment.',
    )
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function computeAttributionStripHeight(imageHeight: number): number {
  return Math.max(40, Math.min(72, Math.round(imageHeight * 0.06)))
}

/**
 * Creates a browser/WebView image exporter that fetches the original approved Scripture Card
 * illustration and appends a subtle Bibleberry attribution strip only to the exported image.
 *
 * Never mutates the original asset URL, artwork pixels, or stored award record.
 */
export function createCanvasCardImageExporter(
  deps: CanvasCardImageExporterDeps = {},
): CardImageExporter {
  const fetchImageBlob = deps.fetchImageBlob ?? defaultFetchImageBlob
  const decodeImage = deps.decodeImage ?? defaultDecodeImage
  const createCanvas = deps.createCanvas ?? defaultCreateCanvas

  return {
    async exportCardImage(card: EarnedScriptureCardSnapshot): Promise<ExportedCardImage> {
      const sourceBlob = await fetchImageBlob(card.imageUrl)
      const image = await decodeImage(sourceBlob)

      const sourceWidth = Math.max(1, image.width)
      const sourceHeight = Math.max(1, image.height)
      const stripHeight = computeAttributionStripHeight(sourceHeight)
      const exportWidth = sourceWidth
      const exportHeight = sourceHeight + stripHeight

      const canvas = createCanvas(exportWidth, exportHeight)
      const context = canvas.getContext('2d')
      if (!context) {
        throw new CardShareError(
          'export-failed',
          'Unable to prepare the exported Scripture Card image.',
        )
      }

      // Draw original approved artwork intact without cropping or altering its pixels.
      context.drawImage(image, 0, 0, sourceWidth, sourceHeight)

      // Subtle neutral attribution strip added only to the exported image.
      context.fillStyle = '#f6f3ec'
      context.fillRect(0, sourceHeight, exportWidth, stripHeight)

      context.strokeStyle = '#d7d0c4'
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(0, sourceHeight + 0.5)
      context.lineTo(exportWidth, sourceHeight + 0.5)
      context.stroke()

      const fontSize = Math.max(11, Math.min(18, Math.round(stripHeight * 0.34)))
      const paddingX = Math.max(12, Math.round(exportWidth * 0.025))
      const textY = sourceHeight + Math.round(stripHeight / 2)

      context.fillStyle = '#4a4740'
      context.font = `500 ${fontSize}px system-ui, -apple-system, sans-serif`
      context.textBaseline = 'middle'

      context.textAlign = 'left'
      context.fillText(
        `${card.scripture.reference} · ${card.attribution}`,
        paddingX,
        textY,
        Math.max(40, exportWidth - paddingX * 2 - 110),
      )

      context.textAlign = 'right'
      context.fillText('Bibleberry', exportWidth - paddingX, textY)

      const exportedBlob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(blob => resolve(blob), 'image/png')
      })

      if (!exportedBlob || exportedBlob.size <= 0) {
        throw new CardShareError(
          'export-failed',
          'Exporting the Scripture Card image produced an empty file.',
        )
      }

      const mimeType = exportedBlob.type || 'image/png'
      return {
        blob: exportedBlob,
        mimeType,
        fileName: buildCardExportFileName(card, mimeType),
        width: exportWidth,
        height: exportHeight,
        attributionApplied: 'export-only',
        sourceImageUrl: card.imageUrl,
      }
    },
  }
}
