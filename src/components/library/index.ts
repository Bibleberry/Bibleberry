import './library.css'

export {
  HistoricalLibraryHost,
  type HistoricalLibraryHostProps,
} from './HistoricalLibraryHost.tsx'

export {
  HistoricalLibraryView,
  type HistoricalLibraryViewProps,
} from './HistoricalLibraryView.tsx'

export {
  HistoricalLibraryCard,
  type HistoricalLibraryCardProps,
} from './HistoricalLibraryCard.tsx'

export {
  YEAR_MONTH_PATTERN,
  initialHistoricalLibraryState,
  historicalLibraryReducer,
  isValidYearMonth,
  formatPublicationMonthHeading,
  deduplicateAndSortMonths,
  getLibraryMonthShelfStatus,
  type LibraryMonthShelfStatus,
  type HistoricalLibraryStatus,
  type HistoricalLibraryState,
  type HistoricalLibraryAction,
} from './historicalLibraryModel.ts'
