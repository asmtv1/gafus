import { describe, expect, it, vi } from "vitest";
import { createAdminAnalyticsQueries } from "./read-admin-analytics.js";

describe("admin analytics ports", () => {
  it("keeps reengagement/ads reads explicitly isolated from the application", async () => {
    const reengagement = vi.fn().mockResolvedValue({ success: true, data: { total: 4 } });
    const rewarded = vi.fn().mockResolvedValue({ period: { sessions: 12 } });
    const queries = createAdminAnalyticsQueries({ reengagement, rewarded });
    expect(await queries.reengagement()).toEqual({ success: true, data: { total: 4 } });
    expect(await queries.rewarded({ days: 7 })).toEqual({ period: { sessions: 12 } });
    expect(reengagement).toHaveBeenCalledTimes(1);
    expect(rewarded).toHaveBeenCalledWith({ days: 7 });
  });
  it("does not swallow infrastructure rejection, leaving route to mask it", async () => {
    const queries = createAdminAnalyticsQueries({
      reengagement: vi.fn().mockRejectedValue(Error("storage-private")),
      rewarded: vi.fn().mockRejectedValue(Error("storage-private")),
    });
    await expect(queries.reengagement()).rejects.toThrow("storage-private");
    await expect(queries.rewarded({ days: 30 })).rejects.toThrow("storage-private");
  });
});
