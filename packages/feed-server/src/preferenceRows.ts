import { randomUUID } from "node:crypto";
import type { FeedDb, FeedTx } from "@gafus/media-shared/media-db-ports";
import {
  FeedError,
  assertFeedPublishingAllowed,
  assertFeedModerator,
  assertFeedReportable,
  type FeedPreferenceOperations,
} from "@gafus/core/services/feed";

export async function ensureFeedPublishingAllowed(db: Pick<FeedTx, "user">, actorId: string) {
  const user = await db.user.findUnique({
    where: { id: actorId },
    select: { feedPublishingBlocked: true },
  });
  assertFeedPublishingAllowed(user?.feedPublishingBlocked);
}

/** Called inside the first publication transaction; updates never send a new-post push. */
export async function enqueueFeedAuthorPush(
  tx: FeedTx,
  post: { id: string; authorId: string; publishedAt: Date | null; moderationState?: string },
  at: Date,
) {
  if (post.publishedAt || (post.moderationState && post.moderationState !== "visible")) return;
  const subscribers = await tx.feedAuthorPreference.findMany({
    where: { authorId: post.authorId, notify: true, hidden: false },
    select: { userId: true },
  });
  if (!subscribers.length) return;
  const notifications = subscribers
    .filter((row) => row.userId !== post.authorId)
    .map((row) => ({
      id: randomUUID(),
      recipientId: row.userId,
      postId: post.id,
      kind: "author_post" as const,
      actorIds: [post.authorId],
      readAt: at,
      createdAt: at,
    }));
  await tx.feedNotification.createMany({ data: notifications });
  await tx.feedNotificationOutbox.createMany({
    data: notifications.map((row) => ({
      notificationId: row.id,
      recipientId: row.recipientId,
      availableAt: at,
    })),
  });
}

