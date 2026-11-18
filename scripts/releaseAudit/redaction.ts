import type { SecretMarker } from './types.ts'

const REDACTED_PLACEHOLDER = '[REDACTED_MARKER]'

/**
 * Removes any secret/embargoed sentinel tokens from human-readable or JSON
 * audit output so embargoed manuscripts or tokens never leak into logs.
 */
export function sanitizeAuditText(
  text: string,
  markers: readonly SecretMarker[],
  extraSecrets: readonly string[] = [],
): string {
  let sanitized = text
  for (const marker of markers) {
    if (marker.token && sanitized.includes(marker.token)) {
      sanitized = sanitized.split(marker.token).join(`[REDACTED:${marker.markerId}]`)
    }
  }
  for (const secret of extraSecrets) {
    if (secret && sanitized.includes(secret)) {
      sanitized = sanitized.split(secret).join(REDACTED_PLACEHOLDER)
    }
  }
  return sanitized
}

/**
 * Scans serialized output for any forbidden secret/embargoed marker tokens and
 * returns only their symbolic markerIds, never the secret values themselves.
 */
export function findLeakedMarkerIds(
  serializedPayload: string,
  markers: readonly SecretMarker[],
): string[] {
  const leaked: string[] = []
  for (const marker of markers) {
    if (marker.token && serializedPayload.includes(marker.token)) {
      leaked.push(marker.markerId)
    }
  }
  return leaked
}
