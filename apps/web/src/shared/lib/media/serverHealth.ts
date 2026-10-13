import { prefersServerMediaFallback, type MediaCdnKind } from
  "@gafus/core/services/mediaDelivery";

async function fetchStatus(): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetch("/api/v1/media-delivery/status", {
      method: "GET", credentials: "same-origin", cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("CDN_HEALTH_UNAVAILABLE");
    const payload: { success?: boolean; data?: unknown } = await response.json();
    if (payload.success !== true) throw new Error("CDN_HEALTH_INVALID");
    return payload.data;
  } finally { clearTimeout(timer); }
}

export function prefersCloudruMedia(kind: MediaCdnKind): Promise<boolean> {
  return prefersServerMediaFallback(kind, fetchStatus);
}
