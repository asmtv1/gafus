import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, openSync, writeSync, closeSync, unlinkSync } from "node:fs";
import { createFeedStorageFromEnv } from "@gafus/feed-storage";

const file = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/live-media-cdn-readonly.json";
const env = {
  NODE_ENV: "development", GAFUS_LOCAL_ISOLATED_API: "1", GAFUS_LOCAL_READONLY_CDN: "enabled",
  GAFUS_ISOLATED_NONPROD_S3: "enabled", GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000",
  GAFUS_ISOLATED_S3_FEED_BUCKET: "gafus-refactor-feed-test",
  CLOUDRU_MEDIA_JOBS_ENABLED: "false", GALLERY_MEDIA_FALLBACK_ENABLED: "false", FEED_MEDIA_FALLBACK_ENABLED: "false",
  FEED_ENABLED: "true", FEED_PROCESSOR_READY: "true",
};
let created = false;
afterEach(() => { vi.unstubAllGlobals(); if (created) { unlinkSync(file); created = false; } });

describe("readonly live feed CDN", () => {
  it("signs authorized WebP and MP4 variants without S3 writes", async () => {
    if (!existsSync(file)) {
      const fd = openSync(file, "wx", 0o600); created = true;
      try { writeSync(fd, JSON.stringify({ gallery: "A".repeat(32), feed: "B".repeat(28) })); }
      finally { closeSync(fd); }
    }
    // With an existing operator file the adapter signs without test overwrites.
    const base = `media/v2/${"c".repeat(26)}/v1`;
    const media = createFeedStorageFromEnv(env);
    const signed = await media.signCdn({ key: `${base}/poster.webp`, expiresAt: new Date(Date.now() + 100_000) });
    expect(new URL(signed).origin).toBe("https://quepraquiecebquomiel.begetcdn.cloud");
    expect(new URL(signed).pathname).toMatch(/^\/md5\([A-Za-z0-9_-]+,\d+\)\/media\//);
    const mp4 = await media.signCdn({
      key: `media/v2/${"m".repeat(26)}/v1/video/360.mp4`,
      expiresAt: new Date(Date.now() + 100_000),
    });
    expect(new URL(mp4).hostname).toBe("quepraquiecebquomiel.begetcdn.cloud");
    expect(new URL(mp4).pathname).toContain("video/360.mp4");
    await expect(media.signCdn({ key: `${base}/incoming/source.mp4`, expiresAt: new Date(Date.now() + 100_000) })).rejects.toThrow();
  });
});
