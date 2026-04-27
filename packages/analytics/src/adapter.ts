/**
 * Абстракция вендора: без импортов posthog в сигнатурах публичного API.
 */
export interface AnalyticsAdapter {
  capture(eventName: string, properties: Record<string, unknown>): void;
  identify(userId: string): void;
  reset(): void;
  optInCapturing?(): void;
  optOutCapturing?(): void;
}
