import { randomUUID } from "node:crypto";
import { z } from "zod";
import { FEED_REPORT_REASONS } from "../../../../types/src/feed";
import { FeedError } from "./errors";
import { feedIdSchema, feedListSchema, feedParse } from "./schemas";
import type { FeedDb, FeedTx } from "./ports";

export const feedPreferenceSchema = z.object({ hidden: z.boolean().optional(), notify: z.boolean().optional() }).strict()
  .refine(value => value.hidden !== undefined || value.notify !== undefined);
export const feedReportSchema = z.object({
  reason: z.enum(Object.keys(FEED_REPORT_REASONS) as [keyof typeof FEED_REPORT_REASONS, ...(keyof typeof FEED_REPORT_REASONS)[]]),
  comment: z.string().trim().max(1000).default(""),
}).strict();
export const feedModerationSchema = z.object({
  action: z.enum(["dismiss", "hide", "delete", "restore", "block", "unblock"]),
  reason: z.string().trim().min(1).max(1000),
}).strict();

export async function assertFeedPublishingAllowed(db: Pick<FeedTx, "user">, actorId: string) {
  const user = await db.user.findUnique({ where: { id: actorId }, select: { feedPublishingBlocked: true } });
  if (user?.feedPublishingBlocked) throw new FeedError("FORBIDDEN", "Публикации и комментарии ограничены модератором", 403);
}

/** Called inside the first publication transaction; updates never send a new-post push. */
export async function enqueueFeedAuthorPush(tx: FeedTx, post: { id: string; authorId: string; publishedAt: Date | null; moderationState?: string }, at: Date) {
  if (post.publishedAt || (post.moderationState && post.moderationState !== "visible")) return;
  const subscribers = await tx.feedAuthorPreference.findMany({ where: { authorId: post.authorId, notify: true, hidden: false }, select: { userId: true } });
  if (!subscribers.length) return;
  const notifications = subscribers.filter(row => row.userId !== post.authorId).map(row => ({
    id: randomUUID(), recipientId: row.userId, postId: post.id, kind: "author_post" as const,
    actorIds: [post.authorId], readAt: at, createdAt: at,
  }));
  await tx.feedNotification.createMany({ data: notifications });
  await tx.feedNotificationOutbox.createMany({ data: notifications.map(row => ({ notificationId: row.id, recipientId: row.recipientId, availableAt: at })) });
}

