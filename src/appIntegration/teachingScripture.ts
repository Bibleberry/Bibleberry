import type { Teaching } from '../data/content.ts'
import { validateScriptureReference } from '../scriptureCapture/validation.ts'

const supportedTeachingIds = new Set(['november-5-gods-will'])
const supportedTranslations = new Set(['NIV', 'WEBP'])

export interface TeachingScriptureCapture {
  readonly reference: string
  readonly translation: string
}

/**
 * Only the explicitly supported authored teaching may expose this control.
 * The display citation must end in a recognized translation and a valid reference.
 */
export function getTeachingScriptureCapture(
  teaching: Pick<Teaching, 'id' | 'status' | 'scripture'>,
): TeachingScriptureCapture | null {
  if (
    teaching.status !== 'Authentic teaching sample'
    || !supportedTeachingIds.has(teaching.id)
  ) {
    return null
  }

  const citation = /^(.+?)\s+\(([^()]*)\)\s*$/u.exec(teaching.scripture.trim())
  if (!citation) return null

  const translation = citation[2].trim().toUpperCase()
  if (!supportedTranslations.has(translation)) return null

  const reference = validateScriptureReference(citation[1])
  if (!reference.ok) return null

  return { reference: reference.reference, translation }
}
