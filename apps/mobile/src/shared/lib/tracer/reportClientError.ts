import * as Application from "expo-application";
import * as Device from "expo-device";
import * as Updates from "expo-updates";
import { Platform } from "react-native";

import { getDeviceId } from "./deviceContext";
import { getMobileJsTracerContext, redactTracerText, sanitizeTracerValue } from "./mobileJsTracer";
import { getSessionUuid } from "./sessionUuid";
import { getTracerJsConfig } from "./tracerConfig";
import type { ClientErrorData, TracerPayloadItem } from "./types";
import { uploadTracerBatch } from "./tracerUpload";

const SEVERITY_TO_API: Record<string, TracerPayloadItem["severity"]> = {
  fatal: "FATAL",
  error: "ERROR",
  warning: "WARNING",
  notice: "NOTICE",
  debug: "DEBUG",
};

function getVersionCode(): number {
  const nativeBuildVersion = Number(Application.nativeBuildVersion);
  return Number.isSafeInteger(nativeBuildVersion) && nativeBuildVersion > 0
    ? nativeBuildVersion
    : 1;
}

function getDeviceInfo() {
  return {
    osVersion: [Device.osName, Device.osVersion].filter(Boolean).join(" ") || "unknown",
    vendor: Device.manufacturer ?? Device.brand ?? "unknown",
    device: Device.modelName ?? Device.deviceName ?? "unknown",
    packageName: Application.applicationId ?? "ru.gafus.app",
  };
}

function getTags(keys: ClientErrorData["keys"]): string[] | undefined {
  if (!keys) return undefined;
  const tags = Object.entries(keys).map(([key, value]) => `${key}=${String(value)}`);
  return tags.length > 0 ? tags : undefined;
}

function encodeBase64(value: string, maxBytes = 64_000): string {
  const bytes = new TextEncoder().encode(value).slice(0, maxBytes);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const group = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    encoded += alphabet[(group >> 18) & 63];
    encoded += alphabet[(group >> 12) & 63];
    encoded += second === undefined ? "=" : alphabet[(group >> 6) & 63];
    encoded += third === undefined ? "=" : alphabet[group & 63];
  }
  return encoded;
}

/** Отправляет ошибку и пробрасывает ошибку загрузки вызывающему коду. */
export async function reportClientErrorAndWait(
  error: unknown,
  data?: ClientErrorData,
): Promise<void> {
  const config = getTracerJsConfig();
  if (!config) {
    throw new Error("AppTracer JS отключён или appToken JS-проекта отсутствует в сборке");
  }

  const deviceId = await getDeviceId();
  const sessionUuid = getSessionUuid();
  const severity = data?.severity ?? "error";
  const apiSeverity = SEVERITY_TO_API[severity] ?? "ERROR";
  const now = new Date();
  const rawStackTrace =
    error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error);
  const stackTrace = redactTracerText(rawStackTrace, 64_000);
  const deviceInfo = getDeviceInfo();
  const tracerContext = getMobileJsTracerContext();
  const safeKeys = sanitizeTracerValue(data?.keys ?? {}) as Record<
    string,
    string | number | boolean
  >;
  const logsFile = encodeBase64(
    JSON.stringify({
      breadcrumbs: tracerContext.breadcrumbs,
      network: tracerContext.networkContext,
    }),
  );

  const payload: TracerPayloadItem[] = [
    {
      type: severity === "fatal" ? "CRASH" : "NON_FATAL",
      format: "JS_STACKTRACE",
      severity: apiSeverity,
      stackTrace,
      uploadBean: {
        environment: config.environment,
        versionName: tracerContext.versionName,
        versionCode: tracerContext.versionCode || getVersionCode(),
        deviceId,
        sessionUuid,
        ...deviceInfo,
        component: "mobile-js",
        tags: getTags(safeKeys),
        properties: {
          tracerSdkVersion: "2.6.5-rn",
          userId: data?.userId ?? tracerContext.currentUserId,
          issueKey: data?.issueKey,
          timestamp: now.getTime(),
          date: now.toISOString(),
          errorEventType: "manual",
          platform: Platform.OS,
          screen: tracerContext.currentScreen,
          nativeBuild: Application.nativeBuildVersion ?? "unknown",
          updateId: Updates.updateId ?? "embedded",
          channel: Updates.channel ?? "none",
          runtimeVersion: Updates.runtimeVersion ?? "unknown",
          ...safeKeys,
        },
      },
      logsFile,
    },
  ];

  await uploadTracerBatch(payload, config.appToken);
}

/**
 * Отправляет ошибку в Tracer. Fire-and-forget — не блокирует UI.
 * No-op если Tracer отключён.
 */
export function reportClientError(error: unknown, data?: ClientErrorData): void {
  void reportClientErrorAndWait(error, data).catch(() => undefined);
}
