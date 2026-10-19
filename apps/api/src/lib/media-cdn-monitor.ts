import { createHash, randomUUID } from "node:crypto";
import {
  MEDIA_DELIVERY_HEALTH_KEY,
  parseMonitoredMediaDeliveryStatus,
  type MediaDeliveryMode,
} from "@gafus/core/services/mediaDelivery";

export const MEDIA_CDN_MONITOR_INTERVAL_MS = 15_000;
const STATUS_TTL_SECONDS = 65;
const LOCK_KEY = `${MEDIA_DELIVERY_HEALTH_KEY}:lock`;
type Kind = "gallery" | "feed";
type MonitorRedis = Pick<typeof import("@gafus/queues").connection, "get" | "set">;
type Result = "healthy" | "failed" | "unknown";
export type MediaCdnHealth = {
  gallery: MediaDeliveryMode;
  feed: MediaDeliveryMode;
  updatedAt: number;
  failures: Record<Kind, number>;
  successes: Record<Kind, number>;
};
const emptyState = (now: number): MediaCdnHealth => ({
  gallery: "cdn", feed: "cdn", updatedAt: now,
  failures: { gallery: 0, feed: 0 }, successes: { gallery: 0, feed: 0 },
});
export function nextMediaCdnHealth(
  current: MediaCdnHealth, results: Record<Kind, Result>, now: number,
): MediaCdnHealth {
  const state = structuredClone(current);
  state.updatedAt = now;
  for (const kind of ["gallery", "feed"] as const) {
    if (results[kind] === "failed") {
      state.failures[kind] = Math.min(2, state.failures[kind] + 1);
      state.successes[kind] = 0;
      if (state.failures[kind] >= 2) state[kind] = "cloudru";
    } else if (results[kind] === "healthy") {
      state.successes[kind] = Math.min(2, state.successes[kind] + 1);
      state.failures[kind] = 0;
      if (state.successes[kind] >= 2) state[kind] = "cdn";
    } else {
      state.failures[kind] = 0;
      state.successes[kind] = 0;
    }
  }
  return state;
}

export function parseMonitorState(raw: string | null, now: number): MediaCdnHealth {
  const fallback = emptyState(now);
  try {
    if (!raw) return fallback;
    const record: unknown = JSON.parse(raw);
    if (!record || typeof record !== "object" || Array.isArray(record)) return fallback;
    const item = record as Partial<MediaCdnHealth>;
    const publicStatus = parseMonitoredMediaDeliveryStatus(raw, now);
    if (typeof item.updatedAt !== "number" || item.updatedAt > now + 5_000 ||
        now - item.updatedAt > 55_000) return fallback;
    const validCount = (count: unknown): number => typeof count === "number" &&
      Number.isInteger(count) && count >= 0 && count <= 2 ? count : 0;
    return {
      ...publicStatus, updatedAt: item.updatedAt,
      failures: { gallery: validCount(item.failures?.gallery), feed: validCount(item.failures?.feed) },
      successes: { gallery: validCount(item.successes?.gallery), feed: validCount(item.successes?.feed) },
    };
  } catch { return fallback; }
}

export type MonitorConfig = Record<Kind, {
  host: string; secret: string; enabled: boolean; provider?: "beget";
  publicRead?: boolean; healthObjectKey?: string;
}>;
const publicFeedHost = (base: string): string => {
  const match = /^https:\/\/([a-z0-9-]+\.begetcdn\.cloud)$/.exec(base);
  return match && match[1] !== "garaquachegasourn.begetcdn.cloud" ? match[1] : "";
};
const publicFeedHealthKey = (value: string): string =>
  /^posts\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/attachments\/[A-Za-z0-9_-]{1,128}\/(?:thumb|full|poster)\.webp$/.test(value)
    ? value : "";
export function monitorConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): MonitorConfig {
  const galleryNewCdn = env.GALLERY_CDN_REDIRECT_ENABLED === "true";
  const galleryHost = galleryNewCdn ? "dikinuneceswe.begetcdn.cloud" : "mepsuduyokabib.begetcdn.cloud";
  const feedPublic = env.FEED_BUCKET_PUBLIC === "true";
  const feedHost = feedPublic
    ? publicFeedHost(env.FEED_CDN_BASE_URL ?? "")
    : env.FEED_CDN_BASE_URL === "https://garaquachegasourn.begetcdn.cloud"
      ? "garaquachegasourn.begetcdn.cloud" : "";
  const feedHealthKey = feedPublic ? publicFeedHealthKey(env.FEED_CDN_HEALTH_OBJECT_KEY ?? "") : "";
  return {
    gallery: {
      host: env.GALLERY_CDN_BASE_URL === `https://${galleryHost}` &&
        (!env.GALLERY_CDN_PROVIDER || env.GALLERY_CDN_PROVIDER === "beget")
        ? galleryHost : "",
      provider: "beget",
      secret: (galleryNewCdn ? env.GALLERY_CDN_REDIRECT_SIGNING_SECRET : env.GALLERY_CDN_SECRET) ?? "",
      enabled: env.GALLERY_ENABLED === "true" &&
        env.GALLERY_MEDIA_FALLBACK_ENABLED === "true" &&
        env.GALLERY_S3_ENDPOINT === "https://s3.cloud.ru",
    },
    feed: {
      host: (!env.FEED_CDN_PROVIDER || env.FEED_CDN_PROVIDER === "beget") ? feedHost : "",
      provider: "beget",
      secret: feedPublic ? "" : env.FEED_CDN_SECRET ?? "",
      publicRead: feedPublic,
      healthObjectKey: feedHealthKey,
      enabled: env.FEED_ENABLED === "true" &&
        env.FEED_MEDIA_FALLBACK_ENABLED === "true" &&
        env.FEED_S3_ENDPOINT === "https://s3.cloud.ru" &&
        (!feedPublic || Boolean(feedHealthKey)),
    },
  };
}

