import type { Context } from "hono";

import type { ClientAppContext } from "@gafus/core/services/appFeatureFlags";

const SEMANTIC_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export function getClientAppContext(c: Context): ClientAppContext {
  const platformHeader = c.req.header("x-client-platform")?.trim().toLowerCase();
  const platform =
    platformHeader === "ios" || platformHeader === "android" ? platformHeader : "unknown";
  const versionHeader = c.req.header("x-client-version")?.trim() ?? "";
  const version = SEMANTIC_VERSION_PATTERN.test(versionHeader) ? versionHeader : null;
  return { platform, version };
}
