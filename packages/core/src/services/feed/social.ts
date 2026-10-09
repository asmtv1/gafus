import { randomUUID } from "node:crypto";
import type { Prisma } from "@gafus/prisma";
import type {
  FeedCommentDto, FeedCommentPageDto, FeedCommentInput, FeedCommentEditInput,
  FeedListQuery, FeedReaction, FeedReactionUserPageDto, FeedReactionCountDto,
  FeedNotificationDto, FeedNotificationPageDto,
} from "@gafus/types";
import { FEED_LIMITS as L } from "../../../../types/src/feed";
import { FeedError } from "./errors";
import { feedReactionToKind } from "./service";
import type { FeedDb, FeedTx } from "./ports";
import * as s from "./schemas";
const kindToReaction = { heart: "❤️", laugh: "😂", dog: "🐶", fire: "🔥", like: "👍" } as const;
const profile = { id: true, username: true, profile: { select: { fullName: true, avatarUrl: true } } } as const;
const commentInclude = { author: { select: profile } } as const;
type CommentRow = Prisma.FeedCommentGetPayload<{ include: typeof commentInclude }>;

export function createFeedSocial({ db, now = () => new Date(), enabled = () => false }: {
  db: FeedDb;
  now?: () => Date;
  enabled?: () => boolean;
}) {
  async function auth(actorId: string) {
    if (!enabled()) throw new FeedError("FEED_DISABLED", undefined, 503);
    if (!s.feedIdSchema.safeParse(actorId).success || !await db.user.findUnique({ where: { id: actorId }, select: { id: true } })) {
      throw new FeedError("UNAUTHENTICATED", undefined, 401);
    }
  }
  const transaction = <T>(fn: (tx: FeedTx) => Promise<T>) => db.$transaction(fn, { maxWait: 10_000, timeout: 30_000 });
  function userDto(user: CommentRow["author"]) {
    return { id: user.id, username: user.username, name: user.profile?.fullName ?? user.username, avatarUrl: user.profile?.avatarUrl ?? null };
  }
  async function readablePost(tx: Pick<FeedTx, "feedPost">, id: string) {
    const post = await tx.feedPost.findFirst({ where: { id, status: "published", deletedAt: null } });
    if (!post) throw new FeedError("NOT_FOUND", undefined, 404);
    return post;
  }
  async function readableComment(tx: FeedTx, id: string) {
    const row = await tx.feedComment.findUnique({ where: { id }, include: { post: true } });
    if (!row || row.deletedAt || row.post.deletedAt || row.post.status !== "published") throw new FeedError("NOT_FOUND", undefined, 404);
    return row;
  }
  function cursor(row: { id: string; createdAt: Date }) {
    return Buffer.from(JSON.stringify([row.createdAt.toISOString(), row.id])).toString("base64url");
  }
  function decodeCursor(raw?: string | null) {
    if (!raw) return null;
    try {
      const pair = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown[];
      if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string" || typeof pair[1] !== "string" || !s.feedIdSchema.safeParse(pair[1]).success || Number.isNaN(Date.parse(pair[0]))) throw Error("invalid");
      return { createdAt: new Date(pair[0]), id: pair[1] };
    } catch {
      throw new FeedError("VALIDATION_ERROR", "Некорректный курсор", 400);
    }
  }
  async function commentDto(actorId: string, rows: CommentRow[], postAuthorId: string): Promise<FeedCommentDto[]> {
    if (!rows.length) return [];
    const ids = rows.map(row => row.id);
    const [counts, mine, replies, addressed] = await Promise.all([
      db.feedCommentReaction.groupBy({ by: ["commentId", "kind"], where: { commentId: { in: ids } }, _count: { _all: true } }),
      db.feedCommentReaction.findMany({ where: { commentId: { in: ids }, userId: actorId }, select: { commentId: true, kind: true } }),
      db.feedComment.groupBy({ by: ["rootId"], where: { rootId: { in: ids } }, _count: { _all: true } }),
      db.feedComment.findMany({ where: { id: { in: rows.map(row => row.replyToId).filter((id): id is string => !!id) } }, select: { id: true, author: { select: profile } } }),
    ]);
    const reactions = new Map<string, FeedReactionCountDto[]>();
    for (const item of counts) reactions.set(item.commentId, [...(reactions.get(item.commentId) ?? []), { emoji: kindToReaction[item.kind], count: item._count._all }]);
    const my = new Map(mine.map(item => [item.commentId, kindToReaction[item.kind]]));
    const replyCounts = new Map(replies.map(item => [item.rootId, item._count._all]));
    const recipients = new Map(addressed.map(item => [item.id, item.author.profile?.fullName ?? item.author.username]));
    const at = now();
    return rows.map(row => ({
      id: row.id, postId: row.postId, author: userDto(row.author),
      text: row.deletedAt ? "" : row.text, createdAt: row.createdAt.toISOString(),
      editedAt: row.editedAt?.toISOString() ?? null,
      editUntil: new Date(row.createdAt.getTime() + L.editSeconds * 1000).toISOString(),
      rootId: row.rootId, replyToId: row.replyToId,
      replyToName: row.replyToId ? recipients.get(row.replyToId) ?? null : null,
      deleted: !!row.deletedAt, replyCount: replyCounts.get(row.id) ?? 0,
      reactions: reactions.get(row.id) ?? [], myReaction: my.get(row.id) ?? null,
      canEdit: !row.deletedAt && row.authorId === actorId && row.createdAt.getTime() + L.editSeconds * 1000 > at.getTime(),
      canDelete: !row.deletedAt && (row.authorId === actorId || postAuthorId === actorId),
    }));
  }
  async function notification(tx: FeedTx, recipientId: string, postId: string, commentId: string | null, kind: "comment" | "reply", actorId: string, at: Date) {
    if (recipientId === actorId) return;
    const record = await tx.feedNotification.create({ data: { recipientId, postId, commentId, kind, actorIds: [actorId], createdAt: at } });
    await tx.feedNotificationOutbox.create({ data: { id: randomUUID(), notificationId: record.id, recipientId, availableAt: at } });
  }
  async function groupedReaction(tx: FeedTx, recipientId: string, postId: string, commentId: string | null, kind: "post_reaction" | "comment_reaction", actorId: string, reaction: keyof typeof kindToReaction, at: Date) {
    if (recipientId === actorId) return;
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${recipientId} FOR UPDATE`;
    const groupKey = `${recipientId}:${kind}:${commentId ?? postId}`;
    const open = await tx.feedNotification.findFirst({
      where: { recipientId, groupKey, createdAt: { gte: new Date(at.getTime() - L.reactionBatchSeconds * 1000) } },
      orderBy: { createdAt: "desc" },
    });
    if (open) {
      await tx.feedNotification.update({ where: { id: open.id }, data: {
        actorIds: [...new Set([...open.actorIds, actorId])], reaction,
      } });
    } else {
      const record = await tx.feedNotification.create({ data: {
        recipientId, postId, commentId, kind, groupKey, actorIds: [actorId], reaction, createdAt: at,
      } });
      await tx.feedNotificationOutbox.create({ data: {
        id: randomUUID(), notificationId: record.id, recipientId,
        availableAt: new Date(at.getTime() + L.reactionBatchSeconds * 1000),
      } });
    }
  }
  const api = {
    async getComment(actorId: string, id: string): Promise<FeedCommentDto> {
      await auth(actorId);
      const commentId = s.feedParse(s.feedIdSchema, id);
      const row = await db.feedComment.findUnique({ where: { id: commentId }, include: commentInclude });
      if (!row || row.deletedAt) throw new FeedError("NOT_FOUND", undefined, 404);
      const post = await readablePost(db, row.postId);
      return (await commentDto(actorId, [row], post.authorId))[0]!;
    },
    async listComments(actorId: string, postId: string, input: FeedListQuery = {}): Promise<FeedCommentPageDto> {
      await auth(actorId);
      const q = s.feedParse(s.feedListSchema, input);
      const c = decodeCursor(q.cursor);
      const post = await db.feedPost.findFirst({ where: { id: postId, status: "published", deletedAt: null } });
      if (!post) throw new FeedError("NOT_FOUND", undefined, 404);
      const rows = await db.feedComment.findMany({
        where: { postId, rootId: null,
          ...(c ? { OR: [{ createdAt: { gt: c.createdAt } }, { createdAt: c.createdAt, id: { gt: c.id } }] } : {}) },
        include: commentInclude, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: q.pageSize + 1,
      });
      const page = rows.slice(0, q.pageSize);
      return { items: await commentDto(actorId, page, post.authorId), nextCursor: rows.length > q.pageSize ? cursor(page[page.length - 1]!) : null, serverNow: now().toISOString() };
    },
    async listReplies(actorId: string, rootId: string, input: FeedListQuery = {}): Promise<FeedCommentPageDto> {
      await auth(actorId);
      const q = s.feedParse(s.feedListSchema, input), c = decodeCursor(q.cursor);
      const root = await db.feedComment.findUnique({ where: { id: rootId }, include: { post: true } });
      if (!root || root.rootId || root.post.deletedAt || root.post.status !== "published") throw new FeedError("NOT_FOUND", undefined, 404);
      const rows = await db.feedComment.findMany({
        where: { rootId, ...(c ? { OR: [{ createdAt: { gt: c.createdAt } }, { createdAt: c.createdAt, id: { gt: c.id } }] } : {}) },
        include: commentInclude, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: q.pageSize + 1,
      });
      const page = rows.slice(0, q.pageSize);
      return { items: await commentDto(actorId, page, root.post.authorId), nextCursor: rows.length > q.pageSize ? cursor(page[page.length - 1]!) : null, serverNow: now().toISOString() };
    },
    async createComment(actorId: string, postId: string, input: FeedCommentInput): Promise<FeedCommentDto> {
      await auth(actorId);
      const value = s.feedParse(s.feedCommentSchema, input);
      const id = await transaction(async tx => {
        const post = await readablePost(tx, postId);
        const prior = await tx.feedComment.findUnique({ where: { authorId_clientRequestId: { authorId: actorId, clientRequestId: value.clientRequestId } } });
        if (prior) {
          if (prior.postId !== postId || prior.text !== value.text || prior.replyToId !== (value.replyToId ?? null)) throw new FeedError("VERSION_CONFLICT", undefined, 409);
          return prior.id;
        }
        let rootId: string | null = null, replyRecipient: string | null = null;
        if (value.replyToId) {
          const target = await tx.feedComment.findFirst({ where: { id: value.replyToId, postId, deletedAt: null } });
          if (!target) throw new FeedError("NOT_FOUND", "Комментарий для ответа недоступен", 404);
          rootId = target.rootId ?? target.id;
          replyRecipient = target.authorId;
        }
        const at = now(), newId = randomUUID();
        await tx.feedComment.create({ data: {
          id: newId, postId, authorId: actorId, clientRequestId: value.clientRequestId,
          text: value.text, rootId, replyToId: value.replyToId ?? null, createdAt: at,
        } });
        const targets = new Set([post.authorId, ...(replyRecipient ? [replyRecipient] : [])]);
        for (const recipient of targets) {
          if (recipient === actorId) continue;
          await notification(tx, recipient, postId, newId, replyRecipient === recipient ? "reply" : "comment", actorId, at);
        }
        return newId;
      });
      const row = await db.feedComment.findUnique({ where: { id }, include: commentInclude });
      const post = await db.feedPost.findUnique({ where: { id: postId } });
      if (!row || !post) throw new FeedError("NOT_FOUND", undefined, 404);
      return (await commentDto(actorId, [row], post.authorId))[0]!;
    },
    async editComment(actorId: string, id: string, input: FeedCommentEditInput): Promise<FeedCommentDto> {
      await auth(actorId);
      const value = s.feedParse(s.feedCommentEditSchema, input);
      const { row, post } = await transaction(async tx => {
        const comment = await readableComment(tx, id);
        if (comment.authorId !== actorId) throw new FeedError("FORBIDDEN", undefined, 403);
        if (now().getTime() >= comment.createdAt.getTime() + L.editSeconds * 1000) throw new FeedError("EDIT_WINDOW_CLOSED", undefined, 409);
        // The conditional update does not allow a simultaneous delete to be overwritten.
        const changed = await tx.feedComment.updateMany({ where: { id, deletedAt: null }, data: { text: value.text, editedAt: now() } });
        if (!changed.count) throw new FeedError("NOT_FOUND", undefined, 404);
        const latest = await tx.feedComment.findUniqueOrThrow({ where: { id }, include: commentInclude });
        const owner = await tx.feedPost.findUniqueOrThrow({ where: { id: comment.postId } });
        return { row: latest, post: owner };
      });
      return (await commentDto(actorId, [row], post.authorId))[0]!;
    },
    async deleteComment(actorId: string, id: string) {
      await auth(actorId);
      return transaction(async tx => {
        const comment = await readableComment(tx, id);
        const post = await readablePost(tx, comment.postId);
        if (comment.authorId !== actorId && post.authorId !== actorId) throw new FeedError("FORBIDDEN", undefined, 403);
        await tx.feedComment.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: now(), text: "" } });
        await tx.feedCommentReaction.deleteMany({ where: { commentId: id } });
        return { id };
      });
    },
    async setPostReaction(actorId: string, postId: string, reaction: FeedReaction) {
      await auth(actorId);
      const { reaction: emoji } = s.feedParse(s.feedReactionSchema, { reaction });
      return transaction(async tx => {
        const post = await readablePost(tx, postId);
        const at = now(), kind = feedReactionToKind[emoji];
        const old = await tx.feedPostReaction.findUnique({ where: { postId_userId: { postId, userId: actorId } } });
        if (old?.kind !== kind) {
          await tx.feedPostReaction.upsert({ where: { postId_userId: { postId, userId: actorId } },
            create: { postId, userId: actorId, kind }, update: { kind } });
          if (!old) await groupedReaction(tx, post.authorId, postId, null, "post_reaction", actorId, kind, at);
        }
        return { reaction: emoji };
      });
    },
    async removePostReaction(actorId: string, postId: string) {
      await auth(actorId);
      return transaction(async tx => {
        await readablePost(tx, postId);
        await tx.feedPostReaction.deleteMany({ where: { postId, userId: actorId } });
        return { reaction: null };
      });
    },
    async setCommentReaction(actorId: string, commentId: string, reaction: FeedReaction) {
      await auth(actorId);
      const { reaction: emoji } = s.feedParse(s.feedReactionSchema, { reaction });
      return transaction(async tx => {
        const comment = await readableComment(tx, commentId);
        const kind = feedReactionToKind[emoji];
        const old = await tx.feedCommentReaction.findUnique({ where: { commentId_userId: { commentId, userId: actorId } } });
        if (old?.kind !== kind) {
          await tx.feedCommentReaction.upsert({ where: { commentId_userId: { commentId, userId: actorId } },
            create: { commentId, userId: actorId, kind }, update: { kind } });
          if (!old) await groupedReaction(tx, comment.authorId, comment.postId, commentId, "comment_reaction", actorId, kind, now());
        }
        return { reaction: emoji };
      });
    },
    async removeCommentReaction(actorId: string, commentId: string) {
      await auth(actorId);
      return transaction(async tx => {
        await readableComment(tx, commentId);
        await tx.feedCommentReaction.deleteMany({ where: { commentId, userId: actorId } });
        return { reaction: null };
      });
    },
    async reactions(actorId: string, target: { postId?: string; commentId?: string }, query: FeedListQuery & { reaction?: FeedReaction } = {}): Promise<FeedReactionUserPageDto> {
      await auth(actorId);
      const q = s.feedParse(s.feedReactionListSchema, query);
      const c = decodeCursor(q.cursor);
      const where = target.postId ? { postId: target.postId } : target.commentId ? { commentId: target.commentId } : null;
      if (!where) throw new FeedError("VALIDATION_ERROR", undefined, 400);
      if (target.postId) {
        const post = await db.feedPost.findFirst({ where: { id: target.postId, deletedAt: null, status: "published" } });
        if (!post) throw new FeedError("NOT_FOUND", undefined, 404);
      } else {
        const comment = await db.feedComment.findUnique({ where: { id: target.commentId }, include: { post: true } });
        if (!comment || comment.deletedAt || comment.post.deletedAt || comment.post.status !== "published") throw new FeedError("NOT_FOUND", undefined, 404);
      }
      const kind = q.reaction ? feedReactionToKind[q.reaction] : undefined;
      const relation = { user: { select: profile } } as const;
      const conditions = { ...(kind ? { kind } : {}), ...(c ? { OR: [{ createdAt: { gt: c.createdAt } }, { createdAt: c.createdAt, id: { gt: c.id } }] } : {}) };
      const rows = target.postId ? await db.feedPostReaction.findMany({
        where: { ...conditions, postId: target.postId }, include: relation,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: q.pageSize + 1,
      }) : await db.feedCommentReaction.findMany({
        where: { ...conditions, commentId: target.commentId }, include: relation,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: q.pageSize + 1,
      });
      const page = rows.slice(0, q.pageSize);
      const counts = target.postId ? await db.feedPostReaction.groupBy({
        by: ["kind"], where: { postId: target.postId }, _count: { _all: true },
      }) : await db.feedCommentReaction.groupBy({
        by: ["kind"], where: { commentId: target.commentId }, _count: { _all: true },
      });
      return {
        items: page.map(row => ({ user: userDto(row.user), reaction: kindToReaction[row.kind], reactedAt: row.createdAt.toISOString() })),
        nextCursor: rows.length > q.pageSize ? cursor(page[page.length - 1]!) : null,
        counts: counts.map(item => ({ emoji: kindToReaction[item.kind], count: item._count._all })),
        serverNow: now().toISOString(),
      };
    },
    async recordView(actorId: string, postId: string) {
      await auth(actorId);
      return transaction(async tx => {
        const post = await readablePost(tx, postId);
        if (post.authorId === actorId) return { counted: false, viewCount: await tx.feedPostView.count({ where: { postId } }) };
        const result = await tx.feedPostView.createMany({ data: [{ postId, userId: actorId }], skipDuplicates: true });
        return { counted: result.count > 0, viewCount: await tx.feedPostView.count({ where: { postId } }) };
      });
    },
    async listNotifications(actorId: string, input: FeedListQuery = {}): Promise<FeedNotificationPageDto> {
      await auth(actorId);
      const q = s.feedParse(s.feedListSchema, input), c = decodeCursor(q.cursor);
      const rows = await db.feedNotification.findMany({
        where: { recipientId: actorId, ...(c ? { OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }] } : {}) },
        include: { post: { select: { status: true, deletedAt: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: q.pageSize + 1,
      });
      const page = rows.slice(0, q.pageSize);
      const actorIds = [...new Set(page.flatMap(row => row.actorIds))];
      const authors = await db.user.findMany({ where: { id: { in: actorIds } }, select: profile });
      const users = new Map(authors.map(user => [user.id, userDto(user)]));
      const items: FeedNotificationDto[] = page.map(row => ({
        id: row.id, kind: row.kind, postId: row.postId, commentId: row.commentId,
        actors: row.actorIds.flatMap(id => users.get(id) ? [users.get(id)!] : []),
        reaction: row.reaction ? kindToReaction[row.reaction] : null,
        actorCount: row.actorIds.length,
        createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null,
        targetAvailable: row.post.status === "published" && !row.post.deletedAt,
      }));
      return { items, nextCursor: rows.length > q.pageSize ? cursor(page[page.length - 1]!) : null, serverNow: now().toISOString() };
    },
    async unreadCount(actorId: string) {
      await auth(actorId);
      return { count: await db.feedNotification.count({ where: { recipientId: actorId, readAt: null } }) };
    },
    async markNotificationRead(actorId: string, notificationId: string) {
      await auth(actorId);
      await db.feedNotification.updateMany({ where: { id: notificationId, recipientId: actorId, readAt: null }, data: { readAt: now() } });
      const row = await db.feedNotification.findFirst({ where: { id: notificationId, recipientId: actorId } });
      if (!row) throw new FeedError("NOT_FOUND", undefined, 404);
      return { id: row.id, readAt: row.readAt?.toISOString() ?? now().toISOString() };
    },
    async markAllNotificationsRead(actorId: string) {
      await auth(actorId);
      const changed = await db.feedNotification.updateMany({ where: { recipientId: actorId, readAt: null }, data: { readAt: now() } });
      return { count: changed.count };
    },
  };
  return api;
}
export type FeedSocialService = ReturnType<typeof createFeedSocial>;
