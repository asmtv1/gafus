import * as Application from "expo-application";
import * as Device from "expo-device";

import { getDeviceId } from "./deviceContext";
import { getSessionUuid } from "./sessionUuid";
import { getTracerConfig, isTracerEnabled } from "./tracerConfig";
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

/** Отправляет ошибку и пробрасывает ошибку загрузки вызывающему коду. */
export async function reportClientErrorAndWait(
  error: unknown,
  data?: ClientErrorData,
): Promise<void> {
  if (!isTracerEnabled()) {
    throw new Error("AppTracer отключён или appToken отсутствует в сборке");
  }
  const config = getTracerConfig();
  if (!config) {
    throw new Error("Конфигурация AppTracer недоступна");
  }

  const deviceId = await getDeviceId();
  const sessionUuid = getSessionUuid();
  const severity = data?.severity ?? "error";
  const apiSeverity = SEVERITY_TO_API[severity] ?? "ERROR";
  const now = new Date();
  const stackTrace = error instanceof Error ? (error.stack ?? error.message) : String(error);
  const deviceInfo = getDeviceInfo();

  const payload: TracerPayloadItem[] = [
    {
      type: severity === "fatal" ? "CRASH" : "NON_FATAL",
      format: "JS_STACKTRACE",
      severity: apiSeverity,
      stackTrace,
      uploadBean: {
        environment: __DEV__ ? "dev" : "prod",
        versionName: config.versionName,
        versionCode: getVersionCode(),
        deviceId,
        sessionUuid,
        ...deviceInfo,
        tags: getTags(data?.keys),
        properties: {
          userId: data?.userId,
          issueKey: data?.issueKey,
          timestamp: now.getTime(),
          date: now.toISOString(),
          errorEventType: "manual",
          ...(data?.keys ?? {}),
        },
      },
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
