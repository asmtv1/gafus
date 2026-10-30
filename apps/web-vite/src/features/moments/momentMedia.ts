import { FEED_LIMITS } from "@gafus/types";
import { isolatedNonprodBrowserS3Url } from "../../shared/api/client";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
export type MomentMedia = {
  id: string; kind: "photo" | "video"; url?: string; status?: string;
  smallUrl?: string; mediumUrl?: string; fullUrl?: string;
  mp4Urls?: { 360: string; 720?: string; 1080?: string };
  width?: number; height?: number;
};

function record(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? v as Record<string, unknown> : null;
}
function validSignedUrl(value: unknown): string {
  if (typeof value !== "string" || !value.length || value.length > 4096) {
    throw new Error("Медиа недоступно");
  }
  // Absolute HTTPS CDN links can be validated in a server-side projector or
  // Node test without a browser global. Relative links are allowed only when
  // a real browser origin is available for the same-origin check.
  const browserOrigin = typeof window === "undefined" ? undefined : window.location.origin;
  let uri: URL;
  try { uri = new URL(value, browserOrigin); } catch {
    throw new Error("Недопустимый адрес медиа");
  }
  // Content URLs may be CDN HTTPS or a same-origin relative delivery path.
  if (uri.protocol !== "https:" &&
      !(browserOrigin && uri.protocol === "http:" && uri.origin === browserOrigin) &&
      !isolatedNonprodBrowserS3Url(value, "feed", "signed-get")) {
    throw new Error("Недопустимый адрес медиа");
  }
  return uri.toString();
}

/** A published post already includes signed links; never fetch media per card. */
export function momentMediaFromAttachments(attachments: unknown[]): MomentMedia[] {
  const items: MomentMedia[] = [];
  const seenIds = new Set<string>();
  for (const unknown of attachments) {
    const asset = record(unknown);
    // Ignore legitimate non-ready/transcoding attachments. A malformed READY
    // attachment must fail closed rather than silently hiding the server error.
    if (!asset || asset.status !== "ready") continue;
    if (typeof asset.id !== "string" || !ID.test(asset.id) ||
        !(asset.kind === "photo" || asset.kind === "video")) {
      throw new Error("Сервер вернул некорректное вложение");
    }
    if (seenIds.has(asset.id)) throw new Error("Медиа недоступно");
    seenIds.add(asset.id);
    const safe = (value: unknown): string | undefined =>
      typeof value === "string" && value ? validSignedUrl(value) : undefined;
    const mp4 = record(asset.mp4Urls);
    const mp4Small = safe(mp4?.["360"]);
    if (asset.kind === "video" && !mp4Small) continue;
    const small = safe(asset.smallUrl), medium = safe(asset.thumbUrl);
    const full = safe(asset.fullUrl), poster = safe(asset.posterUrl);
    if (asset.kind === "photo" && !medium && !full && !small) continue;
    const url = asset.kind === "video" ? poster ?? "" : medium ?? small ?? full ?? "";
    items.push({ id: asset.id, kind: asset.kind, url,
      smallUrl: small, mediumUrl: medium, fullUrl: full,
      mp4Urls: mp4Small ? { 360: mp4Small,
        ...(safe(mp4?.["720"]) ? { 720: safe(mp4?.["720"]) } : {}),
        ...(safe(mp4?.["1080"]) ? { 1080: safe(mp4?.["1080"]) } : {}) } : undefined,
      width: typeof asset.width === "number" ? asset.width : undefined,
      height: typeof asset.height === "number" ? asset.height : undefined,
    });
  }
  return items;
}

/** Signed links are transient React component state, never React Query cache. */
export async function loadMomentMedia(postId: string, signal?: AbortSignal):
  Promise<MomentMedia[]> {
  if (!ID.test(postId)) throw new Error("Некорректная публикация");
  const response = await fetch(`/api/v1/feed/posts/${postId}`, {
    method: "GET", credentials: "include", cache: "no-store",
    headers: { Accept: "application/json" }, signal,
  });
  let raw: unknown;
  try { raw = await response.json(); } catch {
    throw new Error("Медиа недоступно");
  }
  const env = record(raw);
  if (!response.ok || !env || env.success !== true) {
    throw new Error("Медиа недоступно");
  }
  const data = record(env.data);
  if (!data || data.id !== postId || data.status !== "published" ||
      !Array.isArray(data.attachments) ||
      data.attachments.length > FEED_LIMITS.maxAttachments) {
    throw new Error("Медиа недоступно");
  }
  return momentMediaFromAttachments(data.attachments);
}
