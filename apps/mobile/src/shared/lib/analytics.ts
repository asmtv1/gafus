/**
 * Фасад product analytics (PostHog). Один entry `@gafus/analytics/mobile` (F5), без Tracer.
 * Без email/имени в событиях — при текущем наборе свойств ATT (iOS) не требуется (F9).
 */
export {
  identifyUser,
  isAnalyticsReady,
  resetAnalyticsUser,
  trackEvent,
  trackScreenView,
} from "@gafus/analytics/mobile";
