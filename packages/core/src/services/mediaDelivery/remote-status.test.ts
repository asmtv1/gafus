import { describe, it, expect, vi } from "vitest";
import { parseMediaDeliveryStatus, parseMonitoredMediaDeliveryStatus } from "./remote-status";

describe("Redis health contract for media delivery", () => {
  it("accepts only explicit modes and fresh server state", () => {
    const stamp = 1791920000000;
    const record = JSON.stringify({ gallery: "cloudru", feed: "cdn", updatedAt: stamp });
    expect(parseMonitoredMediaDeliveryStatus(record, stamp + 15_000)).toEqual({ gallery: "cloudru", feed: "cdn" });
    expect(parseMonitoredMediaDeliveryStatus(record, stamp + 56_000)).toEqual({ gallery: "cdn", feed: "cdn" });
    expect(parseMonitoredMediaDeliveryStatus("invalid", stamp)).toEqual({ gallery: "cdn", feed: "cdn" });
    expect(parseMediaDeliveryStatus({ gallery: "cloudru", feed: "unknown" })).toBeNull();
  });
  it("deduplicates concurrent client reads and keeps server mode for 15 seconds", async () => {
    vi.resetModules();
    const { prefersServerMediaFallback } = await import("./remote-status");
    const fetcher = vi.fn(async () => ({ gallery: "cloudru", feed: "cdn" }));
    const result = await Promise.all([
      prefersServerMediaFallback("gallery", fetcher),
      prefersServerMediaFallback("feed", fetcher),
    ]);
    expect(result).toEqual([true, false]);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(await prefersServerMediaFallback("gallery", fetcher)).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("never enters storage bypass when status fetch fails", async () => {
    vi.resetModules();
    const { prefersServerMediaFallback } = await import("./remote-status");
    expect(await prefersServerMediaFallback("feed", async () => { throw new Error("offline"); })).toBe(false);
  });
});
