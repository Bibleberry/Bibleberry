import { mapPublishedChallengeBatch, type ChallengeMappingFailure } from './mapChallenge.ts'
import {
  readPublishedChallenges,
  type ReadPublishedChallengesOptions,
} from './readPublishedChallenges.ts'
import type { CmsChallenge } from './types.ts'

export type CmsCatalogResult =
  | { status: 'ready'; challenges: CmsChallenge[] }
  | { status: 'empty' }
  | { status: 'requestError'; message: string }
  | { status: 'validationError'; failures: ChallengeMappingFailure[] }

/** Combine the B1 boundaries without hiding transport failures or returning partial invalid catalogs. */
export async function loadPublishedChallengeCatalog(
  options: ReadPublishedChallengesOptions = {},
): Promise<CmsCatalogResult> {
  const response = await readPublishedChallenges(options)
  if (!response.ok) return { status: 'requestError', message: response.error.message }

  const mapped = mapPublishedChallengeBatch(response.documents)
  if (!mapped.ok) return { status: 'validationError', failures: mapped.failures }
  if (mapped.challenges.length === 0) return { status: 'empty' }
  return { status: 'ready', challenges: mapped.challenges }
}