export function createFeedPreferenceOperations(
  db: FeedDb,
  now = () => new Date(),
): FeedPreferenceOperations {
  return {
    readActor(id) {
      return db.user.findUnique({ where: { id }, select: { id: true, role: true } });
    },
    async removeBookmark(actorId, postId) {
      await db.feedBookmark.deleteMany({ where: { userId: actorId, postId } });
    },
    async saveVisibleBookmark(actorId, postId) {
      const post = await db.feedPost.findFirst({
        where: { id: postId, status: "published", deletedAt: null, moderationState: "visible" },
        select: { id: true },
      });
      if (!post) return false;
      await db.feedBookmark.upsert({
        where: { userId_postId: { userId: actorId, postId } },
        create: { userId: actorId, postId },
        update: {},
      });
      return true;
    },
    async saveAuthorPreference(actorId, authorId, value) {
      if (!(await db.user.findUnique({ where: { id: authorId }, select: { id: true } })))
        return null;
      return db.feedAuthorPreference.upsert({
        where: { userId_authorId: { userId: actorId, authorId } },
        create: { userId: actorId, authorId, ...value },
        update: value,
      });
    },
    async readHiddenAuthors(actorId, cursor, take) {
      const rows = await db.feedAuthorPreference.findMany({
        where: { userId: actorId, hidden: true, ...(cursor ? { authorId: { gt: cursor } } : {}) },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              profile: { select: { fullName: true, avatarUrl: true } },
            },
          },
        },
        orderBy: { authorId: "asc" },
        take: take,
      });
      return rows;
    },
    async submitReport(actorId, targetType, targetId, value) {
      return db.$transaction(async (tx) => {
        let postId = targetId;
        if (targetType === "comment") {
          const comment = await tx.feedComment.findUnique({
            where: { id: targetId },
            select: { postId: true },
          });
          if (!comment) throw new FeedError("NOT_FOUND", undefined, 404);
          postId = comment.postId;
        }
        await tx.$queryRaw`SELECT "id" FROM "FeedPost" WHERE "id" = ${postId} FOR UPDATE`;
        const post = await tx.feedPost.findFirst({
          where: { id: postId, status: "published", deletedAt: null, moderationState: "visible" },
        });
        if (!post) throw new FeedError("NOT_FOUND", undefined, 404);
        let text = "",
          authorId = post.authorId;
        if (targetType === "post") {
          const revision = post.activeRevisionId
            ? await tx.feedPostRevision.findUnique({
                where: { id: post.activeRevisionId },
                select: { text: true },
              })
            : null;
          text = revision?.text ?? "";
        } else {
          const comment = await tx.feedComment.findFirst({
            where: { id: targetId, postId, deletedAt: null, moderationState: "visible" },
          });
          if (!comment) throw new FeedError("NOT_FOUND", undefined, 404);
          text = comment.text;
          authorId = comment.authorId;
        }
        assertFeedReportable(actorId, authorId);
        const row = await tx.feedReport.upsert({
          where: { reporterId_targetType_targetId: { reporterId: actorId, targetType, targetId } },
          create: {
            reporterId: actorId,
            authorId,
            targetType,
            targetId,
            postId,
            snapshotText: text,
            ...value,
          },
          update: {},
        });
        return { id: row.id };
      });
    },
    async readReports(cursor, take) {
      const rows = await db.feedReport.findMany({
        orderBy: { id: "desc" },
        take: take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      const pendingCount = await db.feedReport.count({ where: { status: "pending" } });
      const ids = [...new Set(rows.flatMap((row) => [row.authorId, row.reporterId]))];
      const users = await db.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, username: true, feedPublishingBlocked: true },
      });
      return { rows, users, pendingCount };
    },
    async resolveReport(actorId, reportId, value) {
      return db.$transaction(async (tx) => {
        // The initial role check is not sufficient if staff access was revoked
        // while the request waited. Hold the actor row and re-check the DB role
        // in the same transaction as the moderation write.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR NO KEY UPDATE`;
        const actor = await tx.user.findUnique({
          where: { id: actorId },
          select: { role: true },
        });
        assertFeedModerator(actor?.role);
        const target = await tx.feedReport.findUnique({ where: { id: reportId } });
        if (!target) throw new FeedError("NOT_FOUND", undefined, 404);
        // Reports and moderation always lock the post before the report.
        await tx.$queryRaw`SELECT "id" FROM "FeedPost" WHERE "id" = ${target.postId} FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "FeedReport" WHERE "id" = ${reportId} FOR UPDATE`;
        const report = await tx.feedReport.findUnique({ where: { id: reportId } });
        if (!report) throw new FeedError("NOT_FOUND", undefined, 404);
        // Duplicate transport retries must not create duplicate audit actions
        // or repeat content/author mutations. Restores and explicit changes
        // remain possible even when a report was already resolved.
        if (
          report.status === "resolved" &&
          report.resolution === value.action &&
          report.resolutionReason === value.reason
        )
          return { id: reportId };
        if (["hide", "delete", "restore"].includes(value.action)) {
          const data = {
            moderationState:
              value.action === "restore"
                ? "visible"
                : value.action === "hide"
                  ? "hidden"
                  : "removed",
            moderationReason: value.action === "restore" ? null : value.reason,
            moderatedAt: now(),
          };
          const result =
            report.targetType === "post"
              ? await tx.feedPost.updateMany({
                  where: { id: report.targetId, deletedAt: null },
                  data,
                })
              : await tx.feedComment.updateMany({
                  where: { id: report.targetId, deletedAt: null },
                  data,
                });
          if (!result.count) throw new FeedError("NOT_FOUND", "Контент уже удалён автором", 404);
        }
        if (value.action === "block" || value.action === "unblock") {
          await tx.user.update({
            where: { id: report.authorId },
            data: {
              feedPublishingBlocked: value.action === "block",
              feedPublishingBlockReason: value.action === "block" ? value.reason : null,
            },
          });
        }
        await tx.feedModerationAction.create({
          data: { moderatorId: actorId, reportId, ...value },
        });
        await tx.feedReport.update({
          where: { id: reportId },
          data: {
            status: "resolved",
            resolution: value.action,
            resolutionReason: value.reason,
            moderatorId: actorId,
            resolvedAt: now(),
          },
        });
        if (["hide", "delete"].includes(value.action))
          await tx.feedReport.updateMany({
            where: { targetType: report.targetType, targetId: report.targetId, status: "pending" },
            data: {
              status: "resolved",
              resolution: value.action,
              resolutionReason: value.reason,
              moderatorId: actorId,
              resolvedAt: now(),
            },
          });
        return { id: reportId };
      });
    },
  };
}
