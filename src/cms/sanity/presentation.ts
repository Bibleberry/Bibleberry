import type { CmsScripture } from './types.ts'

export const CMS_EDITORIAL_TIME_ZONE = 'America/New_York'

export function formatCmsReleaseDate(releaseAtUtc: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    timeZone: CMS_EDITORIAL_TIME_ZONE,
  }).format(new Date(releaseAtUtc))
}

export type CmsScripturePresentation =
  | { status: 'provided'; passage: string }
  | { status: 'referenceOnly' }

export function presentCmsScripture(scripture: CmsScripture): CmsScripturePresentation {
  return scripture.textStatus === 'provided' && scripture.usageRightsConfirmed && scripture.passage
    ? { status: 'provided', passage: scripture.passage }
    : { status: 'referenceOnly' }
}
