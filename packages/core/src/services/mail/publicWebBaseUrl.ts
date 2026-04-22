/** Публичный URL сайта (ссылки в письмах, логотип). */
export function getPublicWebBaseUrl(): string {
  const raw = process.env.WEB_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://gafus.ru";
  return raw.replace(/\/$/, "");
}
