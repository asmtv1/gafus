/** Browser-compatible native FormData POST for already-encoded WebP variants.
 * Never forwards credentials/cookies to S3; callers supply a strict bucket host.
 */
import type { PreparedWebpVariant } from "./prepareUploadWebp";

export interface SignedClientPhotoPost {
  url: string;
  fields: Record<string, string>;
  method: "POST";
}
export async function postClientWebp(
  form: SignedClientPhotoPost,
  photo: PreparedWebpVariant,
  allowedHosts: readonly string[],
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
) {
  const target = new URL(form.url);
  if (form.method !== "POST" || !allowedHosts.includes(target.hostname) ||
      (target.protocol !== "https:" && !(target.protocol === "http:" &&
        ["127.0.0.1", "localhost", "10.0.2.2"].includes(target.hostname))) ||
      target.username || target.password || target.hash) {
    throw new Error("Некорректный адрес загрузки фотографии");
  }
  if (photo.mime !== "image/webp" || photo.bytes < 12 || photo.bytes > 1_750_000)
    throw new Error("Недопустимый формат готовой фотографии");
  if (signal?.aborted) throw new Error("Загрузка фотографии отменена");
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    signal?.addEventListener("abort", abort, { once: true });
    xhr.open("POST", target.toString());
    xhr.timeout = 120_000;
    xhr.withCredentials = false;
    xhr.upload.onprogress = event => {
      if (event.lengthComputable && event.total)
        onProgress?.(Math.min(99, Math.round(event.loaded / event.total * 100)));
    };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300
      ? resolve() : reject(new Error("S3 отклонил фотографию"));
    xhr.onerror = () => reject(new Error("Нет соединения с S3"));
    xhr.onabort = () => reject(new Error("Загрузка фотографии отменена"));
    xhr.onloadend = () => signal?.removeEventListener("abort", abort);
    xhr.ontimeout = () => reject(new Error("Истекло время загрузки фотографии"));
    const body = new FormData();
    for (const [name, value] of Object.entries(form.fields)) body.append(name, value);
    body.append("file", { uri: photo.uri, name: "photo.webp", type: "image/webp" } as unknown as Blob);
    xhr.send(body);
  });
}
