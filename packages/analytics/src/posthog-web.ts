import type { AnalyticsAdapter } from "./adapter";

/**
 * posthog-js загружается динамически (F5), без static import.
 * F7: capture_pageview/autocapture off, session recording off, opt-out по умолчанию до opt_in.
 */
export async function createPostHogWebAdapter(
  apiKey: string,
  host: string,
): Promise<AnalyticsAdapter> {
  const { default: posthog } = await import("posthog-js");
  posthog.init(apiKey, {
    api_host: host,
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: true,
    opt_out_capturing_by_default: true,
    persistence: "localStorage+cookie",
  });
  return {
    capture: (name, properties) => {
      posthog.capture(name, properties);
    },
    identify: (id) => {
      posthog.identify(id);
    },
    optInCapturing: () => {
      posthog.opt_in_capturing();
    },
    optOutCapturing: () => {
      posthog.opt_out_capturing();
    },
    reset: () => {
      posthog.reset();
    },
  };
}
