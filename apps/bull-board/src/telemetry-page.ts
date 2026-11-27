/**
 * Bull Board serves a third-party EJS page, not a GAFUS React entrypoint.
 * Inject ONLY a static, same-origin diagnostics bootstrap with immutable
 * release metadata. The collector itself is bundled separately.
 */
export type BullTelemetryConfig = {
  enabled: true;
  appVersion: string;
  build: string;
  service: "gafus-bull-board";
};
const safeVersion = /^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$/;
const safeBuild = /^[0-9a-f]{40}$/i;

/** Optional and disabled by default. Never embed an Uptrace DSN in HTML. */
export function bullTelemetryConfig(
  env: NodeJS.ProcessEnv = process.env,
): BullTelemetryConfig | null {
  if (env.GAFUS_BULL_BOARD_TELEMETRY_ENABLED !== "true") return null;
  if (env.GAFUS_TELEMETRY_ENVIRONMENT !== "preview" &&
      env.GAFUS_TELEMETRY_ENVIRONMENT !== "production")
    throw new Error("BULL_TELEMETRY_ENVIRONMENT_REQUIRED");
  if (env.GAFUS_TELEMETRY_ENVIRONMENT === "production" &&
      env.GAFUS_TELEMETRY_PRODUCTION_APPROVED !== "true")
    throw new Error("BULL_TELEMETRY_PRODUCTION_DENIED");
  const appVersion=env.GAFUS_BULL_BOARD_APP_VERSION;
  const build=env.GAFUS_RELEASE_SHA ?? env.GITHUB_SHA;
  if (!appVersion || !safeVersion.test(appVersion) ||
      !build || !safeBuild.test(build))
    throw new Error("BULL_TELEMETRY_IMMUTABLE_RELEASE_REQUIRED");
  return {
    enabled:true,appVersion,build:build.toLowerCase(),
    service:"gafus-bull-board",
  };
}

export function injectBullTelemetry(
  html: string, config: BullTelemetryConfig | null, basePath = "/admin/queues",
): string {
  if (!config) return html;
  if (!["/admin/queues", "/api/v1/admin/queues"].includes(basePath)) throw new Error("BULL_UI_BASE_PATH_INVALID");
  if (!html.startsWith("<!DOCTYPE html>") ||
      (html.match(/<\/head>/gi) ?? []).length !== 1 ||
      html.includes("gafus-browser-diagnostics-config"))
    throw new Error("BULL_UI_INJECTION_SCHEMA_MISMATCH");
  const encoded = JSON.stringify(config).replace(/</g,"\\u003c")
    .replace(/>/g,"\\u003e").replace(/&/g,"\\u0026");
  const element =
    '<script id="gafus-browser-diagnostics-config" type="application/json">' +
    encoded +
    '</script><script defer src="' + basePath + '/gafus-diagnostics.js"></script>';
  return html.replace("</head>",element+"</head>");
}
