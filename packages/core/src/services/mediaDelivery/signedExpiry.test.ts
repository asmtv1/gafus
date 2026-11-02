import { describe, expect, it } from "vitest";
import { stableMediaExpiry, stablePublicFeedExpiry } from "./signedExpiry";
describe("stable signed-image expiry", () => {
  it("reuses URL expiry within slots and stays valid longer than browser cache", () => {
    const start = new Date("2026-10-14T18:02:01.000Z");
    const expiry = stableMediaExpiry(start, 300);
    expect(stableMediaExpiry(new Date(start.getTime() + 10_000), 300)).toEqual(expiry);
    expect(expiry.getTime() - start.getTime()).toBeGreaterThan(180_000);
    expect(expiry.getTime() - start.getTime()).toBeLessThanOrEqual(300_000);
    expect(stableMediaExpiry(new Date(start.getTime() + 30_000), 300)).toEqual(expiry);
  });
  it("does not allow a 120s legacy TTL or unbounded tokens", () => {
    expect(() => stableMediaExpiry(new Date(), 120)).toThrow();
    expect(() => stableMediaExpiry(new Date(), 10_000)).toThrow();
  });
});


describe("opt-in public Feed daily URL", () => {
  it("keeps one CDN URL for a UTC day, valid at least 24h", () => {
    const start = new Date("2026-11-02T00:00:01.000Z");
    const end = new Date("2026-11-02T23:59:59.000Z");
    expect(stablePublicFeedExpiry(start)).toEqual(stablePublicFeedExpiry(end));
    expect(stablePublicFeedExpiry(end).getTime()-end.getTime()).toBeGreaterThan(86_400_000);
    expect(stablePublicFeedExpiry(new Date("2026-11-03T00:00:01.000Z")))
      .not.toEqual(stablePublicFeedExpiry(start));
  });
  it("rejects invalid clock values", () => {
    expect(() => stablePublicFeedExpiry(new Date(NaN))).toThrow("INVALID_PUBLIC_FEED_NOW");
  });
});
