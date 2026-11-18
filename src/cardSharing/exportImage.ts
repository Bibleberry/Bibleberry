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

const MIN_EXPORT_WIDTH = 640
const FOOTER_BACKGROUND = '#f6f3ec'
const FOOTER_BORDER = '#d7d0c4'
const TEXT_PRIMARY = '#1f1d1a'
const TEXT_SECONDARY = '#4a4740'
const TEXT_MUTED = '#5c5850'

type TextWidthMeasurer = (text: string, font: string, fontSize: number) => number

function createTextWidthMeasurer(): TextWidthMeasurer {
  const measureContext =
    typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null

  return (text: string, font: string, fontSize: number): number => {
    if (measureContext) {
      measureContext.font = font
      const measured = measureContext.measureText(text).width
      if (Number.isFinite(measured) && measured > 0) {
        return measured
      }
    }
    return text.length * fontSize * 0.55
  }
}

export function wrapTextForWidth(
  text: string,
  maxWidth: number,
  measureWidth: (candidate: string) => number,
): string[] {
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n')
  const lines: string[] = []

  for (const rawParagraph of paragraphs) {
    const paragraph = rawParagraph.trim()
    if (!paragraph) {
      lines.push('')
      continue
    }

    const words = paragraph.split(/\s+/)
    let currentLine = ''

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word
      if (measureWidth(candidate) <= maxWidth) {
        currentLine = candidate
        continue
      }

      if (currentLine) {
        lines.push(currentLine)
        currentLine = ''
      }

      if (measureWidth(word) <= maxWidth) {
        currentLine = word
        continue
      }

      // Break an extra-long token by character so no text is ever clipped.
      let chunk = ''
      for (const char of word) {
        const nextChunk = chunk + char
        if (chunk && measureWidth(nextChunk) > maxWidth) {
          lines.push(chunk)
          chunk = char
        } else {
          chunk = nextChunk
        }
      }
      currentLine = chunk
    }

    if (currentLine) {
      lines.push(currentLine)
    }
  }

  return lines
}

interface ExportFooterLayout {
  readonly exportWidth: number
  readonly artworkX: number
  readonly footerHeight: number
  readonly paddingX: number
  readonly paddingY: number
  readonly titleFont: string
  readonly titleLineHeight: number
  readonly titleLines: readonly string[]
  readonly referenceFont: string
  readonly referenceLineHeight: number
  readonly referenceLines: readonly string[]
  readonly bodyFont: string
  readonly bodyLineHeight: number
  readonly bodyLines: readonly string[]
  readonly metaFont: string
  readonly metaLineHeight: number
  readonly attributionText: string
  readonly brandText: string
}

function computeExportFooterLayout(
  card: EarnedScriptureCardSnapshot,
  sourceWidth: number,
  measureText: TextWidthMeasurer,
): ExportFooterLayout {
  const exportWidth = Math.max(sourceWidth, MIN_EXPORT_WIDTH)
  const artworkX = Math.floor((exportWidth - sourceWidth) / 2)
  const paddingX = Math.max(24, Math.round(exportWidth * 0.04))
  const paddingY = Math.max(20, Math.round(exportWidth * 0.03))
  const maxTextWidth = Math.max(120, exportWidth - paddingX * 2)

  const titleFontSize = Math.max(18, Math.min(26, Math.round(exportWidth * 0.028)))
  const titleLineHeight = Math.round(titleFontSize * 1.3)
  const titleFont = `600 ${titleFontSize}px system-ui, -apple-system, sans-serif`
  const titleLines = wrapTextForWidth(card.title.trim(), maxTextWidth, text =>
    measureText(text, titleFont, titleFontSize),
  )

  const refFontSize = Math.max(14, Math.min(20, Math.round(exportWidth * 0.021)))
  const referenceLineHeight = Math.round(refFontSize * 1.35)
  const referenceFont = `600 ${refFontSize}px system-ui, -apple-system, sans-serif`
  const referenceText = `${card.scripture.reference.trim()} (${card.scripture.translation.trim()} · ${card.scripture.book.trim()})`
  const referenceLines = wrapTextForWidth(referenceText, maxTextWidth, text =>
    measureText(text, referenceFont, refFontSize),
  )

  const bodyFontSize = Math.max(14, Math.min(18, Math.round(exportWidth * 0.02)))
  const bodyLineHeight = Math.round(bodyFontSize * 1.45)
  const bodyFont = `400 ${bodyFontSize}px system-ui, -apple-system, sans-serif`
  const bodyLines = wrapTextForWidth(card.accessibleTranscription.trim(), maxTextWidth, text =>
    measureText(text, bodyFont, bodyFontSize),
  )

  const metaFontSize = Math.max(12, Math.min(16, Math.round(exportWidth * 0.017)))
  const metaLineHeight = Math.round(metaFontSize * 1.4)
  const metaFont = `500 ${metaFontSize}px system-ui, -apple-system, sans-serif`

  const sectionGap = Math.round(bodyLineHeight * 0.5)
  const blankLineHeight = Math.round(bodyLineHeight * 0.6)
  const bodyHeight = bodyLines.reduce(
    (total, line) => total + (line === '' ? blankLineHeight : bodyLineHeight),
    0,
  )

  const footerHeight =
    paddingY
    + titleLines.length * titleLineHeight
    + Math.round(sectionGap * 0.5)
    + referenceLines.length * referenceLineHeight
    + sectionGap
    + bodyHeight
    + sectionGap
    + 1 // subtle divider above attribution row
    + Math.round(sectionGap * 0.75)
    + metaLineHeight
    + paddingY

  return {
    exportWidth,
    artworkX,
    footerHeight,
    paddingX,
    paddingY,
    titleFont,
    titleLineHeight,
    titleLines,
    referenceFont,
    referenceLineHeight,
    referenceLines,
    bodyFont,
    bodyLineHeight,
    bodyLines,
    metaFont,
    metaLineHeight,
    attributionText: `Attribution: ${card.attribution.trim()}`,
    brandText: 'Bibleberry',
  }
}

