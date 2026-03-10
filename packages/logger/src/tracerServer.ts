/** Элемент payload для Tracer uploadBatch (совместим с TracerPayloadItem из mobile) */
interface TracerServerPayloadItem {
  type: "ERROR" | "FATAL" | "WARNING";
  format: "JS_STACKTRACE";
  severity: string;
  stackTrace: string;
  uploadBean: {
    environment: string;
    versionName: string;
    deviceId: string;
    sessionUuid: string;
    component?: string;
    properties: Record<string, string | number | boolean | undefined>;
  };
}

const TRACER_URL = "https://sdk-api.apptracer.ru/api/crash/uploadBatch";
const SDK_VERSION = "1.0.0";

/**
 * Отправляет серверную ошибку в Tracer. Fire-and-forget — не блокирует.
 * No-op если токен не задан или окружение не production/dev с TRACER_SERVER_ENABLED.
 */
export function reportServerError(
  error: Error,
  options: {
    appName: string;
    context?: string;
    message?: string;
    severity?: string;
  },
): void {
  const token =
    process.env.TRACER_APP_TOKEN ?? process.env.NEXT_PUBLIC_TRACER_APP_TOKEN;
  const enabled =
    !!token &&
    (process.env.NODE_ENV === "production" ||
      process.env.TRACER_SERVER_ENABLED === "true");
  if (!enabled) return;

  void (async () => {
    try {
      const severity = options.severity ?? "error";
      const payload: TracerServerPayloadItem[] = [
        {
          type: severity === "fatal" ? "FATAL" : "ERROR",
          format: "JS_STACKTRACE",
          severity,
          stackTrace: error.stack ?? error.message,
          uploadBean: {
            environment: process.env.NODE_ENV ?? "development",
            versionName:
              process.env.NEXT_PUBLIC_APP_VERSION ??
              process.env.npm_package_version ??
              "1.0.0",
            deviceId: process.env.HOSTNAME ?? "server",
            sessionUuid: "server-session",
            component: options.appName,
            properties: {
              errorEventType: "server",
              context: options.context,
              message: options.message,
              timestamp: Date.now(),
              date: new Date().toISOString(),
            },
          },
        },
      ];

      const url = `${TRACER_URL}?crashToken=${encodeURIComponent(token)}&compressType=NONE&sdkVersion=${SDK_VERSION}`;
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => undefined);
    } catch {
      // Игнорируем ошибки отправки
    }
  })();
}
