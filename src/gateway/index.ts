export { handleGatewayRequest } from './handler.ts'
export {
  DEFAULT_RELEASE_TIME_ZONE,
  YEAR_MONTH_PATTERN,
  ISO_CIVIL_DATE_PATTERN,
  parseYearMonth,
  daysInMonth,
  formatCivilDate,
  isValidCivilDate,
  computeAdvancePreviewStartDate,
  formatIsoDateInTimeZone,
  isValidIanaTimeZone,
  resolveAuthorizedReaderDate,
} from './localRelease.ts'
export {
  CATALOG_GROQ_QUERY,
  CHALLENGE_BY_SLUG_GROQ_QUERY,
  LIBRARY_MONTHS_GROQ_QUERY,
  MONTHLY_PREVIEW_BY_ID_GROQ_QUERY,
  MONTHLY_DETAIL_BY_ID_GROQ_QUERY,
  NEWS_ARTICLES_GROQ_QUERY,
  buildSanityQueryUrl,
} from './query.ts'
export {
  validateAndProjectChallenge,
  validateAndProjectCatalogSummary,
  REVIEWED_BLOCK_TYPES,
} from './projection.ts'
export {
  validateAndProjectMonthPreview,
  validateAndProjectMonthDetail,
  evaluateMonthProgress,
  validateAndProjectNewsArticle,
  validateAndProjectLibraryMonthSummary,
} from './monthlyProjection.ts'
export type {
  AuthorizedReaderDateResolution,
} from './localRelease.ts'
export type {
  GatewayEnv,
  GatewayFetch,
  GatewayOptions,
  GatewayServerContext,
  GatewayCalendarSlot,
  GatewayCatalogResponse,
  GatewayCatalogSummary,
  GatewayChallengeResponse,
  GatewayCoverImage,
  GatewayIntroductionScreen,
  GatewayMonthSlotPreview,
  GatewayMonthPreviewResponse,
  GatewayMonthSlot,
  GatewayMonthDiscoverySummary,
  GatewayMonthDetailResponse,
  GatewayMonthProgressDiscovery,
  GatewayMonthProgressResponse,
  GatewayNewsCategory,
  GatewayNewsArticle,
  GatewayNewsResponse,
  GatewayLibraryMonthSummary,
  GatewayLibraryMonthsPage,
  GatewayLibraryMonthsResponse,
  GatewayErrorResponse,
  GatewayErrorKind,
} from './types.ts'
