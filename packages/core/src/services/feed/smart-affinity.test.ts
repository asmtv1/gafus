import { describe, expect, it, vi } from "vitest";
import type { FeedDb } from "./ports";
import { refreshSmartAuthorAffinities } from "./smart-affinity";

describe("decayed author affinity aggregation", () => {
  it("uses a bounded SQL refresh and returns the updated pair count", async () => {
    const query = vi.fn().mockResolvedValue([{ updated: 18 }]);
    const db = { $queryRaw: query } as unknown as FeedDb;
    await expect(refreshSmartAuthorAffinities(db, 8000)).resolves.toBe(18);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("handles empty update response", async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([]) } as unknown as FeedDb;
    await expect(refreshSmartAuthorAffinities(db, 10)).resolves.toBe(0);
  });
});