export function createFeedPreferences({ db, enabled = () => false, now = () => new Date() }: { db: FeedDb; enabled?: () => boolean; now?: () => Date }) {
  async function auth(id: string, moderator = false) {
    if (!enabled()) throw new FeedError("FEED_DISABLED", undefined, 503);
    feedParse(feedIdSchema, id);
    const user = await db.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!user) throw new FeedError("UNAUTHENTICATED", undefined, 401);
    if (moderator && !["ADMIN", "MODERATOR"].includes(user.role)) throw new FeedError("FORBIDDEN", undefined, 403);
  }
  return {
    async bookmark(actorId: string, postId: string, saved: boolean) {
      await auth(actorId); feedParse(feedIdSchema, postId);
      if (!saved) { await db.feedBookmark.deleteMany({ where: { userId: actorId, postId } }); return { saved }; }
      const post = await db.feedPost.findFirst({ where: { id: postId, status: "published", deletedAt: null, moderationState: "visible" }, select: { id: true } });
      if (!post) throw new FeedError("NOT_FOUND", undefined, 404);
      await db.feedBookmark.upsert({ where: { userId_postId: { userId: actorId, postId } }, create: { userId: actorId, postId }, update: {} });
      return { saved };
    },
    async preference(actorId: string, authorId: string, input: unknown) {
      await auth(actorId); feedParse(feedIdSchema, authorId);
      if (actorId === authorId) throw new FeedError("VALIDATION_ERROR", "Нельзя скрыть себя или подписаться на себя", 400);
      const value = feedParse(feedPreferenceSchema, input);
      if (!await db.user.findUnique({ where: { id: authorId }, select: { id: true } })) throw new FeedError("NOT_FOUND", undefined, 404);
      const row = await db.feedAuthorPreference.upsert({ where: { userId_authorId: { userId: actorId, authorId } },
        create: { userId: actorId, authorId, ...value }, update: value });
      return { hidden: row.hidden, notify: row.notify };
    },
    async hiddenAuthors(actorId: string, input: unknown = {}) {
      await auth(actorId);
      const q = feedParse(feedListSchema, input);
      if (q.cursor) feedParse(feedIdSchema, q.cursor);
      const rows = await db.feedAuthorPreference.findMany({ where: { userId: actorId, hidden: true, ...(q.cursor ? { authorId: { gt: q.cursor } } : {}) },
        include: { author: { select: { id: true, username: true, profile: { select: { fullName: true, avatarUrl: true } } } } }, orderBy: { authorId: "asc" }, take: q.pageSize + 1 });
      return { items: rows.slice(0, q.pageSize).map(({ author }) => ({ id: author.id, username: author.username, name: author.profile?.fullName ?? author.username, avatarUrl: author.profile?.avatarUrl ?? null })),
        nextCursor: rows.length > q.pageSize ? rows[q.pageSize - 1]!.authorId : null, serverNow: now().toISOString() };
    },
    async report(actorId: string, targetType: "post" | "comment", targetId: string, input: unknown) {
      await auth(actorId); feedParse(feedIdSchema, targetId);
      const value = feedParse(feedReportSchema, input);
      return db.$transaction(async tx => {
        let postId = targetId;
        if (targetType === "comment") {
          const comment = await tx.feedComment.findUnique({ where: { id: targetId }, select: { postId: true } });
          if (!comment) throw new FeedError("NOT_FOUND", undefined, 404);
          postId = comment.postId;
        }
        await tx.$queryRaw`SELECT "id" FROM "FeedPost" WHERE "id" = ${postId} FOR UPDATE`;
        const post = await tx.feedPost.findFirst({ where: { id: postId, status: "published", deletedAt: null, moderationState: "visible" } });
        if (!post) throw new FeedError("NOT_FOUND", undefined, 404);
        let text = "", authorId = post.authorId;
        if (targetType === "post") {
          const revision = post.activeRevisionId ? await tx.feedPostRevision.findUnique({ where: { id: post.activeRevisionId }, select: { text: true } }) : null;
          text = revision?.text ?? "";
        } else {
          const comment = await tx.feedComment.findFirst({ where: { id: targetId, postId, deletedAt: null, moderationState: "visible" } });
          if (!comment) throw new FeedError("NOT_FOUND", undefined, 404);
          text = comment.text; authorId = comment.authorId;
        }
        if (authorId === actorId) throw new FeedError("VALIDATION_ERROR", "Нельзя пожаловаться на свой контент", 400);
        const row = await tx.feedReport.upsert({ where: { reporterId_targetType_targetId: { reporterId: actorId, targetType, targetId } },
          create: { reporterId: actorId, authorId, targetType, targetId, postId, snapshotText: text, ...value }, update: {} });
        return { id: row.id };
      });
    },
    async reports(actorId: string, input: unknown = {}) {
      await auth(actorId, true);
      const q = feedParse(feedListSchema, input);
      if (q.cursor) feedParse(feedIdSchema, q.cursor);
      const rows = await db.feedReport.findMany({ orderBy: { id: "desc" }, take: q.pageSize + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
      const pendingCount = await db.feedReport.count({ where: { status: "pending" } });
      const ids = [...new Set(rows.flatMap(row => [row.authorId, row.reporterId]))];
      const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, feedPublishingBlocked: true } });
      return { items: rows.slice(0, q.pageSize).map(row => ({ ...row,
        author: users.find(user => user.id === row.authorId) ?? null,
        reporter: users.find(user => user.id === row.reporterId) ?? null,
        createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null })), pendingCount,
        nextCursor: rows.length > q.pageSize ? rows[q.pageSize - 1]!.id : null };
    },
    async moderate(actorId: string, reportId: string, input: unknown) {
      await auth(actorId, true); feedParse(feedIdSchema, reportId);
      const value = feedParse(feedModerationSchema, input);
      return db.$transaction(async tx => {
        const target = await tx.feedReport.findUnique({ where: { id: reportId } });
        if (!target) throw new FeedError("NOT_FOUND", undefined, 404);
        // Reports and moderation always lock the post before the report.
        await tx.$queryRaw`SELECT "id" FROM "FeedPost" WHERE "id" = ${target.postId} FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "FeedReport" WHERE "id" = ${reportId} FOR UPDATE`;
        const report = await tx.feedReport.findUnique({ where: { id: reportId } });
        if (!report) throw new FeedError("NOT_FOUND", undefined, 404);
        if (["hide", "delete", "restore"].includes(value.action)) {
          const data = { moderationState: value.action === "restore" ? "visible" : value.action === "hide" ? "hidden" : "removed", moderationReason: value.action === "restore" ? null : value.reason, moderatedAt: now() };
          const result = report.targetType === "post"
            ? await tx.feedPost.updateMany({ where: { id: report.targetId, deletedAt: null }, data })
            : await tx.feedComment.updateMany({ where: { id: report.targetId, deletedAt: null }, data });
          if (!result.count) throw new FeedError("NOT_FOUND", "Контент уже удалён автором", 404);
        }
        if (value.action === "block" || value.action === "unblock") {
          await tx.user.update({ where: { id: report.authorId }, data: { feedPublishingBlocked: value.action === "block", feedPublishingBlockReason: value.action === "block" ? value.reason : null } });
        }
        await tx.feedModerationAction.create({ data: { moderatorId: actorId, reportId, ...value } });
        await tx.feedReport.update({ where: { id: reportId }, data: { status: "resolved", resolution: value.action, resolutionReason: value.reason, moderatorId: actorId, resolvedAt: now() } });
        if (["hide", "delete"].includes(value.action)) await tx.feedReport.updateMany({ where: { targetType: report.targetType, targetId: report.targetId, status: "pending" },
          data: { status: "resolved", resolution: value.action, resolutionReason: value.reason, moderatorId: actorId, resolvedAt: now() } });
        return { id: reportId };
      });
    },
  };
}
