import type { TracerPayloadItem } from "./types";

const TRACER_URL = "https://sdk-api.apptracer.ru/api/crash/uploadBatch";
const SDK_VERSION = "2.6.5";

type TracerErrorResponse = {
  message?: string;
};

export class TracerUploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TracerUploadError";
  }
}

/**
 * Отправляет батч в Tracer и завершается только после подтверждения сервера.
 * Вынесено отдельно, чтобы не создавать цикл импортов с deviceContext.
 */
export async function uploadTracerBatch(
  payload: TracerPayloadItem[],
  appToken: string,
): Promise<void> {
  const url = `${TRACER_URL}?crashToken=${encodeURIComponent(appToken)}&compressType=NONE&sdkVersion=${SDK_VERSION}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    return;
  }

  const errorBody = (await response.json().catch(() => null)) as TracerErrorResponse | null;
  throw new TracerUploadError(
    errorBody?.message ?? `AppTracer вернул HTTP ${response.status}`,
    response.status,
  );
}
