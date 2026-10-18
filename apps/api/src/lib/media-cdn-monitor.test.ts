import { describe, it, expect, vi } from "vitest";
import {
  nextMediaCdnHealth, parseMonitorState, probeMediaCdn, sampleMediaCdnHealth,
  createSignedMonitorUrl, monitorConfigFromEnv, type MonitorConfig,
} from "./media-cdn-monitor";
import { MEDIA_DELIVERY_HEALTH_KEY } from "@gafus/core/services/mediaDelivery";

const now = 1791920000000;
const config: MonitorConfig = {
  gallery: { host: "mepsuduyokabib.begetcdn.cloud", secret: "A".repeat(24), enabled: true, provider: "beget" },
  feed: { host: "garaquachegasourn.begetcdn.cloud", secret: "B".repeat(24), enabled: true, provider: "beget" },
};
const blank = () => parseMonitorState(null, now);

describe("server-side CDN health monitor", () => {
  it("makes unique valid signed final-media probes without exposing an origin secret", () => {
    const url = createSignedMonitorUrl("gallery", config, now, "a".repeat(32));
    expect(url).toMatch(/^https:\/\/mepsuduyokabib\.begetcdn\.cloud\/md5\([A-Za-z0-9_-]{22},\d{10}\)\/albums\/__cdn_monitor__\/__cdn_monitor__\/photos\//);
    expect(url).toContain("/md5(");
    expect(url).not.toContain("A".repeat(24));
    expect(createSignedMonitorUrl("feed", config, now, "b".repeat(32))).toContain("/thumb.webp");
    expect(createSignedMonitorUrl("feed", { ...config, feed: { ...config.feed, enabled: false } }, now)).toBeNull();
  });
  it("signs Beget monitoring paths without query tokens", () => {
    const beget = monitorConfigFromEnv({
      GALLERY_CDN_BASE_URL: "https://mepsuduyokabib.begetcdn.cloud",
      GALLERY_CDN_SECRET: "A".repeat(24), GALLERY_ENABLED: "true",
      GALLERY_S3_ENDPOINT: "https://s3.cloud.ru", GALLERY_MEDIA_FALLBACK_ENABLED: "true",
      FEED_CDN_BASE_URL: "https://garaquachegasourn.begetcdn.cloud",
      FEED_CDN_SECRET: "B".repeat(24), FEED_ENABLED: "true",
      FEED_S3_ENDPOINT: "https://s3.cloud.ru", FEED_MEDIA_FALLBACK_ENABLED: "true",
    });
    expect(createSignedMonitorUrl("gallery", beget, now, "a".repeat(32))).toMatch(
      /^https:\/\/mepsuduyokabib\.begetcdn\.cloud\/md5\([A-Za-z0-9_-]{22},\d{10}\)\/albums\//);
    expect(createSignedMonitorUrl("feed", beget, now, "b".repeat(32))).not.toContain("?md5=");
  });
  it("treats 404 for a freshly signed nonexistent object as healthy, 504/5xx as failed", async () => {
    for (const [status, result] of [[404, "healthy"], [504, "failed"], [503, "failed"],
      [403, "unknown"], [302, "unknown"], [200, "unknown"]] as const) {
      const fetcher = vi.fn(async () => new Response(null, { status }));
      expect(await probeMediaCdn("gallery", config, fetcher, now)).toBe(result);
      expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("mepsuduyokabib.begetcdn.cloud"),
        expect.objectContaining({ method: "GET", redirect: "manual" }));
    }
    expect(await probeMediaCdn("feed", config,
      async () => { throw new Error("ETIMEDOUT"); }, now)).toBe("failed");
  });
  it("checks a known public Feed WebP via unsigned Beget URL and never treats missing as healthy", async () => {
    const fixture = "posts/owner/post/attachments/media/thumb.webp";
    const publicConfig = monitorConfigFromEnv({
      FEED_CDN_BASE_URL: "https://new-feed.begetcdn.cloud",
      FEED_BUCKET_PUBLIC: "true", FEED_CDN_HEALTH_OBJECT_KEY: fixture,
      FEED_ENABLED: "true", FEED_MEDIA_FALLBACK_ENABLED: "true",
      FEED_S3_ENDPOINT: "https://s3.cloud.ru", FEED_CDN_PROVIDER: "beget",
    });
    expect(publicConfig.feed.enabled).toBe(true);
    expect(createSignedMonitorUrl("feed", publicConfig)).toBe(`https://new-feed.begetcdn.cloud/${fixture}`);
    expect(createSignedMonitorUrl("feed", publicConfig)).not.toContain("md5(");
    expect(await probeMediaCdn("feed", publicConfig,
      async () => new Response(null, { status: 200, headers: { "Content-Type": "image/webp" } })))
      .toBe("healthy");
    for (const status of [403, 404]) {
      expect(await probeMediaCdn("feed", publicConfig,
        async () => new Response(null, { status }))).toBe("unknown");
    }
    expect(await probeMediaCdn("feed", publicConfig,
      async () => new Response(null, { status: 503 }))).toBe("failed");
    expect(monitorConfigFromEnv({
      FEED_CDN_BASE_URL: "https://new-feed.begetcdn.cloud", FEED_BUCKET_PUBLIC: "true",
      FEED_ENABLED: "true", FEED_MEDIA_FALLBACK_ENABLED: "true", FEED_S3_ENDPOINT: "https://s3.cloud.ru",
    }).feed.enabled).toBe(false);
    expect(createSignedMonitorUrl("feed", { ...publicConfig, feed: {
      ...publicConfig.feed, healthObjectKey: "posts/u/p/incoming/m/source.jpg" } })).toBeNull();
  });
  it("uses two consecutive failures to bypass, two successes to recover, isolated by CDN", () => {
    const failure = { gallery: "failed", feed: "healthy" } as const;
    const first = nextMediaCdnHealth(blank(), failure, now);
    expect(first.gallery).toBe("cdn");
    const second = nextMediaCdnHealth(first, failure, now + 15_000);
    expect(second.gallery).toBe("cloudru");
    expect(second.feed).toBe("cdn");
    const recoveredOne = nextMediaCdnHealth(second, { gallery: "healthy", feed: "failed" }, now + 30_000);
    expect(recoveredOne.gallery).toBe("cloudru");
    const recoveredTwo = nextMediaCdnHealth(recoveredOne, { gallery: "healthy", feed: "failed" }, now + 45_000);
    expect(recoveredTwo.gallery).toBe("cdn");
    expect(recoveredTwo.feed).toBe("cloudru");
  });
  it("does not switch on 403 or stale Redis records", () => {
    const broken = nextMediaCdnHealth(blank(), { gallery: "failed", feed: "failed" }, now);
    expect(nextMediaCdnHealth(broken, { gallery: "unknown", feed: "unknown" }, now + 15_000).gallery).toBe("cdn");
    const down = nextMediaCdnHealth(broken, { gallery: "failed", feed: "failed" }, now + 15_000);
    expect(parseMonitorState(JSON.stringify(down), now + 71_000).gallery).toBe("cdn");
    expect(parseMonitorState(JSON.stringify(down), now + 20_000).gallery).toBe("cloudru");
  });
  it("uses Redis singleton lease; writes no media links or signed URLs", async () => {
    const set = vi.fn(async (_key: string, _value: string, ...args: unknown[]) =>
      args.includes("NX") ? "OK" : "OK");
    const get = vi.fn(async () => null);
    const redis = { get, set } as unknown as Parameters<typeof sampleMediaCdnHealth>[0];
    const fetcher = vi.fn(async () => new Response(null, { status: 504 }));
    const data = await sampleMediaCdnHealth(redis, config, fetcher, now);
    expect(data?.failures.gallery).toBe(1);
    expect(data?.failures.feed).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenCalledWith(MEDIA_DELIVERY_HEALTH_KEY, expect.any(String), "EX", 65);
    const published = set.mock.calls.find(call => call[0] === MEDIA_DELIVERY_HEALTH_KEY)?.[1];
    expect(published).not.toContain("md5=");
    expect(published).not.toContain(config.feed.secret);
  });
  it("monitor stays off until fallback and CDN resource configuration are valid", () => {
    const disabled = monitorConfigFromEnv({ CDN_HEALTH_MONITOR_ENABLED: "true",
      FEED_ENABLED: "true", FEED_MEDIA_FALLBACK_ENABLED: "false", FEED_S3_ENDPOINT: "https://s3.cloud.ru" });
    expect(disabled.feed.enabled).toBe(false);
  });
});
