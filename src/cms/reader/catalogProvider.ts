import {
  loadPublishedChallengeCatalog,
  type CmsCatalogResult,
} from '../sanity/catalog.ts'
import type { ReadPublishedChallengesOptions } from '../sanity/readPublishedChallenges.ts'

export type { CmsCatalogResult }

/**
 * Injectable Challenge catalog provider boundary (Track A, A4.1).
 *
 * Decouples ordinary reader integration from direct fetch calls to Sanity, enabling
 * deterministic test injection, offline regression suites, and future gateway routing (R05).
 */
export interface ChallengeCatalogProvider {
  loadCatalog(options?: ReadPublishedChallengesOptions): Promise<CmsCatalogResult>
}

export const defaultPublishedCatalogProvider: ChallengeCatalogProvider = {
  loadCatalog(options) {
    return loadPublishedChallengeCatalog(options)
  },
}
