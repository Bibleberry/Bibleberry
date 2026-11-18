/**
 * Server-controlled civil dates for R13-VERIFY1 (R08A-0 §4.2 physics bounds).
 *
 * The verifier runs without a reader time zone. It therefore evaluates slot release against the
 * UNIVERSAL HISTORICAL FLOOR (`Etc/GMT+12`, UTC-12): a slot dated on or before that civil date has
 * been released in every time zone on Earth, so no claim can unlock a Challenge or Card that is
 * still embargoed anywhere. A claim that depends on a slot released only in eastern zones is
 * simply deferred and verifies on a later pass (at most ~26 hours later).
 */

function formatUtcShiftedDate(serverNowUtc: Date, offsetHours: number): string {
  const shifted = new Date(serverNowUtc.getTime() + offsetHours * 60 * 60 * 1000)
  const y = String(shifted.getUTCFullYear()).padStart(4, '0')
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const d = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Civil date at UTC-12: every date <= this has arrived everywhere on Earth. */
export function universalReleasedThroughDate(serverNowUtc: Date): string {
  return formatUtcShiftedDate(serverNowUtc, -12)
}

/** Civil date at UTC+14: no credible date anywhere can exceed this. */
export function credibleDateCeiling(serverNowUtc: Date): string {
  return formatUtcShiftedDate(serverNowUtc, 14)
}
