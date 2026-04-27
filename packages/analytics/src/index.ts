export {
  identifyUser,
  isAnalyticsReady,
  resetAnalyticsUser,
  trackEvent,
  trackScreenView,
} from "./client";
export {
  getOrCreateWebAnonymousId,
  initAnalyticsWeb,
  syncWebAnalyticsWithConsent,
} from "./web";
export { sanitizePath } from "./sanitize-path";
export { isCanonicalEventName } from "./validate";

export type {
  AnalyticsBaseFields,
  AnalyticsEventName,
  AnalyticsPlatform,
  AnalyticsTrackEventInput,
  AnalyticsTrackPayload,
} from "@gafus/types";
