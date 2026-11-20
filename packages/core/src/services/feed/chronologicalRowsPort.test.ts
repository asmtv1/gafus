import { describe, expect, it, vi } from "vitest";
import { createFeedService } from "../../../../feed-server/src/postRows";
import type { FeedDb } from "@gafus/media-shared/media-db-ports";
import type { FeedStoragePort } from "./ports";

describe("feed chronological read composition", () => {
  it("uses feed-server reader for production page, without constructing a Core Prisma findMany", async () => {
    const findMany = vi.fn();
    const readChronologicalRows = vi.fn().mockResolvedValue([]);
    const db = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: "viewer" }) },
      feedPost: { findMany },
    } as unknown as FeedDb;
    const service = createFeedService({
      db, storage: { enabled: true } as FeedStoragePort,
      enabled: () => true, readChronologicalRows,
    });
    const result = await service.list("viewer", {sort:"new",pageSize:7});
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(readChronologicalRows).toHaveBeenCalledExactlyOnceWith({
      actorId:"viewer", bookmarksOnly:false, cursor:null, pageSize:7,
    });
    expect(findMany).not.toHaveBeenCalled();
  });
});
