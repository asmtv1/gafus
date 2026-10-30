/**
 * Cloud.ru S3 currently rejects browser OPTIONS requests even with a matching
 * bucket CORS policy. On GAFUS production, relay the already-signed POST form
 * through our same-origin, POST-only nginx endpoint. The S3 policy still
 * authenticates every upload and constrains its object key and size.
 *
 * Local development and Yandex storage keep their existing direct upload path.
 */
export function browserStorageUploadUrl(
  signedPostUrl: string,
  kind: "feed" | "gallery",
  pageOrigin: string | undefined = typeof window === "undefined" ? undefined : window.location.origin,
): string {
  const url = new URL(signedPostUrl);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Небезопасный адрес загрузки.");
  }
  if (url.origin !== "https://s3.cloud.ru") return url.href;

  const bucket = kind === "feed" ? "gafus-feed-private" : "gafus-gallery-private";
  if (url.pathname.replace(/\/$/, "") !== `/${bucket}` || url.search || url.hash) {
    throw new Error("Неподдерживаемый адрес хранилища.");
  }
  if (pageOrigin === "https://gafus.ru" || pageOrigin === "https://www.gafus.ru") {
    return `/__cloudru-upload/${kind}`;
  }
  return url.href;
}
