import { describe, expect, it, vi } from "vitest";
import type { FeedDb } from "./ports";
import { createFeedSocial } from "./social";

const REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000";
const now = new Date("2026-10-29T12:00:00Z");

function createHarness(allowMedia = true) {
  const asset = {
    id: "comment-photo", kind: "photo" as const, status: "ready" as const,
    width: 720, height: 600, durationSeconds: null, posterKey: null,
    mp4Keys: [],
    smallKey: "media/v2/comment-photo/v1/image/s.webp",
    thumbKey: "media/v2/comment-photo/v1/image/m.webp",
    fullKey: "media/v2/comment-photo/v1/image/l.webp",
  };
  let saved: Record<string, unknown> | null = null;
  let links: { commentId: string; mediaId: string; position: number }[] = [];
  const mediaFind = vi.fn(async () => allowMedia ? [{ id: asset.id, kind: asset.kind }] : []);
  const mediaCreate = vi.fn(async ({ data }: { data: typeof links }) => { links = data; });
  const commentCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    saved = {
      ...data, author: { id: "reader", username: "reader",
        profile: { fullName: "Reader", avatarUrl: null } },
      deletedAt: null, moderationState: "visible", editedAt: null,
      createdAt: now, replyToId: null, rootId: null,
    };
  });
  const comment = {
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      where.authorId_clientRequestId ? saved : saved),
    create: commentCreate,
    findMany: vi.fn(async () => []),
    groupBy: vi.fn(async () => []),
  };
  const post = { id: "published-post", authorId: "post-owner", deletedAt: null,
    moderationState: "visible", status: "published" };
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: "upload-id" }]),
    user: { findUnique: vi.fn(async ({ select }: { select: Record<string, boolean> }) =>
      select.feedPublishingBlocked ? { feedPublishingBlocked: false } : { id: "reader" }) },
    feedPost: { findFirst: vi.fn(async () => post), findUnique: vi.fn(async () => post) },
    feedComment: comment,
    feedMediaAsset: { findMany: mediaFind },
    feedCommentMedia: {
      createMany: mediaCreate,
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        links.filter(link =>
          (where.commentId as { in?: string[] })?.in?.includes(link.commentId) ||
          where.commentId === link.commentId,
        ).map(link => ({ ...link, media: asset }))),
    },
    feedNotification: { create: vi.fn(async () => ({ id: "notification" })) },
    feedNotificationOutbox: { create: vi.fn(async () => ({})) },
    feedCommentReaction: { groupBy: vi.fn(async () => []), findMany: vi.fn(async () => []) },
  };
  const db = {
    ...tx, $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as FeedDb;
  const signed = vi.fn(async ({ key }: { key: string }) =>
    "https://cdn.example.invalid/" + key);
  const social = createFeedSocial({
    db, storage: { signCdn: signed }, enabled: () => true, now: () => now,
  });
  return { social, asset, mediaFind, mediaCreate, commentCreate, signed };
}

describe("Feed comment media ownership and CDN DTO", () => {
  it("lets another logged-in user attach own processed photo to a public post, without text", async () => {
    const test = createHarness();
    const result = await test.social.createComment("reader", "published-post", {
      text: "", mediaIds: [test.asset.id], clientRequestId: REQUEST_ID,
    });
    expect(result.text).toBe("");
    expect(result.media).toHaveLength(1);
    expect(result.media?.[0]).toMatchObject({
      id: "comment-photo", kind: "photo", status: "ready",
      thumbUrl: "https://cdn.example.invalid/media/v2/comment-photo/v1/image/m.webp",
    });
    expect(test.mediaCreate).toHaveBeenCalledWith({
      data: [{ commentId: result.id, mediaId: "comment-photo", position: 0 }],
    });
  });
  it("rejects a media ID outside the commenter's ownership or post", async () => {
    const test = createHarness(false);
    await expect(test.social.createComment("reader", "published-post", {
      text: "", mediaIds: ["foreign-photo"], clientRequestId: REQUEST_ID,
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 422 });
    expect(test.commentCreate).not.toHaveBeenCalled();
  });
  it("preserves idempotency for the same media and forbids changing it on replay", async () => {
    const test = createHarness();
    const input = { text: "Здорово", mediaIds: [test.asset.id], clientRequestId: REQUEST_ID };
    const first = await test.social.createComment("reader", "published-post", input);
    const replay = await test.social.createComment("reader", "published-post", input);
    expect(replay.id).toBe(first.id);
    expect(test.commentCreate).toHaveBeenCalledTimes(1);
    await expect(test.social.createComment("reader", "published-post", {
      ...input, mediaIds: [],
    })).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
  });
});