/**
 * Creates a browser/WebView image exporter that fetches the original approved Scripture Card
 * illustration and composes an export-only card image containing the intact artwork,
 * complete untruncated theological explanation, Scripture reference, attribution, and
 * subtle Bibleberry identifier.
 *
 * Never mutates the original asset URL, artwork pixels, or stored award record.
 */
export function createCanvasCardImageExporter(
  deps: CanvasCardImageExporterDeps = {},
): CardImageExporter {
  const fetchImageBlob = deps.fetchImageBlob ?? defaultFetchImageBlob
  const decodeImage = deps.decodeImage ?? defaultDecodeImage
  const createCanvas = deps.createCanvas ?? defaultCreateCanvas
  const measureText = createTextWidthMeasurer()

  return {
    async exportCardImage(card: EarnedScriptureCardSnapshot): Promise<ExportedCardImage> {
      const sourceBlob = await fetchImageBlob(card.imageUrl)
      const image = await decodeImage(sourceBlob)

      const sourceWidth = Math.max(1, image.width)
      const sourceHeight = Math.max(1, image.height)
      const layout = computeExportFooterLayout(card, sourceWidth, measureText)
      const exportWidth = layout.exportWidth
      const exportHeight = sourceHeight + layout.footerHeight

      const canvas = createCanvas(exportWidth, exportHeight)
      const context = canvas.getContext('2d')
      if (!context) {
        throw new CardShareError(
          'export-failed',
          'Unable to prepare the exported Scripture Card image.',
        )
      }

      if (exportWidth > sourceWidth) {
        context.fillStyle = FOOTER_BACKGROUND
        context.fillRect(0, 0, exportWidth, sourceHeight)
      }

      // Draw original approved artwork intact without cropping, scaling, or altering its pixels.
      context.drawImage(image, layout.artworkX, 0, sourceWidth, sourceHeight)

      // Export-only footer panel containing complete explanation, reference, and attribution.
      context.fillStyle = FOOTER_BACKGROUND
      context.fillRect(0, sourceHeight, exportWidth, layout.footerHeight)

      context.strokeStyle = FOOTER_BORDER
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(0, sourceHeight + 0.5)
      context.lineTo(exportWidth, sourceHeight + 0.5)
      context.stroke()

      let cursorY = sourceHeight + layout.paddingY
      context.textBaseline = 'top'
      context.textAlign = 'left'

      context.fillStyle = TEXT_PRIMARY
      context.font = layout.titleFont
      for (const line of layout.titleLines) {
        context.fillText(line, layout.paddingX, cursorY)
        cursorY += layout.titleLineHeight
      }

      cursorY += Math.round(layout.bodyLineHeight * 0.25)
      context.fillStyle = TEXT_SECONDARY
      context.font = layout.referenceFont
      for (const line of layout.referenceLines) {
        context.fillText(line, layout.paddingX, cursorY)
        cursorY += layout.referenceLineHeight
      }

      cursorY += Math.round(layout.bodyLineHeight * 0.5)
      context.fillStyle = TEXT_PRIMARY
      context.font = layout.bodyFont
      const blankLineHeight = Math.round(layout.bodyLineHeight * 0.6)
      for (const line of layout.bodyLines) {
        if (line === '') {
          cursorY += blankLineHeight
          continue
        }
        context.fillText(line, layout.paddingX, cursorY)
        cursorY += layout.bodyLineHeight
      }

      cursorY += Math.round(layout.bodyLineHeight * 0.5)
      context.strokeStyle = FOOTER_BORDER
      context.beginPath()
      context.moveTo(layout.paddingX, cursorY + 0.5)
      context.lineTo(exportWidth - layout.paddingX, cursorY + 0.5)
      context.stroke()

      cursorY += Math.round(layout.bodyLineHeight * 0.375)
      context.fillStyle = TEXT_MUTED
      context.font = layout.metaFont
      context.textAlign = 'left'
      context.fillText(
        layout.attributionText,
        layout.paddingX,
        cursorY,
        Math.max(80, exportWidth - layout.paddingX * 2 - 100),
      )

      context.textAlign = 'right'
      context.fillText(layout.brandText, exportWidth - layout.paddingX, cursorY)

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
