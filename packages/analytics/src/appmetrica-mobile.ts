import type { AnalyticsAdapter } from "./adapter";

/**
 * React Native adapter для Яндекс AppMetrica.
 * Инициализация/импорт только на mobile entry (динамический import).
 */
export async function createAppMetricaMobileAdapter(apiKey: string): Promise<AnalyticsAdapter> {
  const { default: AppMetrica } = await import("@appmetrica/react-native-analytics");

  AppMetrica.activate({
    apiKey,
  });

  return {
    capture: (eventName, properties) => {
      void AppMetrica.reportEvent(eventName, properties as Record<string, unknown>);
    },
    identify: (userId) => {
      AppMetrica.setUserProfileID(userId);
    },
    reset: () => {
      AppMetrica.setUserProfileID();
    },
  };
}
