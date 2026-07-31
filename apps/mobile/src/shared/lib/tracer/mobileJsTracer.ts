import * as Application from "expo-application";
import * as Updates from "expo-updates";
import { Platform } from "react-native";

import { getTracerJsConfig } from "./tracerConfig";

const SENSITIVE_KEY = /authorization|cookie|password|passwd|secret|token|email|phone/i;
const MAX_STRING_LENGTH = 500;
const MAX_BREADCRUMBS = 75;

type Breadcrumb = {
  category: "navigation" | "ui" | "api" | "sync" | "app";
  message: string;
  level: "debug" | "info" | "warning" | "error";
  timestamp: string;
  data?: Record<string, string | number | boolean | null | undefined>;
};

let initialized = false;
let currentScreen: string | undefined;
let currentUserId: string | undefined;
let networkContext: Record<string, string | number | boolean | null | undefined> | undefined;
const breadcrumbs: Breadcrumb[] = [];

export function redactTracerText(value: string, maxLength = MAX_STRING_LENGTH): string {
  return value
    .replace(/Bearer\s+[^\s,;"']+/gi, "Bearer [REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/([?&](?:token|code|password|secret|email|phone)=)[^&#\s]+/gi, "$1[REDACTED]")
    .slice(0, maxLength);
}

export function sanitizeTracerValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[TRUNCATED]";
  if (typeof value === "string") return redactTracerText(value);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeTracerValue(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 50)
        .map(([key, item]) => [
          key,
          SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitizeTracerValue(item, depth + 1),
        ]),
    );
  }
  return String(value).slice(0, MAX_STRING_LENGTH);
}

function getReleaseInfo() {
  const nativeBuild = Application.nativeBuildVersion ?? "0";
  const updateSuffix = Updates.updateId
    ? `ota.${Updates.updateId.replace(/-/g, "").slice(0, 12)}`
    : `build.${nativeBuild}`;
  const versionName = `${getTracerJsConfig()?.appVersion ?? "unknown"}-${updateSuffix}`;

  return {
    versionName,
    versionCode: Number.parseInt(nativeBuild, 10) || 1,
  };
}

export function initializeMobileJsTracer(): boolean {
  if (initialized) return true;
  if (!getTracerJsConfig()) return false;
  Error.stackTraceLimit = 50;
  initialized = true;
  addTracerBreadcrumb("app", "tracer initialized", {
    platform: Platform.OS,
    ...getReleaseInfo(),
  });
  return true;
}

export function setTracerUser(userId: string | null | undefined): void {
  currentUserId = userId ?? undefined;
}

export function setTracerScreen(pathname: string): void {
  currentScreen = pathname;
  addTracerBreadcrumb("navigation", `screen ${pathname}`, { pathname });
}

export function setTracerNetworkContext(context: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  connectionType: string | null;
  isOffline: boolean;
}): void {
  networkContext = context;
}

export function addTracerBreadcrumb(
  category: Breadcrumb["category"],
  message: string,
  data?: Breadcrumb["data"],
  level: Breadcrumb["level"] = "info",
): void {
  if (!getTracerJsConfig()) return;
  breadcrumbs.push({
    category,
    message: redactTracerText(message),
    data: sanitizeTracerValue(data) as Breadcrumb["data"],
    level,
    timestamp: new Date().toISOString(),
  });
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.splice(0, breadcrumbs.length - MAX_BREADCRUMBS);
  }
}

export function getMobileJsTracerContext() {
  return {
    currentScreen,
    currentUserId,
    networkContext,
    breadcrumbs: [...breadcrumbs],
    ...getReleaseInfo(),
  };
}

export function getMobileJsTracerReleaseInfo() {
  return getReleaseInfo();
}
