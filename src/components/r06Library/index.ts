import '../shelf/shelf.css'
import '../library/library.css'
import './r06Library.css'

export {
  R06LibraryLanding,
  type R06LibraryLandingProps,
} from './R06LibraryLanding.tsx'

export {
  isValidR06LibrarySurface,
  resolveInitialR06LibrarySurface,
  resolveActiveR06LibrarySurface,
  canTransitionR06LibrarySurface,
  countValidHistoricalShelfMonths,
  buildR06LibraryEntrances,
  buildR06LibraryLandingViewModel,
  formatR06LibrarySurfaceAnnouncement,
  type R06LibrarySurface,
  type R06LibraryEntranceId,
  type R06LibraryEntranceAction,
  type R06LibraryEntranceDescriptor,
  type R06LibraryLandingViewModel,
} from './r06LibraryModel.ts'

export type {
  LibraryShelfSurface,
  MonthOpenOrigin,
  OpenMonthContext,
} from '../libraryShelf/libraryShelfModel.ts'
export type { ShelfMonthMetadata } from '../shelf/shelfModel.ts'
export type { LibraryMonthIndexProvider } from '../../cms/reader/libraryMonthIndexProvider.ts'
