import type { AnalyticsAdapter } from "./adapter";

/**
 * React Native adapter для Яндекс AppMetrica.
 * Инициализация/импорт только на mobile entry (ленивый require).
 */
export async function createAppMetricaMobileAdapter(apiKey: string): Promise<AnalyticsAdapter> {
  // Expo SDK 55 Metro development builds may evaluate a JS `import()` chunk
  // before HMRClient.setup, making AppMetrica unavailable despite its native
  // module being installed. A lazy synchronous require uses Metro's registered
  // bundle while remaining catchable in Expo Go (without the native module).
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- RN Metro lazy native import
  const { default: AppMetrica } = require("@appmetrica/react-native-analytics") as
    typeof import("@appmetrica/react-native-analytics");

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
