import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { readSmartFeedPostStats } from "./smartStats.js";

const enabled = process.env.GAFUS_SMART_FEED_REAL_PG === "enabled" &&
  process.env.DATABASE_URL?.includes("127.0.0.1:") &&
  process.env.DATABASE_URL?.includes("gafus_smart_stats_qa");

describe.skipIf(!enabled)("actual isolated PostgreSQL Smart Feed SQL", () => {
  const ids = { author: "smart_auth_a", other: "smart_auth_b", post: "smart_post_a" };
  let at: Date;
  beforeAll(async () => {
    const user = (id: string) => ({ id, username: id, password: "local-only" });
    await prisma.user.createMany({ data: [user(ids.author), user(ids.other)] });
    at = new Date();
    await prisma.feedPost.create({ data: {
      id: ids.post, authorId: ids.author, clientRequestId: "smart-qa-request",
      status: "published", publishedAt: at,
    } });
    await prisma.feedPostReaction.createMany({ data: [
      { postId: ids.post, userId: ids.author, kind: "heart" },
      { postId: ids.post, userId: ids.other, kind: "heart" },
    ] });
    await prisma.feedComment.createMany({ data: [
      { postId: ids.post, authorId: ids.author, text: "self", clientRequestId: "comment-self" },
      { postId: ids.post, authorId: ids.other, text: "other", clientRequestId: "comment-other" },
    ] });
    await prisma.feedBookmark.createMany({ data: [
      { postId: ids.post, userId: ids.author },
      { postId: ids.post, userId: ids.other },
    ] });
    await prisma.feedPostStats.create({ data: {
      postId: ids.post, reactionCount: 15, uniqueCommenterCount: 5,
      bookmarkCount: 3, qualifiedImpressionCount: 7,
    } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("prefers a fresh aggregate snapshot with the original five measures", async () => {
    const rows = await readSmartFeedPostStats([ids.post], at);
    expect(rows).toEqual([{
      postId: ids.post, reactions: 15, uniqueCommenters: 5,
      bookmarks: 3, impressions: 7,
    }]);
  });

  it("stale aggregates fall back to counts excluding the author and deleted or hidden comments", async () => {
    await prisma.$executeRaw`UPDATE "FeedPostStats" SET "updatedAt" = ${new Date(at.getTime() - 20 * 60_000)} WHERE "postId" = ${ids.post}`;
    const rows = await readSmartFeedPostStats([ids.post], at);
    expect(rows).toEqual([{
      postId: ids.post, reactions: 1, uniqueCommenters: 1, bookmarks: 1, impressions: 0,
    }]);
    await prisma.feedComment.updateMany({ where: { authorId: ids.other, postId: ids.post }, data: { moderationState: "hidden" } });
    const hidden = await readSmartFeedPostStats([ids.post], at);
    expect(hidden[0]?.uniqueCommenters).toBe(0);
  });

  it("quoted candidate input stays a bound parameter and cannot expand the read set", async () => {
    const hostile = `x'); DROP TABLE "FeedPost";--`;
    const rows = await readSmartFeedPostStats([ids.post, hostile], at);
    expect(rows.map(row => row.postId)).toEqual([ids.post]);
    expect(await prisma.feedPost.count()).toBe(1);
  });
});
