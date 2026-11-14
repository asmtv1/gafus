import { describe, it, expect, vi } from "vitest";
import { createFeedService } from "./service";
import type { FeedDb, FeedStoragePort } from "./ports";

function fixture(
  readRankedFeedRows?: Parameters<typeof createFeedService>[0]["readRankedFeedRows"],
) {
  const db = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: "viewer" }) },
    feedPost: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as FeedDb;
  const service = createFeedService({
    db,
    storage: { enabled: true } as FeedStoragePort,
    enabled: () => true,
    readRankedFeedRows,
  });
  return { service, db };
}
describe("feed Core ranked keyset SQL port", () => {
  it("fails closed on popular/discussed when the SQL adapter was not composed", async () => {
    const { service } = fixture();
    for (const sort of ["popular", "discussed"] as const) {
      await expect(service.list("viewer", { sort, pageSize: 5 })).rejects.toMatchObject({
        code: "FEED_RANKED_READ_UNAVAILABLE",
        status: 503,
      });
    }
  });
  it("forwards requester, sort, cursor and pageSize unchanged to injected ranking", async () => {
    const rank = vi.fn().mockResolvedValue([]);
    const { service, db } = fixture(rank);
    const result = await service.list("viewer", { sort: "discussed", pageSize: 5 });
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(rank).toHaveBeenCalledExactlyOnceWith(db, "viewer", "discussed", null, 5);
  });
});
