// Product analytics (контракт событий)
export * from "./analytics";

// Auth
export * from "./auth";

// Data (доменные модели и DTO)
export * from "./data";

// State shapes (БЕЗ методов)
export * from "./state";

// Utils
export * from "./utils";
// Runtime createLogger/silentLogger/shouldLog moved to @gafus/types/logger.
// Do not reexport their server logger implementation from this browser-safe root.
export type { Logger, LogMeta } from "./utils/logger";
export * from "./utils/validation";

// Training calculations
export * from "./training";

// Pages
export * from "./pages";

// Error Handling
export * from "./error-handling";

// Offline
export * from "./offline";

// Error Reporting
export * from "./error-reporting";

// Queues
export * from "./queues/video-transcoding";

// SWR
export * from "./swr";

// Собственные типы (заменяют зависимости от фреймворков)
export * from "./types";

export * from "./questions";

export * from "./gallery";

export * from "./feed";
export * from "./feed-telemetry-queue";
export * from "./gafus";
export * from "./data/pet-vet-visit";
export * from "./feed-v2";
export { publicCourseCoverUrl } from "./data/publicCourseCover";

export {
  parseUsernameAvailabilityData,
  parseUsernameAvailabilitySuccess,
  isValidUsernameAvailabilityQuery,
  type UsernameAvailabilityData,
  type UsernameAvailabilityQuery,
  type UsernameAvailabilitySuccess,
  type UsernameAvailabilityServiceError,
  type UsernameAvailabilityServiceResponse,
} from "./contracts/usernameAvailability";

// Subscription status is a browser-safe type contract; no server-side runtime export.
export type { AppSubscriptionPlanCode, AppSubscriptionProvider, AppSubscriptionStatusCode, YookassaTrialUnavailableReason, AppSubscriptionStatusDto } from "./contracts/appSubscriptionRead";

export type { VideoPlaybackQualityEvent, VideoPlaybackQualityReport, VideoPlaybackQualityBreakdown, VideoPlaybackSurface, VideoPlaybackPlatform, VideoPlaybackMode, VideoPlaybackNetworkClass } from "./video-playback-analytics";
