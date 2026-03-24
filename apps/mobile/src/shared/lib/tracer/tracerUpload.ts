import type { TracerPayloadItem } from "./types";

const TRACER_URL = "https://sdk-api.apptracer.ru/api/crash/uploadBatch";
const SDK_VERSION = "1.0.0";

/**
 * Отправка батча в Tracer (fire-and-forget).
 * Вынесено отдельно, чтобы не создавать цикл импортов с deviceContext.
 */
export function uploadTracerBatch(payload: TracerPayloadItem[], appToken: string): void {
  const url = `${TRACER_URL}?crashToken=${encodeURIComponent(appToken)}&compressType=NONE&sdkVersion=${SDK_VERSION}`;
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}
