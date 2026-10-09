import { describe, expect, it, vi } from "vitest";
import type { FeedDb } from "./ports";
import { createFeedNotificationOutbox, feedNotificationRetryMs } from "./outbox";
const now = new Date("2026-10-09T12:00:00.000Z");
function setup(options: { missingPost?: boolean; fail?: boolean; reaction?: boolean } = {}) {
  const event = {
    id: "note_1", postId: "post_1", commentId: null, recipientId: "recipient_1",
    kind: options.reaction ? "post_reaction" as const : "comment" as const,
    actorIds: ["actor_1"], post: { status: "published", deletedAt: options.missingPost ? now : null },
    comment: null,
  };
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const findMany = vi.fn(async () => [{
    id: "job_1", notificationId: "note_1", recipientId: "recipient_1",
    status: "pending", attempts: 0,
  }]);
  const notification = vi.fn(async () => event);
  const reactionCount = vi.fn(async () => 0);
  const send = vi.fn(async () => {
    if (options.fail) throw new Error("push offline");
  });
  const db = {
    feedNotificationOutbox: { findMany, updateMany },
    feedNotification: { findUnique: notification },
    feedPostReaction: { count: reactionCount },
    feedCommentReaction: { count: reactionCount },
  } as unknown as FeedDb;
  return { worker: createFeedNotificationOutbox({ db, delivery: { deliver: send }, now: () => now }),
    updateMany, findMany, notification, send, reactionCount };
}
describe("feed notification delivery outbox", () => {
  it("bounds backoff and rejects invalid attempts", () => {
    expect(feedNotificationRetryMs(1)).toBe(60000);
    expect(feedNotificationRetryMs(2)).toBe(120000);
    expect(feedNotificationRetryMs(5)).toBe(960000);
    expect(feedNotificationRetryMs(100)).toBe(3600000);
    expect(() => feedNotificationRetryMs(0)).toThrow();
  });
  it("claims with expiring leases, fencing token, and bounded batch", async () => {
    const { worker, updateMany, findMany } = setup();
    expect(await worker.claim(1)).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.arrayContaining([
        expect.objectContaining({ status: "processing" }),
      ]) }),
    }));
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "processing", attempts: { increment: 1 },
        leaseUntil: new Date(now.getTime() + 120000), attemptToken: expect.any(String) }),
    }));
    await expect(worker.claim(21)).rejects.toThrow();
  });
  it("sends eligible notification then atomically completes", async () => {
    const { worker, send, updateMany } = setup();
    expect(await worker.process(1)).toMatchObject({ claimed: 1, delivered: 1, completed: 1 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ notificationId: "note_1" }));
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ attemptToken: expect.any(String) }),
      data: expect.objectContaining({ status: "completed", leaseUntil: null, attemptToken: null }),
    }));
  });
  it("does not send notification when target was removed", async () => {
    const { worker, send } = setup({ missingPost: true });
    expect(await worker.process(1)).toMatchObject({ delivered: 0, completed: 1 });
    expect(send).not.toHaveBeenCalled();
  });
  it("does not send a removed reaction from the batch window", async () => {
    const { worker, send } = setup({ reaction: true });
    expect(await worker.process(1)).toMatchObject({ delivered: 0, completed: 1 });
    expect(send).not.toHaveBeenCalled();
  });
  it("requeues a failed push without losing in-app notification", async () => {
    const { worker, updateMany } = setup({ fail: true });
    expect(await worker.process(1)).toMatchObject({ delivered: 0, completed: 0 });
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "pending", lastErrorCode: "PUSH_DELIVERY_FAILED",
        availableAt: new Date(now.getTime() + 60000), attemptToken: null }),
    }));
  });
  it("terminalizes an expired final attempt without another push", async () => {
    const { worker, findMany, updateMany, send } = setup();
    findMany.mockResolvedValue([{ id: "job_1", notificationId: "note_1", recipientId: "recipient_1",
      status: "processing", attempts: 5 }]);
    expect(await worker.process(1)).toEqual({ claimed: 0, delivered: 0, completed: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ attempts: 5 }),
      data: expect.objectContaining({ status: "failed", attemptToken: null, leaseUntil: null }),
    }));
  });

  it("never delivers a claim whose lease was taken over", async () => {
    const { worker, updateMany, send, notification } = setup();
    const [claim] = await worker.claim(1);
    updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await worker.deliverClaim(claim)).toEqual({ completed: false, delivered: false });
    expect(send).not.toHaveBeenCalled(); expect(notification).not.toHaveBeenCalled();
  });

});
