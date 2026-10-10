import { describe, expect, it, vi } from "vitest";
import type { FeedDb } from "./ports";
import { mergeSmartSources, retrieveSmartCandidates } from "./smart-retrieval";

const at = new Date("2026-10-10T13:00:00Z");
const row = (id: string, authorId = id) => ({
  id, authorId, publishedAt: at,
});
function setup() {
  const posts = vi.fn().mockResolvedValueOnce([row("recent"), row("shared")])
    .mockResolvedValueOnce([row("local"), row("shared")])
    .mockResolvedValueOnce([row("pet"), row("shared")])
    .mockResolvedValueOnce([row("affinity"), row("shared")]);
  const trending = vi.fn().mockResolvedValue([{ post: row("trending") }, { post: row("shared") }]);
  const db = {
    user: { findUnique: vi.fn().mockResolvedValue({
      profile: { city: " МОСКВА " }, pets: [{ type: "DOG", breed: "Лабрадор" }],
    }) },
    feedPost: { findMany: posts },
    feedPostStats: { findMany: trending },
    feedPostReaction: { findMany: vi.fn().mockResolvedValue([{ post: { authorId: "liked" } }]) },
    feedComment: { findMany: vi.fn().mockResolvedValue([{ post: { authorId: "commented" } }]) },
    feedBookmark: { findMany: vi.fn().mockResolvedValue([{ post: { authorId: "bookmarked" } }]) },
    feedPostView: { findMany: vi.fn().mockResolvedValue([{ post: { authorId: "viewed" } }]) },
    feedUserAuthorAffinity: { findMany: vi.fn().mockResolvedValue([{ authorId: "followed" }]) },
  } as unknown as FeedDb;
  return { db, posts, trending };
}

describe("multi-source smart candidate retrieval", () => {
  it("deduplicates posts and retains every contributing source", async () => {
    const { db } = setup();
    const result = await retrieveSmartCandidates(db, "viewer", at, {
      useCity: true, usePets: true, useBehavior: true,
    });
    expect(result).toHaveLength(6);
    expect(result.find(post => post.id === "shared")?.sources).toEqual([
      "recent", "local", "pet", "affinity", "trending",
    ]);
    expect(new Set(result.map(post => post.id)).size).toBe(result.length);
  });
  it("hard filters every source, public pet visibility and normalized cities", async () => {
    const { db, posts, trending } = setup();
    await retrieveSmartCandidates(db, "viewer", at, {
      useCity: true, usePets: true, useBehavior: true,
    });
    for (const query of posts.mock.calls.map(call => call[0])) {
      expect(query.where).toMatchObject({
        status: "published", deletedAt: null, moderationState: "visible",
        feedback: { none: { userId: "viewer", kind: "not_interested" } },
        author: { feedSubscribers: { none: { userId: "viewer", hidden: true } } },
      });
    }
    expect(posts.mock.calls[1]?.[0].where.author.profile).toEqual({ is: { cityKey: "москва" } });
    expect(posts.mock.calls[2]?.[0].where.author.pets.some.showInProfile).toBe(true);
    expect(trending).toHaveBeenCalledWith(expect.objectContaining({
      where: { post: expect.objectContaining({ moderationState: "visible" }) },
    }));
    expect(posts.mock.calls[3]?.[0].where.authorId.in).toEqual([
      "followed", "liked", "commented", "bookmarked", "viewed",
    ]);
  });
  it("does not fetch personalized sources when toggled off", async () => {
    const { db, posts } = setup();
    await retrieveSmartCandidates(db, "viewer", at, {
      useCity: false, usePets: false, useBehavior: false,
    });
    expect(posts).toHaveBeenCalledTimes(1);
    expect(db.feedPostReaction.findMany).not.toHaveBeenCalled();
    expect(db.feedUserAuthorAffinity.findMany).not.toHaveBeenCalled();
  });
  it("respects global candidate limit while preserving overlapping source names", () => {
    const unique = Array.from({ length: 9 }, (_, index) => row(String(index)));
    const merged = mergeSmartSources([
      { source: "recent", posts: unique },
      { source: "trending", posts: [row("0"), row("1")] },
    ], 5);
    expect(merged).toHaveLength(5);
    expect(merged[0]?.sources).toEqual(["recent", "trending"]);
  });
});
