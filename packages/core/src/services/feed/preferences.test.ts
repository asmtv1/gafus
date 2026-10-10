import { describe, expect, it, vi } from "vitest";
import type { FeedDb, FeedTx } from "./ports";
import { assertFeedPublishingAllowed, createFeedPreferences, enqueueFeedAuthorPush, feedReportSchema, feedPreferenceSchema } from "./preferences";
function setup(role = "USER") {
  const tx = {
    $queryRaw: vi.fn(async () => []),
    user: { findUnique: vi.fn(async () => ({ id: "reader", role, feedPublishingBlocked: false })), update: vi.fn(async () => ({})) },
    feedPost: { findFirst: vi.fn(async () => ({ id: "post", authorId: "author", activeRevisionId: "revision" })), updateMany: vi.fn(async () => ({ count: 1 })) },
    feedPostRevision: { findUnique: vi.fn(async () => ({ text: "Исходный текст" })) },
    feedComment: { updateMany: vi.fn(async () => ({ count: 1 })) },
    feedBookmark: { upsert: vi.fn(), deleteMany: vi.fn() },
    feedAuthorPreference: { upsert: vi.fn(async () => ({ hidden: true, notify: false })), findMany: vi.fn(async () => [{ userId: "reader" }]) },
    feedReport: { upsert: vi.fn(async () => ({ id: "report" })), findUnique: vi.fn(async () => ({ id: "report", targetType: "post", targetId: "post", postId: "post", authorId: "author" })), update: vi.fn(), updateMany: vi.fn() },
    feedModerationAction: { create: vi.fn() },
    feedNotification: { createMany: vi.fn() }, feedNotificationOutbox: { createMany: vi.fn() },
  };
  const db = { ...tx, $transaction: async (fn: (arg: typeof tx) => unknown) => fn(tx) } as unknown as FeedDb;
  return { tx, db, service: createFeedPreferences({ db, enabled: () => true }) };
}
describe("feed preferences and moderation", () => {
  it("rejects unknown report reasons and oversized evidence comments", () => {
    expect(feedReportSchema.safeParse({ reason: "unknown" }).success).toBe(false);
    expect(feedReportSchema.safeParse({ reason: "spam", comment: "x".repeat(1001) }).success).toBe(false);
    expect(feedPreferenceSchema.safeParse({}).success).toBe(false);
    expect(feedPreferenceSchema.safeParse({ hidden: true, userId: "other" }).success).toBe(false);
  });
  it("scopes hiding to the reader and leaves the push preference unchanged", async () => {
    const { service, tx } = setup();
    await service.preference("reader", "author", { hidden: true });
    expect(tx.feedAuthorPreference.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_authorId: { userId: "reader", authorId: "author" } }, update: { hidden: true } }));
    await expect(service.preference("reader", "reader", { hidden: true })).rejects.toMatchObject({ status: 400 });
  });
  it("keeps removal of unavailable bookmarks possible and only deletes this reader's row", async () => {
    const { service, tx } = setup();
    await service.bookmark("reader", "post", false);
    expect(tx.feedBookmark.deleteMany).toHaveBeenCalledWith({ where: { userId: "reader", postId: "post" } });
    expect(tx.feedPost.findFirst).not.toHaveBeenCalled();
  });
  it("stores text evidence once without replacing it on duplicate reports", async () => {
    const { service, tx } = setup();
    await service.report("reader", "post", "post", { reason: "spam", comment: "Реклама" });
    expect(tx.feedReport.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ reporterId: "reader", authorId: "author", snapshotText: "Исходный текст", reason: "spam" }), update: {} }));
  });
  it("denies non-moderators before any moderation write", async () => {
    const { service, tx } = setup();
    await expect(service.moderate("reader", "report", { action: "hide", reason: "Спам" })).rejects.toMatchObject({ status: 403 });
    expect(tx.feedPost.updateMany).not.toHaveBeenCalled();
  });
  it.each(["ADMIN", "MODERATOR"])("lets %s hide without deleting content, records decision and permits restoration", async role => {
    const { service, tx } = setup(role);
    await service.moderate("reader", "report", { action: "hide", reason: "Спам" });
    expect(tx.feedPost.updateMany).toHaveBeenCalledWith({ where: { id: "post", deletedAt: null }, data: { moderationState: "hidden", moderationReason: "Спам", moderatedAt: expect.any(Date) } });
    expect(tx.feedModerationAction.create).toHaveBeenCalledWith({ data: { moderatorId: "reader", reportId: "report", action: "hide", reason: "Спам" } });
    await service.moderate("reader", "report", { action: "restore", reason: "Проверено" });
    expect(tx.feedPost.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { moderationState: "visible", moderationReason: null, moderatedAt: expect.any(Date) } }));
  });
  it("enqueues push only for the first publication and persists it atomically", async () => {
    const { tx } = setup(); const at = new Date();
    await enqueueFeedAuthorPush(tx as unknown as FeedTx, { id: "post", authorId: "author", publishedAt: null }, at);
    expect(tx.feedAuthorPreference.findMany).toHaveBeenCalledWith({ where: { authorId: "author", notify: true, hidden: false }, select: { userId: true } });
    expect(tx.feedNotification.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ recipientId: "reader", kind: "author_post", readAt: at })] });
    expect(tx.feedNotificationOutbox.createMany).toHaveBeenCalledOnce();
    await enqueueFeedAuthorPush(tx as unknown as FeedTx, { id: "post", authorId: "author", publishedAt: at }, at);
    expect(tx.feedNotificationOutbox.createMany).toHaveBeenCalledOnce();
  });
  it("blocks publishing at the service boundary", async () => {
    const db = { user: { findUnique: async () => ({ feedPublishingBlocked: true }) } } as unknown as FeedTx;
    await expect(assertFeedPublishingAllowed(db, "author")).rejects.toMatchObject({ status: 403 });
  });
});
