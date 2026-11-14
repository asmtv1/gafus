import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ raw: vi.fn() }));
vi.mock("@gafus/prisma", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@gafus/prisma")>()),
  prisma: { $queryRaw: mock.raw },
}));

import { readSmartFeedPostStats } from "./smartStats.js";

describe("Smart Feed infrastructure-only SQL projection", () => {
  const at = new Date("2026-11-10T10:00:00.000Z");
  beforeEach(() => {
    mock.raw.mockReset();
    mock.raw.mockResolvedValue([]);
  });

  it("never sends an empty or overlarge candidate set to the database", async () => {
    await expect(readSmartFeedPostStats([], at)).resolves.toEqual([]);
    await expect(readSmartFeedPostStats(Array.from({ length: 401 }, (_, i) => `post${i}`), at))
      .rejects.toThrow("SMART_FEED_POST_BATCH_EXCEEDED");
    expect(mock.raw).not.toHaveBeenCalled();
  });

  it("binds all post IDs as parameters, including hostile input, instead of interpolating SQL", async () => {
    const hostile = `x'); DROP TABLE "FeedPost";--`;
    const postIds = ["p1", hostile];
    await readSmartFeedPostStats(postIds, at);
    expect(mock.raw).toHaveBeenCalledTimes(1);
    const statement = mock.raw.mock.calls[0]?.[0] as { sql: string; values: unknown[] };
    expect(statement.sql).toContain('FROM "FeedPost" p');
    expect(statement.sql).toContain('s."updatedAt" >=');
    expect(statement.sql).toContain('r."userId" <> post."authorId"');
    expect(statement.sql).toContain('c."deletedAt" IS NULL');
    expect(statement.sql).toContain("c.\"moderationState\" = 'visible'");
    expect(statement.sql).not.toContain(hostile);
    expect(statement.values.filter(value => value === hostile)).toHaveLength(5);
    expect(statement.values.filter(value => value === "p1")).toHaveLength(5);
    expect(statement.values).toContainEqual(new Date(at.getTime() - 5 * 60_000));
    expect(postIds).toEqual(["p1", hostile]);
  });

  it("returns only the database projection and propagates faults for chronological fallback", async () => {
    const rows = [{ postId: "p1", reactions: 1, uniqueCommenters: 2, bookmarks: 3, impressions: 4 }];
    mock.raw.mockResolvedValueOnce(rows);
    await expect(readSmartFeedPostStats(["p1"], at)).resolves.toEqual(rows);
    mock.raw.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(readSmartFeedPostStats(["p1"], at)).rejects.toThrow("storage unavailable");
  });
});
