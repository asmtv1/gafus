import { API_BASE_URL } from "@/constants";

export function resolveImageUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${API_BASE_URL.replace(/\/$/, "")}${url}`;
  return `https://storage.yandexcloud.net/gafus-media/${url.replace(/^\//, "")}`;
}
