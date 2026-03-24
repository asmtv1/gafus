import * as Crypto from "expo-crypto";

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

  const stackTrace =
    reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  const deviceId = `android-id-fallback-${Crypto.randomUUID()}`;
  const sessionUuid = getSessionUuid();
  const now = new Date();

  const payload: TracerPayloadItem[] = [
    {
      type: "WARNING",
      format: "JS_STACKTRACE",
      severity: "warning",
      stackTrace,
      uploadBean: {
        environment: __DEV__ ? "dev" : "prod",
        versionName: config.versionName,
        deviceId,
        sessionUuid,
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

  uploadTracerBatch(payload, config.appToken);
}
