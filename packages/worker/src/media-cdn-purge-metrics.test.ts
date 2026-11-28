import { describe, expect, it } from "vitest";
import { renderMediaCdnPurgeMetrics } from "./media-cdn-purge-metrics";

describe("CDN purge operational metrics", () => {
  it("distinguishes an empty queue from unavailable database metrics", () => {
    expect(renderMediaCdnPurgeMetrics({ pending: 0, expired: 0, oldestAgeSeconds: 0 }))
      .toContain("gafus_media_cdn_purge_pending 0");
    const unavailable = renderMediaCdnPurgeMetrics(null);
    expect(unavailable).toContain("gafus_media_cdn_purge_available 0");
    expect(unavailable).not.toContain("gafus_media_cdn_purge_pending");
  });
  it("exposes bounded numerical gauges without any object identifiers", () => {
    const text = renderMediaCdnPurgeMetrics({ pending: 5, expired: 2, oldestAgeSeconds: 3601.5 });
    expect(text).toContain("gafus_media_cdn_purge_available 1");
    expect(text).toContain("gafus_media_cdn_purge_pending 5");
    expect(text).toContain("gafus_media_cdn_purge_expired_leases 2");
    expect(text).toContain("gafus_media_cdn_purge_oldest_age_seconds 3601.5");
    expect(text).not.toContain("{");
  });
});
