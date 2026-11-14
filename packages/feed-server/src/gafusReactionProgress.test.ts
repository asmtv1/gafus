import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findPost: vi.fn(), findProgram: vi.fn(), countReactions: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    feedPost: { findFirst: db.findPost },
    gafusPostReactionProgram: { findUnique: db.findProgram },
    feedPostReaction: { count: db.countReactions },
  },
}));
import { getGafusPostReactionProgress } from "./gafusReactionProgress.js";

describe("Gafus reaction-progress server owner/ACL projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.findPost.mockResolvedValue({ id: "post-A" });
    db.findProgram.mockResolvedValue({ thresholdStep: 10, highWaterReactionCount: 20 });
    db.countReactions.mockResolvedValue(25);
  });
  it("checks signed actor ownership, published status and not-deleted before touching private counters", async () => {
    db.findPost.mockResolvedValue(null);
    expect(await getGafusPostReactionProgress("other-actor", "post-A")).toBe(null);
    expect(db.findPost).toHaveBeenCalledExactlyOnceWith({
      where: { id: "post-A", authorId: "other-actor", status: "published", deletedAt: null },
      select: { id: true },
    });
    expect(db.findProgram).not.toHaveBeenCalled();
    expect(db.countReactions).not.toHaveBeenCalled();
  });
  it("does not expose unconfigured reward progress to a post author", async () => {
    db.findProgram.mockResolvedValue(null);
    expect(await getGafusPostReactionProgress("actor-A", "post-A")).toBe(null);
    expect(db.countReactions).not.toHaveBeenCalled();
  });
  it("counts only other users' real reactions and preserves the high-water reward threshold", async () => {
    expect(await getGafusPostReactionProgress("actor-A", "post-A")).toEqual({
      postId: "post-A", current: 25, highWater: 20,
      nextThreshold: 30, thresholdStep: 10, progress: 0.5,
    });
    expect(db.countReactions).toHaveBeenCalledExactlyOnceWith({
      where: { postId: "post-A", userId: { not: "actor-A" } },
    });
  });
  it("clamps progress to one without allowing a stale high-water reward to influence actual counters", async () => {
    db.countReactions.mockResolvedValue(105);
    const result = await getGafusPostReactionProgress("actor-A", "post-A");
    expect(result?.progress).toBe(1);
    expect(result?.nextThreshold).toBe(30);
  });
});
