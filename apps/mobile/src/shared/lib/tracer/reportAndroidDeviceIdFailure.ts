import * as Crypto from "expo-crypto";
import * as Application from "expo-application";
import * as Device from "expo-device";

import { getSessionUuid } from "./sessionUuid";
import { getTracerConfig, isTracerEnabled } from "./tracerConfig";
import type { TracerPayloadItem } from "./types";
import { uploadTracerBatch } from "./tracerUpload";

/**
 * Репорт в Tracer при недоступности Android ID (без вызова getDeviceId — избегаем рекурсии).
 */
export function reportAndroidDeviceIdFailure(reason: unknown): void {
  if (!isTracerEnabled()) {
    return;
  }
  const config = getTracerConfig();
  if (!config) {
    return;
  }

  const stackTrace = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  const deviceId = `android-id-fallback-${Crypto.randomUUID()}`;
  const sessionUuid = getSessionUuid();
  const now = new Date();

  const payload: TracerPayloadItem[] = [
    {
      type: "NON_FATAL",
      format: "JS_STACKTRACE",
      severity: "WARNING",
      stackTrace,
      uploadBean: {
        environment: __DEV__ ? "dev" : "prod",
        versionName: config.versionName,
        versionCode: Number(Application.nativeBuildVersion) || 1,
        deviceId,
        sessionUuid,
        osVersion: [Device.osName, Device.osVersion].filter(Boolean).join(" ") || "unknown",
        vendor: Device.manufacturer ?? Device.brand ?? "unknown",
        device: Device.modelName ?? Device.deviceName ?? "unknown",
        packageName: Application.applicationId ?? "ru.gafus.app",
        properties: {
          issueKey: "MobileDeviceId",
          operation: "get_android_id_failed",
          timestamp: now.getTime(),
          date: now.toISOString(),
          errorEventType: "client",
        },
      },
    },
  ];

  void uploadTracerBatch(payload, config.appToken).catch(() => undefined);
}
