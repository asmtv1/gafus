/** Chat2's production upload is an authorized POST directly to S3.
 * Never relay private media through an unauthenticated fallback or log signed form fields.
 */
export class Chat2S3UploadError extends Error {
  constructor(
    readonly status: number | null,
    readonly s3Code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "Chat2S3UploadError";
  }
}

async function rejected(response: Response): Promise<Chat2S3UploadError> {
  let code: string | null = null;
  try {
    // Only an allowlisted XML Code, never S3's raw body or signature, is safe to display.
    const xml = await response.text();
    code = xml.match(/<Code>\s*([A-Za-z][A-Za-z0-9_]{0,63})\s*<\/Code>/)?.[1] ?? null;
  } catch { /* The HTTP status still identifies the failure. */ }
  const suffix = code ? `HTTP ${response.status}, ${code}` : `HTTP ${response.status}`;
  return new Chat2S3UploadError(
    response.status, code,
    `Cloud.ru S3 отклонил файл (${suffix}). Сообщите код поддержке.`,
  );
}

const retryable = (status: number) =>
  status === 408 || status === 425 || status === 429 || status >= 500 && status <= 599;

type UploadAsset = { uri: string; name: string; mime: string };
/**
 * S3 POST is repeatable for this unique, server-reserved object key.
 * Only network/408/429/5xx errors are retried; auth and signed policy
 * failures are terminal. No new reservation and no legacy fallback.
 */
export async function postChat2FileToS3(
  url: string,
  fields: Record<string, string>,
  asset: UploadAsset,
  guard: () => boolean,
): Promise<void> {
  const deadline = Date.now() + 180_000;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!guard()) throw new Error("Сессия изменилась");
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Время загрузки файла истекло. Повторите отправку.");
    // RN FormData must be recreated for each attempt: a previous native request
    // can have already consumed its body.
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append("file", { uri: asset.uri, name: asset.name, type: asset.mime } as unknown as Blob);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remaining);
    try {
      const result = await fetch(url, {
        method: "POST", body: form, signal: controller.signal, redirect: "error",
      });
      if (result.ok) return;
      const failure = await rejected(result);
      if (!retryable(result.status) || attempt === 2) throw failure;
    // The Chat2RoomScreen catch reports this sanitized failure to Tracer.
    // Do not report raw fetch errors here: they can contain signed URLs.
    // eslint-disable-next-line @gafus/require-client-catch-tracer
    } catch (error) {
      if (error instanceof Chat2S3UploadError) throw error;
      if (controller.signal.aborted || attempt === 2) {
        throw new Error("Не удалось передать файл в Cloud.ru S3 (ошибка сети или тайм-аут). Повторите отправку.");
      }
    } finally {
      clearTimeout(timeout);
    }
    if (!guard()) throw new Error("Сессия изменилась");
    // Keep retries short enough to reuse the same 10-minute signed policy.
    await new Promise<void>((resolve) => setTimeout(resolve, attempt === 0 ? 400 : 900));
  }
}
