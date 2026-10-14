import { describe, expect, it } from "vitest";
import { stableMediaExpiry } from "./signedExpiry";
describe("stable signed-image expiry", () => {
  it("reuses URL expiry within slots and stays valid longer than browser cache", () => {
    const start = new Date("2026-10-14T18:02:01.000Z");
    const expiry = stableMediaExpiry(start, 300);
    expect(stableMediaExpiry(new Date(start.getTime() + 10_000), 300)).toEqual(expiry);
    expect(expiry.getTime() - start.getTime()).toBeGreaterThanOrEqual(270_000);
    expect(expiry.getTime() - start.getTime()).toBeLessThanOrEqual(300_000);
    expect(stableMediaExpiry(new Date(start.getTime() + 30_000), 300)).not.toEqual(expiry);
  });
  it("does not allow a 120s legacy TTL or unbounded tokens", () => {
    expect(() => stableMediaExpiry(new Date(), 120)).toThrow();
    expect(() => stableMediaExpiry(new Date(), 10_000)).toThrow();
  });
});