/** Unique signed, valid final-media key guaranteed not to exist. A 404 from
 * the CDN means the origin answered; 504/5xx means the delivery path failed.
 * Reusing a fixed missing key is unsafe because edges may cache its 404.
 */
export function createSignedMonitorUrl(kind: Kind, config: MonitorConfig,
  now = Date.now(), id = randomUUID().replace(/-/g, "")): string | null {
  const { host, secret, enabled, provider, publicRead, healthObjectKey } = config[kind];
  if (kind === "feed" && publicRead) {
    const key = publicFeedHealthKey(healthObjectKey ?? "");
    return enabled && publicFeedHost(`https://${host}`) === host &&
      provider === "beget" && key ? `https://${host}/${key}` : null;
  }
  if (!enabled || !host ||
      !(kind === "gallery" ? /^[A-Za-z0-9_-]{24,128}$/ : /^[A-Za-z0-9_-]{24,32}$/).test(secret) ||
      !/^[a-f0-9]{32}$/.test(id)) return null;
  const key = kind === "gallery"
    ? `albums/__cdn_monitor__/__cdn_monitor__/photos/${id}/thumb.webp`
    : `posts/__cdn_monitor__/__cdn_monitor__/attachments/${id}/thumb.webp`;
  const path = `/${key}`;
  const expires = Math.floor(now / 1000) + 90;
  if (provider !== "beget" || (kind === "gallery"
    ? !["mepsuduyokabib.begetcdn.cloud", "dikinuneceswe.begetcdn.cloud"].includes(host)
    : host !== "garaquachegasourn.begetcdn.cloud"))
    return null;
  const md5 = createHash("md5").update(`${secret}${path}${expires}`).digest("base64url");
  return `https://${host}/md5(${md5},${expires})${path}`;
}

export async function probeMediaCdn(kind: Kind, config: MonitorConfig,
  fetcher: typeof fetch = fetch, now = Date.now()): Promise<Result> {
  const url = createSignedMonitorUrl(kind, config, now);
  if (!url) return "unknown";
  try {
    const response = await fetcher(url, {
      method: "GET", redirect: "manual", cache: "no-store",
      signal: AbortSignal.timeout(7_500),
    });
    void response.body?.cancel();
    if ((response.status >= 500 && response.status <= 599) ||
        (kind === "gallery" && response.status === 499)) return "failed";
    if (kind === "feed" && config.feed.publicRead) {
      // A nonexistent object might return 403 without ListBucket. Only a real,
      // known public fixture returning WebP is positive S3/CDN evidence.
      return response.status === 200 &&
        response.headers.get("content-type")?.toLowerCase().startsWith("image/webp")
        ? "healthy" : "unknown";
    }
    if (response.status === 404) return "healthy";
    return "unknown"; // Legacy signed probe: 403, 401, 200, redirects are inconclusive.
  } catch { return "failed"; }
}

// Redis is shared by API instances and Next.js. Leader lease prevents
// duplicate edge checks if API is horizontally scaled.
export async function sampleMediaCdnHealth(
  redis: MonitorRedis, config: MonitorConfig,
  fetcher: typeof fetch = fetch, now = Date.now(),
): Promise<MediaCdnHealth | null> {
  const leader = await redis.set(LOCK_KEY, String(now), "PX", 14_000, "NX");
  if (leader !== "OK") return null;
  const previous = parseMonitorState(await redis.get(MEDIA_DELIVERY_HEALTH_KEY), now);
  const [gallery, feed] = await Promise.all([
    probeMediaCdn("gallery", config, fetcher, now),
    probeMediaCdn("feed", config, fetcher, now),
  ]);
  const next = nextMediaCdnHealth(previous, { gallery, feed }, now);
  await redis.set(MEDIA_DELIVERY_HEALTH_KEY, JSON.stringify(next), "EX", STATUS_TTL_SECONDS);
  return next;
}

export function startMediaCdnMonitor(redis: MonitorRedis,
  env: NodeJS.ProcessEnv = process.env): () => void {
  if (env.CDN_HEALTH_MONITOR_ENABLED !== "true") return () => {};
  const config = monitorConfigFromEnv(env);
  if (!config.gallery.enabled && !config.feed.enabled) return () => {};
  let stopped = false;
  let running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try { await sampleMediaCdnHealth(redis, config); }
    catch (error) { console.warn("MEDIA_CDN_MONITOR_FAILURE", error instanceof Error ? error.name : "error"); }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(() => { void tick(); }, MEDIA_CDN_MONITOR_INTERVAL_MS);
  timer.unref();
  return () => { stopped = true; clearInterval(timer); };
}
