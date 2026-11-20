import type { FeedPollDto } from "@gafus/types";
import {
  FeedError,
  createFeedPollRenderer,
  assertPollVoteAllowed,
  createFeedPollCommands,
  type FeedPollCommands,
  feedIdSchema,
  feedParse,
  type FeedPollReadOperations,
  type FeedStoragePort,
} from "@gafus/core/services/feed";
import { ensureFeedPublishingAllowed } from "./preferenceRows.js";
import type { FeedDb, FeedTx } from "@gafus/media-shared/media-db-ports";

/** Polls deliberately stay independent of edits to published FeedPostRevision text. */
/** Prisma's stable public error identity can be inspected without loading the
 * ORM into pure poll policy. Require the concrete named Error prototype, not
 * an arbitrary object that happens to contain a P2002 `code` property.
 */
function isUniqueVoteConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "PrismaClientKnownRequestError" &&
    error.constructor?.name === "PrismaClientKnownRequestError" &&
    "code" in error &&
    error.code === "P2002"
  );
}

export function createFeedPolls({
  db,
  storage,
  now = () => new Date(),
  enabled = () => false,
}: {
  db: FeedDb;
  storage: Pick<FeedStoragePort, "signCdn" | "longLivedUrls">;
  now?: () => Date;
  enabled?: () => boolean;
}) {
  async function auth(actorId: string) {
    if (!enabled()) throw new FeedError("FEED_DISABLED", undefined, 503);
    feedParse(feedIdSchema, actorId);
    if (!(await db.user.findUnique({ where: { id: actorId }, select: { id: true } }))) {
      throw new FeedError("UNAUTHENTICATED", undefined, 401);
    }
  }
  const transact = <T>(fn: (tx: FeedTx) => Promise<T>) =>
    db.$transaction(fn, { maxWait: 10_000, timeout: 30_000 });
  async function lock(tx: FeedTx, postId: string, exclusive: boolean) {
    if (exclusive) {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT "id" FROM "FeedPost" WHERE "id" = ${postId} FOR UPDATE`;
      if (!rows.length) throw new FeedError("NOT_FOUND", undefined, 404);
    } else {
      // Shared row lock permits parallel voters but serializes with soft deletion.
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT "id" FROM "FeedPost" WHERE "id" = ${postId} FOR SHARE`;
      if (!rows.length) throw new FeedError("NOT_FOUND", undefined, 404);
    }
  }
  const render = createFeedPollRenderer({
    rows: createPollReadOperations(db),
    storage,
    now,
  });
  // The same exclusive post lock serializes ordinary vote edits/cancels with other
  // edits and published-post deletion. One transaction owns both vote and choices.
  const commands: FeedPollCommands = {
    async closePoll(actorId, postId) {
      await transact(async (tx) => {
        await lock(tx, postId, true);
        const post = await tx.feedPost.findUnique({
          where: { id: postId },
          select: {
            authorId: true,
            deletedAt: true,
            status: true,
            activeRevisionId: true,
            moderationState: true,
          },
        });
        if (
          !post ||
          post.authorId !== actorId ||
          post.deletedAt ||
          post.moderationState !== "visible"
        )
          throw new FeedError("NOT_FOUND", undefined, 404);
        if (post.status !== "published" || !post.activeRevisionId)
          throw new FeedError("VERSION_CONFLICT", "Публикация ещё не опубликована", 409);
        const poll = await tx.feedPoll.findUnique({
          where: { postId },
          select: { id: true, endDate: true },
        });
        if (!poll) throw new FeedError("NOT_FOUND", undefined, 404);
        const closedAt = now();
        if (!poll.endDate || poll.endDate > closedAt)
          await tx.feedPoll.update({ where: { id: poll.id }, data: { endDate: closedAt } });
      });
    },
    async saveDraft(actorId, postId, value) {
      await transact(async (tx) => {
        await ensureFeedPublishingAllowed(tx, actorId);
        await lock(tx, postId, true);
        const post = await tx.feedPost.findUnique({ where: { id: postId } });
        if (
          !post ||
          post.authorId !== actorId ||
          post.deletedAt ||
          post.moderationState !== "visible"
        ) {
          throw new FeedError("NOT_FOUND", undefined, 404);
        }
        if (
          post.publishedAt ||
          post.activeRevisionId ||
          !["draft", "failed"].includes(post.status)
        ) {
          throw new FeedError("VERSION_CONFLICT", "Опубликованный опрос нельзя изменять", 409);
        }
        if (post.version !== value.expectedVersion)
          throw new FeedError("VERSION_CONFLICT", undefined, 409);
        const mediaIds = [
          ...new Set(
            value.options.map((option) => option.imageMediaId).filter((id): id is string => !!id),
          ),
        ];
        if (mediaIds.length) {
          // Dedicated poll photos are owned FeedMediaAssets, not gallery attachments.
          // Each must be fully processed, have the same post/author, and be a photo.
          const media = await tx.feedMediaAsset.findMany({
            where: {
              id: { in: mediaIds },
              postId,
              ownerId: actorId,
              kind: "photo",
              status: "ready",
              commentAttachments: { none: {} },
              OR: [{ upload: { is: null } }, { upload: { is: { purpose: "post" } } }],
            },
            select: { id: true, thumbKey: true, fullKey: true },
          });
          if (
            media.length !== mediaIds.length ||
            media.some((item) => !item.thumbKey || !item.fullKey)
          ) {
            throw new FeedError(
              "VALIDATION_ERROR",
              "Изображение не готово или не принадлежит публикации",
              400,
            );
          }
        }
        const fields = {
          question: value.question,
          explanation: value.explanation ?? null,
          allowMultiple: value.allowMultiple,
          isQuiz: value.isQuiz,
          isAnonymous: value.isAnonymous,
          hideResults: value.hideResults,
          shuffleOptions: value.shuffleOptions,
          endDate: value.endDate ? new Date(value.endDate) : null,
        };
        const prior = await tx.feedPoll.findUnique({
          where: { postId },
          include: { options: { orderBy: { position: "asc" } } },
        });
        if (prior) {
          if (await tx.feedPollVote.count({ where: { pollId: prior.id } })) {
            throw new FeedError("VERSION_CONFLICT", "Нельзя изменить опрос с голосами", 409);
          }
          // PUT is idempotent: replaying the same body preserves stable option IDs.
          const sameOptions =
            prior.options.length === value.options.length &&
            prior.options.every(
              (option, position) =>
                option.position === position &&
                option.text === value.options[position]!.text &&
                option.imageMediaId === (value.options[position]!.imageMediaId ?? null) &&
                option.isCorrect === value.options[position]!.isCorrect,
            );
          const sameConfig =
            prior.question === fields.question &&
            prior.explanation === fields.explanation &&
            prior.allowMultiple === fields.allowMultiple &&
            prior.isQuiz === fields.isQuiz &&
            prior.isAnonymous === fields.isAnonymous &&
            prior.hideResults === fields.hideResults &&
            prior.shuffleOptions === fields.shuffleOptions &&
            (prior.endDate?.getTime() ?? null) === (fields.endDate?.getTime() ?? null);
          if (!sameOptions || !sameConfig) {
            await tx.feedPollOption.deleteMany({ where: { pollId: prior.id } });
            await tx.feedPoll.update({ where: { id: prior.id }, data: fields });
          } else return;
        } else {
          await tx.feedPoll.create({ data: { ...fields, postId } });
        }
        const poll = await tx.feedPoll.findUniqueOrThrow({
          where: { postId },
          select: { id: true },
        });
        await tx.feedPollOption.createMany({
          data: value.options.map((option, position) => ({
            pollId: poll.id,
            position,
            text: option.text,
            imageMediaId: option.imageMediaId ?? null,
            isCorrect: option.isCorrect,
          })),
        });
      });
    },
    async deleteDraft(actorId, postId) {
      await transact(async (tx) => {
        await lock(tx, postId, true);
        const post = await tx.feedPost.findUnique({ where: { id: postId } });
        if (
          !post ||
          post.authorId !== actorId ||
          post.deletedAt ||
          post.moderationState !== "visible"
        ) {
          throw new FeedError("NOT_FOUND", undefined, 404);
        }
        if (
          post.publishedAt ||
          post.activeRevisionId ||
          !["draft", "failed"].includes(post.status)
        ) {
          throw new FeedError("VERSION_CONFLICT", "Опубликованный опрос нельзя удалить", 409);
        }
        await tx.feedPoll.deleteMany({ where: { postId } });
      });
    },
    async castVote(actorId, postId, value) {
      try {
        await transact(async (tx) => {
          await lock(tx, postId, false);
          const post = await tx.feedPost.findFirst({
            where: {
              id: postId,
              deletedAt: null,
              status: "published",
              moderationState: "visible",
              activeRevisionId: { not: null },
            },
            select: { id: true },
          });
          if (!post) throw new FeedError("NOT_FOUND", undefined, 404);
          const poll = await tx.feedPoll.findUnique({
            where: { postId },
            include: { options: true },
          });
          if (!poll) throw new FeedError("NOT_FOUND", undefined, 404);
          assertPollVoteAllowed(poll, now, value.optionIds);
          const at = now();
          await tx.feedPollVote.create({
            data: { pollId: poll.id, userId: actorId, updatedAt: at },
          });
          await tx.feedPollVoteSelection.createMany({
            data: value.optionIds.map((optionId) => ({
              pollId: poll.id,
              userId: actorId,
              optionId,
            })),
          });
        });
      } catch (error) {
        if (isUniqueVoteConflict(error)) {
          throw new FeedError("ALREADY_VOTED", "Вы уже проголосовали", 409);
        }
        throw error;
      }
    },
    async reviseVote(actorId, postId, value) {
      await transact(async (tx) => {
        await lock(tx, postId, true);
        const post = await tx.feedPost.findFirst({
          where: {
            id: postId,
            deletedAt: null,
            status: "published",
            moderationState: "visible",
            activeRevisionId: { not: null },
          },
          select: { id: true },
        });
        if (!post) throw new FeedError("NOT_FOUND", undefined, 404);
        const poll = await tx.feedPoll.findUnique({
          where: { postId },
          include: { options: true },
        });
        if (!poll) throw new FeedError("NOT_FOUND", undefined, 404);
        assertPollVoteAllowed(poll, now, value?.optionIds, true);
        const key = { pollId_userId: { pollId: poll.id, userId: actorId } };
        const vote = await tx.feedPollVote.findUnique({ where: key, select: { pollId: true } });
        if (!value) {
          // Deleting the actor-specific vote cascades its selections in the same tx.
          if (vote) await tx.feedPollVote.delete({ where: key });
          return;
        }
        if (!vote) throw new FeedError("VOTE_NOT_FOUND", "Вы ещё не голосовали", 409);
        const selected = await tx.feedPollVoteSelection.findMany({
          where: { pollId: poll.id, userId: actorId },
          select: { optionId: true },
        });
        const optionIds = value.optionIds;
        if (
          selected.length === optionIds.length &&
          selected.every((row) => optionIds.includes(row.optionId))
        )
          return;
        await tx.feedPollVoteSelection.deleteMany({ where: { pollId: poll.id, userId: actorId } });
        await tx.feedPollVoteSelection.createMany({
          data: optionIds.map((optionId) => ({ pollId: poll.id, userId: actorId, optionId })),
        });
        await tx.feedPollVote.update({ where: key, data: { updatedAt: now() } });
      });
    },
  };
  return {
    ...createFeedPollCommands(commands, auth, render, now),
    /** Public poll participants are opt-in, paged and authorize on EVERY read.
     * Anonymous results never disclose voter identities, even after close.
     * Locking the post row keeps moderation/deletion/close consistent.
     */
    async listVoters(
      actorId: string,
      postId: string,
      optionId: string,
      query: { cursor?: string | null; pageSize?: number } = {},
    ) {
      await auth(actorId);
      feedParse(feedIdSchema, postId);
      feedParse(feedIdSchema, optionId);
      const pageSize = query.pageSize ?? 10;
      if (
        !Number.isInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > 20 ||
        (query.cursor != null && !feedIdSchema.safeParse(query.cursor).success)
      )
        throw new FeedError("VALIDATION_ERROR", undefined, 400);
      return transact(async (tx) => {
        await lock(tx, postId, false);
        const post = await tx.feedPost.findFirst({
          where: {
            id: postId,
            status: "published",
            deletedAt: null,
            activeRevisionId: { not: null },
            moderationState: "visible",
          },
          select: { authorId: true },
        });
        if (!post) throw new FeedError("NOT_FOUND", undefined, 404);
        const poll = await tx.feedPoll.findUnique({
          where: { postId },
          select: {
            id: true,
            endDate: true,
            hideResults: true,
            isAnonymous: true,
            options: { select: { id: true } },
          },
        });
        if (!poll || poll.isAnonymous || !poll.options.some((option) => option.id === optionId))
          throw new FeedError("NOT_FOUND", undefined, 404);
        const closed = !!poll.endDate && now() >= poll.endDate;
        if (!closed) {
          if (poll.hideResults) throw new FeedError("NOT_FOUND", undefined, 404);
          if (post.authorId !== actorId) {
            const mySelection = await tx.feedPollVoteSelection.findFirst({
              where: { pollId: poll.id, userId: actorId },
              select: { optionId: true },
            });
            if (!mySelection) throw new FeedError("NOT_FOUND", undefined, 404);
          }
        }
        const rows = await tx.feedPollVote.findMany({
          where: {
            pollId: poll.id,
            selections: { some: { optionId } },
            ...(query.cursor ? { userId: { gt: query.cursor } } : {}),
          },
          select: {
            userId: true,
            user: {
              select: { username: true, profile: { select: { fullName: true, avatarUrl: true } } },
            },
          },
          orderBy: { userId: "asc" },
          take: pageSize + 1,
        });
        const page = rows.slice(0, pageSize);
        return {
          optionId,
          items: page.map((row) => ({
            id: row.userId,
            username: row.user.username,
            name: row.user.profile?.fullName || row.user.username,
            avatarUrl: row.user.profile?.avatarUrl ?? null,
          })),
          nextCursor: rows.length > pageSize ? page[page.length - 1]!.userId : null,
        };
      });
    },
    /** Manual close uses the same locked post row as votes/deletion; once closed,
     * an endDate in the past is never changed/reopened even by a repeated POST.
     * No migration is required and automatic deadlines retain their meaning.
     */
    /** Author-only editor read. No poll is a normal state, not an HTTP error.
     * Do not convert a missing/foreign/deleted post into a public "no poll". */
    async getDraftOptional(actorId: string, postId: string): Promise<FeedPollDto | null> {
      await auth(actorId);
      feedParse(feedIdSchema, postId);
      const post = await db.feedPost.findUnique({
        where: { id: postId },
        select: {
          authorId: true,
          status: true,
          deletedAt: true,
          publishedAt: true,
          activeRevisionId: true,
          moderationState: true,
        },
      });
      // Also allow reading an author-owned post during its draft -> pending ->
      // published transition: an in-flight editor GET must not yield a spurious
      // 404 just because media processing completed between two requests.
      if (
        !post ||
        post.authorId !== actorId ||
        post.deletedAt ||
        post.moderationState !== "visible" ||
        !["draft", "failed", "pending", "published"].includes(post.status)
      ) {
        throw new FeedError("NOT_FOUND", undefined, 404);
      }
      const saved = await db.feedPoll.findUnique({
        where: { postId },
        select: { id: true },
      });
      return saved ? render(actorId, postId) : null;
    },
  };
}
export type FeedPollService = ReturnType<typeof createFeedPolls>;

function createPollReadOperations(db: FeedDb): FeedPollReadOperations {
  return {
    readPost(postId) {
      return db.feedPost.findUnique({ where: { id: postId } });
    },
    readPoll(postId) {
      return db.feedPoll.findUnique({
        where: { postId },
        include: { options: { orderBy: { position: "asc" }, include: { imageMedia: true } } },
      });
    },
    async readResults(pollId, actorId) {
      const [mine, counts, total] = await Promise.all([
        db.feedPollVoteSelection.findMany({
          where: { pollId, userId: actorId },
          select: { optionId: true },
        }),
        db.feedPollVoteSelection.groupBy({
          by: ["optionId"],
          where: { pollId },
          _count: { _all: true },
        }),
        db.feedPollVote.count({ where: { pollId } }),
      ]);
      return {
        myOptionIds: mine.map((row) => row.optionId),
        counts: counts.map((row) => ({ optionId: row.optionId, count: row._count._all })),
        total,
      };
    },
  };
}
