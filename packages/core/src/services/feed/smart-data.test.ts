import { describe, expect, it, vi } from "vitest";
import type { FeedDb } from "./ports";
import { rankSmartCandidates } from "./smart-data";

function createDb() {
  const now = new Date("2026-10-10T12:00:00.000Z");
  const posts = [
    { id: "post_local", authorId: "author_local", publishedAt: new Date("2026-10-10T11:00:00.000Z") },
    { id: "post_other", authorId: "author_other", publishedAt: new Date("2026-10-10T11:00:00.000Z") },
  ];
  const findPosts = vi.fn().mockResolvedValue(posts);
  const findUsers = vi.fn().mockResolvedValue([
    { id: "author_local", profile: { city: "Москва" }, pets: [{ type: "DOG", breed: "Лабрадор" }] },
    { id: "author_other", profile: { city: "Казань" }, pets: [{ type: "CAT", breed: "Персидская" }] },
  ]);
  const db = {
    feedPost: { findMany: findPosts },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        profile: { city: "МОСКВА" }, pets: [{ type: "DOG", breed: "Лабрадор" }],
      }),
      findMany: findUsers,
    },
    $queryRaw: vi.fn().mockResolvedValue([
      { postId: "post_local", reactions: 0, uniqueCommenters: 0, bookmarks: 0 },
      { postId: "post_other", reactions: 0, uniqueCommenters: 0, bookmarks: 0 },
    ]),
    feedPostView: { findMany: vi.fn().mockResolvedValue([]) },
    feedImpression: { groupBy: vi.fn().mockResolvedValue([]) },
    feedPostReaction: { findMany: vi.fn().mockResolvedValue([]) },
    feedComment: { findMany: vi.fn().mockResolvedValue([]) },
    feedBookmark: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as FeedDb;
  return { db, now, findPosts, findUsers };
}

describe("smart feed server retrieval and privacy", () => {
  it("boosts matching city and pets without excluding other cities", async () => {
    const { db, now } = createDb();
    const ranked = await rankSmartCandidates(db, "viewer", now,
      { useCity: true, usePets: true, useBehavior: false, exploration: false });
    expect(ranked.map(post => post.id)).toEqual(["post_local", "post_other"]);
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]!.score);
    expect(ranked[0]?.reason).toBe("similar_pet");
  });
  it("requests published visible posts and only publicly shown author pets", async () => {
    const { db, now, findPosts, findUsers } = createDb();
    await rankSmartCandidates(db, "viewer", now,
      { useCity: true, usePets: true, useBehavior: true, exploration: false });
    expect(findPosts).toHaveBeenCalledWith(expect.objectContaining({
      take: 400,
      where: expect.objectContaining({
        status: "published", moderationState: "visible", deletedAt: null,
        feedback: { none: { userId: "viewer", kind: "not_interested" } },
        author: { feedSubscribers: { none: { userId: "viewer", hidden: true } } },
      }),
    }));
    expect(findUsers).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        pets: expect.objectContaining({ where: { showInProfile: true } }),
      }),
    }));
  });
  it("respects opt-outs and does not use old signals after reset", async () => {
    const { db, now } = createDb();
    await rankSmartCandidates(db, "viewer", now, {
      useCity: false, usePets: false, useBehavior: false, exploration: false,
      historyResetAt: new Date("2026-10-10T10:00:00.000Z"),
    });
    expect(db.feedPostReaction.findMany).not.toHaveBeenCalled();
    expect(db.feedPostView.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        createdAt: { gte: new Date("2026-10-10T10:00:00.000Z") },
      }),
    }));
  });
});
