import { getDeviceId } from "./deviceContext";
import { getSessionUuid } from "./sessionUuid";
import { getTracerConfig, isTracerEnabled } from "./tracerConfig";
import type { ClientErrorData, TracerPayloadItem } from "./types";
import { uploadTracerBatch } from "./tracerUpload";

/** Маппинг severity в type для Tracer */
const SEVERITY_TO_TYPE: Record<string, TracerPayloadItem["type"]> = {
  fatal: "FATAL",
  error: "ERROR",
  warning: "WARNING",
  notice: "NOTICE",
  debug: "DEBUG",
};

/**
 * Отправляет ошибку в Tracer. Fire-and-forget — не блокирует UI.
 * No-op если Tracer отключён.
 */
export function reportClientError(error: unknown, data?: ClientErrorData): void {
  if (!isTracerEnabled()) return;
  const config = getTracerConfig();
  if (!config) return;

  void (async () => {
    try {
      const deviceId = await getDeviceId();
      const sessionUuid = getSessionUuid();
      const severity = data?.severity ?? "error";
      const type = SEVERITY_TO_TYPE[severity] ?? "ERROR";
      const now = new Date();
      const stackTrace =
        error instanceof Error ? error.stack ?? error.message : String(error);

      const payload: TracerPayloadItem[] = [
        {
          type,
          format: "JS_STACKTRACE",
          severity,
          stackTrace,
          uploadBean: {
            environment: __DEV__ ? "dev" : "prod",
            versionName: config.versionName,
            deviceId,
            sessionUuid,
            properties: {
              userId: data?.userId,
              issueKey: data?.issueKey,
              timestamp: now.getTime(),
              date: now.toISOString(),
              errorEventType: "client",
              ...(data?.keys ?? {}),
            },
          },
        },
      ];

      uploadTracerBatch(payload, config.appToken);
    } catch {
      // Игнорируем ошибки отправки — не блокируем приложение
    }
  })();
}
