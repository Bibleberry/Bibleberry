import {ALLOWED_REVIEWER_ROLES, stripDraftPrefix} from './monthlyHelpers'

export const ALLOWED_RESOURCE_KINDS = ['externalLink', 'downloadableFile'] as const
export type AllowedResourceKind = (typeof ALLOWED_RESOURCE_KINDS)[number]

export const ALLOWED_PRESENTATION_MODES = ['inApp', 'external', 'download'] as const
export type AllowedPresentationMode = (typeof ALLOWED_PRESENTATION_MODES)[number]

export const ALLOWED_RESOURCE_EDITORIAL_STATUSES = ['draft', 'inReview', 'approved'] as const
export type AllowedResourceEditorialStatus = (typeof ALLOWED_RESOURCE_EDITORIAL_STATUSES)[number]

export type ResourceValidationIssue = {
  message: string
  path: (string | number)[]
}

export type EditorialReviewShape = {
  reviewedBy?: unknown
  reviewerRole?: unknown
  reviewedAt?: unknown
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Validates that a resource URL uses an explicit http(s) scheme with a non-empty hostname.
 * Rejects javascript:, data:, file:, ftp:, mailto:, and relative paths.
 */
export function validateSafeResourceUrl(raw: unknown): true | string {
  if (!isNonEmptyString(raw)) {
    return 'Provide a valid http or https URL.'
  }
  const trimmed = raw.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return 'Provide a valid absolute URL starting with https:// or http://.'
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return `Unsafe or unsupported link scheme "${parsed.protocol}". Only https:// and http:// URLs are permitted.`
  }
  if (!parsed.hostname) {
    return 'URL must include a valid hostname.'
  }
  return true
}

export function validateUniqueNonEmptyStringArray(value: unknown, label: string): true | string {
  if (value === undefined || value === null) return true
  if (!Array.isArray(value)) return `${label} must be a list of text entries.`
  const seen = new Set<string>()
  for (const item of value) {
    if (!isNonEmptyString(item)) {
      return `${label} cannot contain empty entries.`
    }
    const normalized = item.trim().toLowerCase()
    if (seen.has(normalized)) {
      return `${label} cannot contain duplicate entries ("${item.trim()}").`
    }
    seen.add(normalized)
  }
  return true
}

/**
 * Shared editorial review gate for resource documents and resource sections.
 * Always validates reviewerRole/reviewedAt format when provided, and requires complete
 * truthful attribution before marking editorialStatus as "approved".
 */
export function validateEditorialReviewGate(
  editorialStatus: unknown,
  editorialReview: EditorialReviewShape | undefined,
  entityLabel: string,
): ResourceValidationIssue[] {
  const issues: ResourceValidationIssue[] = []
  const role = editorialReview?.reviewerRole

  if (
    role !== undefined &&
    role !== null &&
    role !== '' &&
    (typeof role !== 'string' || !(ALLOWED_REVIEWER_ROLES as readonly string[]).includes(role))
  ) {
    issues.push({
      message: 'Reviewer role must be theological_editorial or technical_synthetic.',
      path: ['editorialReview', 'reviewerRole'],
    })
  }

  if (
    editorialReview?.reviewedAt !== undefined &&
    editorialReview?.reviewedAt !== null &&
    editorialReview?.reviewedAt !== '' &&
    (typeof editorialReview.reviewedAt !== 'string' ||
      !Number.isFinite(Date.parse(editorialReview.reviewedAt)))
  ) {
    issues.push({
      message: 'Reviewed at must be a valid ISO date-time.',
      path: ['editorialReview', 'reviewedAt'],
    })
  }

  if (editorialStatus === 'approved') {
    if (!isNonEmptyString(editorialReview?.reviewedBy)) {
      issues.push({
        message: `Record reviewedBy on editorial review before marking this ${entityLabel} approved.`,
        path: ['editorialReview', 'reviewedBy'],
      })
    }
    if (typeof role !== 'string' || !(ALLOWED_REVIEWER_ROLES as readonly string[]).includes(role)) {
      issues.push({
        message: `Select a valid reviewerRole (theological_editorial or technical_synthetic) before marking this ${entityLabel} approved.`,
        path: ['editorialReview', 'reviewerRole'],
      })
    }
    if (
      typeof editorialReview?.reviewedAt !== 'string' ||
      !Number.isFinite(Date.parse(editorialReview.reviewedAt))
    ) {
      issues.push({
        message: `Record a valid reviewedAt timestamp before marking this ${entityLabel} approved.`,
        path: ['editorialReview', 'reviewedAt'],
      })
    }
  }

  return issues
}

/**
 * Finds duplicate reference targets (comparing base IDs with drafts. stripped)
 * and any draft-prefixed references in an ordered reference array.
 */
export function inspectResourceReferences(refs: unknown): {
  uniqueBaseRefs: string[]
  duplicateIndices: {index: number; baseRef: string}[]
  draftIndices: {index: number; ref: string}[]
  invalidIndices: number[]
} {
  const uniqueBaseRefs: string[] = []
  const duplicateIndices: {index: number; baseRef: string}[] = []
  const draftIndices: {index: number; ref: string}[] = []
  const invalidIndices: number[] = []

  if (!Array.isArray(refs)) {
    return {uniqueBaseRefs, duplicateIndices, draftIndices, invalidIndices}
  }

  const seen = new Set<string>()
  for (let index = 0; index < refs.length; index += 1) {
    const item = refs[index] as {_ref?: unknown} | undefined
    const rawRef = typeof item?._ref === 'string' ? item._ref.trim() : ''
    if (!rawRef) {
      invalidIndices.push(index)
      continue
    }
    if (rawRef.startsWith('drafts.')) {
      draftIndices.push({index, ref: rawRef})
    }
    const baseRef = stripDraftPrefix(rawRef)
    if (seen.has(baseRef)) {
      duplicateIndices.push({index, baseRef})
    } else {
      seen.add(baseRef)
      uniqueBaseRefs.push(baseRef)
    }
  }

  return {uniqueBaseRefs, duplicateIndices, draftIndices, invalidIndices}
}
