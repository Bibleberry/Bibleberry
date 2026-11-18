import '../shelf/shelf.css'
import '../library/library.css'

export {
  LibraryShelfHost,
  type LibraryShelfHostProps,
} from './LibraryShelfHost.tsx'

export {
  resolveReferenceCurrentYearMonth,
  buildShelfMonthMetadataMap,
  attemptSelectLibraryMonthForShelf,
  validateAuthorizedMonthOpen,
  type LibraryShelfSurface,
  type MonthOpenOrigin,
  type OpenMonthContext,
  type LibraryToShelfSelectionResult,
} from './libraryShelfModel.ts'
