import { randomUUID } from "node:crypto";
import type { FeedDb } from "./ports";

export const FEED_NOTIFICATION_MAX_ATTEMPTS = 5;
export const FEED_NOTIFICATION_LEASE_MS = 120_000;
export function feedNotificationRetryMs(attempts: number) {
  if (!Number.isSafeInteger(attempts) || attempts < 1) throw new Error("INVALID_FEED_ATTEMPT");
  return Math.min(60 * 60_000, 60_000 * 2 ** Math.min(6, attempts - 1));
}
export interface FeedNotificationDelivery {
  deliver(input: {
    notificationId: string;
    recipientId: string;
    kind: "author_post" | "comment" | "reply" | "post_reaction" | "comment_reaction";
    postId: string;
    commentId: string | null;
    actorIds: string[];
  }): Promise<void>;
}
/**
 * Delivery adapter is separate from persistence: mobile/web in-app notifications are committed
 * before a push is attempted. All claims use atomic conditional SQL updates, with expiring leases.
 */
export function createFeedNotificationOutbox(input: {
  db: FeedDb;
  delivery: FeedNotificationDelivery;
  now?: () => Date;
}) {
  const { db, delivery, now = () => new Date() } = input;
  async function claim(batchSize: number) {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 20)
      throw new Error("INVALID_FEED_BATCH_SIZE");
    const at = now();
    const candidates = await db.feedNotificationOutbox.findMany({
      where: {
        OR: [
          { status: "pending", availableAt: { lte: at } },
          { status: "processing", leaseUntil: { lt: at } },
        ],
      },
      orderBy: [{ availableAt: "asc" }, { id: "asc" }], take: batchSize * 2,
    });
    const jobs: { id: string; attemptToken: string; notificationId: string; recipientId: string; attempts: number }[] = [];
    for (const candidate of candidates) {
      if (jobs.length >= batchSize) break;
      const attemptToken = randomUUID();
      const conditional = {
        id: candidate.id, attempts: candidate.attempts,
        OR: [
          { status: "pending" as const, availableAt: { lte: at } },
          { status: "processing" as const, leaseUntil: { lt: at } },
        ],
      };
      if (candidate.attempts >= FEED_NOTIFICATION_MAX_ATTEMPTS) {
        // A crash on the final leased attempt must not restart the retry budget.
        await db.feedNotificationOutbox.updateMany({ where: conditional,
          data: { status: "failed", leaseUntil: null, attemptToken: null, lastErrorCode: "PUSH_DELIVERY_FAILED" },
        });
        continue;
      }
      const result = await db.feedNotificationOutbox.updateMany({
        where: conditional,
        data: {
          status: "processing",
          leaseUntil: new Date(at.getTime() + FEED_NOTIFICATION_LEASE_MS),
          attemptToken, attempts: { increment: 1 }, lastErrorCode: null,
        },
      });
      if (result.count === 1) jobs.push({
        id: candidate.id, attemptToken, notificationId: candidate.notificationId,
        recipientId: candidate.recipientId, attempts: candidate.attempts + 1,
      });
    }
    return jobs;
  }
  async function deliverClaim(job: Awaited<ReturnType<typeof claim>>[number]) {
    const at = now();
    const live = await db.feedNotificationOutbox.updateMany({
      where: { id: job.id, attemptToken: job.attemptToken, status: "processing", leaseUntil: { gt: at } },
      data: { leaseUntil: new Date(at.getTime() + FEED_NOTIFICATION_LEASE_MS) },
    });
    if (live.count !== 1) return { completed: false, delivered: false };
    const row = await db.feedNotification.findUnique({
      where: { id: job.notificationId },
      include: {
        post: { select: { status: true, deletedAt: true, moderationState: true, authorId: true } },
        comment: { select: { deletedAt: true, moderationState: true } },
      },
    });
    let deliverable = Boolean(row && row.post.status === "published" && !row.post.deletedAt && (!row.post.moderationState || row.post.moderationState === "visible") &&
      (!row.commentId || (row.comment && !row.comment.deletedAt && (!row.comment.moderationState || row.comment.moderationState === "visible"))) &&
      row.actorIds.length > 0);
    if (deliverable && row && (row.kind === "post_reaction" || row.kind === "comment_reaction")) {
      // Never push a reaction that was removed during the grouping window.
      const reactionCount = row.kind === "post_reaction"
        ? await db.feedPostReaction.count({ where: { postId: row.postId, userId: { in: row.actorIds } } })
        : await db.feedCommentReaction.count({ where: { commentId: row.commentId!, userId: { in: row.actorIds } } });
      deliverable = reactionCount > 0;
    }
    if (deliverable && row?.kind === "author_post") {
      const preference = await db.feedAuthorPreference.findUnique({ where: { userId_authorId: { userId: job.recipientId, authorId: row.post.authorId } } });
      deliverable = Boolean(preference?.notify && !preference.hidden);
    }
    try {
      if (deliverable && row) {
        await delivery.deliver({
          notificationId: row.id, recipientId: job.recipientId,
          kind: row.kind, postId: row.postId, commentId: row.commentId, actorIds: row.actorIds,
        });
      }
      const result = await db.feedNotificationOutbox.updateMany({
        where: { id: job.id, attemptToken: job.attemptToken, status: "processing" },
        data: { status: "completed", leaseUntil: null, attemptToken: null },
      });
      return { completed: result.count === 1, delivered: deliverable };
    } catch {
      const exhausted = job.attempts >= FEED_NOTIFICATION_MAX_ATTEMPTS;
      await db.feedNotificationOutbox.updateMany({
        where: { id: job.id, attemptToken: job.attemptToken, status: "processing" },
        data: {
          status: exhausted ? "failed" : "pending",
          leaseUntil: null, attemptToken: null,
          availableAt: new Date(now().getTime() + feedNotificationRetryMs(job.attempts)),
          lastErrorCode: "PUSH_DELIVERY_FAILED",
        },
      });
      return { completed: false, delivered: false };
    }
  }
  async function process(batchSize = 10) {
    const jobs = await claim(batchSize);
    const results = [];
    for (const job of jobs) results.push(await deliverClaim(job));
    return {
      claimed: jobs.length,
      delivered: results.filter(item => item.delivered && item.completed).length,
      completed: results.filter(item => item.completed).length,
    };
  }
  return { claim, deliverClaim, process };
}
