/** Self-hosted, credentials:omit browser reporter. No DSN, auth token, cookies
 * or config from URL. It sends ONLY the allowlisted schema to our Hono API. */
import { startBrowserTelemetry } from "@gafus/error-handling/browser";
try {
  const element = document.getElementById("gafus-browser-diagnostics-config");
  const config = element ? JSON.parse(element.textContent || "null") : null;
  if (config?.enabled === true && config.service === "gafus-bull-board" &&
      /^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$/.test(config.appVersion) &&
      /^[0-9a-f]{40}$/.test(config.build)) {
    startBrowserTelemetry({
      service:"gafus-bull-board",enabled:true,
      appVersion:config.appVersion,build:config.build,
    });
  }
} catch {
  // Never break an operator's queue dashboard due to telemetry.
}
