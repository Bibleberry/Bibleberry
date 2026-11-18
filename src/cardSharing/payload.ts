import type { EarnedAwardRecord, EarnedScriptureCardSnapshot } from '../participation/types.ts'
import type { CardSharePayload, ExportedCardImage } from './types.ts'

export function buildCardExportFileName(
  card: EarnedScriptureCardSnapshot,
  mimeType: string = 'image/png',
): string {
  const safeBase = card.cardDocumentId
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png'
  return `${safeBase || 'earned-scripture-card'}-bibleberry.${ext}`
}

export function buildCardShareText(card: EarnedScriptureCardSnapshot): string {
  const title = card.title.trim()
  const reference = card.scripture.reference.trim()
  const translation = card.scripture.translation.trim()
  const book = card.scripture.book.trim()
  const explanation = card.accessibleTranscription.trim()
  const attribution = card.attribution.trim()

  return [
    title,
    `${reference} (${translation} · ${book})`,
    '',
    explanation,
    '',
    `Attribution: ${attribution}`,
    'Shared from Bibleberry',
  ].join('\n')
}

export function buildCardSharePayload(
  award: EarnedAwardRecord,
  card: EarnedScriptureCardSnapshot,
  exportedImage: ExportedCardImage,
): CardSharePayload | null {
  const title = card.title.trim()
  const reference = card.scripture.reference.trim()
  const book = card.scripture.book.trim()
  const translation = card.scripture.translation.trim()
  const explanation = card.accessibleTranscription.trim()
  const attribution = card.attribution.trim()

  if (
    !title
    || !reference
    || !book
    || !translation
    || !explanation
    || !attribution
    || !exportedImage
    || !(exportedImage.blob instanceof Blob)
    || exportedImage.blob.size <= 0
    || exportedImage.attributionApplied !== 'export-only'
    || exportedImage.width <= 0
    || exportedImage.height <= 0
  ) {
    return null
  }

  const shareText = buildCardShareText(card)
  if (
    !shareText.includes(explanation)
    || !shareText.includes(reference)
    || !shareText.includes(attribution)
  ) {
    return null
  }

  const fileName = exportedImage.fileName || buildCardExportFileName(card, exportedImage.mimeType)

  return {
    title,
    text: shareText,
    fileName,
    blob: exportedImage.blob,
    mimeType: exportedImage.mimeType,
    summary: {
      awardId: award.awardId,
      cardDocumentId: card.cardDocumentId,
      title,
      fileName,
      shareText,
      scriptureReference: `${reference} (${translation} · ${book})`,
      theologicalExplanation: explanation,
      attribution,
      exportedWidth: exportedImage.width,
      exportedHeight: exportedImage.height,
    },
  }
}
