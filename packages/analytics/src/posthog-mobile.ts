import type { AnalyticsAdapter } from "./adapter";

/**
 * Динамический import (F5). Без PII, без session replay (F9 — комментарий в пакете / плане).
 * ATT не требуется при отсутствии cross-app tracking (позиция GAFUS).
 */
export async function createPostHogMobileAdapter(
  apiKey: string,
  host: string,
): Promise<AnalyticsAdapter> {
  const { default: PostHog } = await import("posthog-react-native");
  const client = new PostHog(apiKey, {
    captureNativeAppLifecycleEvents: false,
    enableSessionReplay: false,
    host,
  });
  await client.ready();
  return {
    capture: (name, properties) => {
      void client.capture(name, properties as Record<string, string | number | boolean>);
    },
    identify: (id) => {
      client.identify(id);
    },
    reset: () => {
      client.reset();
    },
  };
}
