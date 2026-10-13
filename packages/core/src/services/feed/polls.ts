import { Prisma } from "@gafus/prisma";
import { createHash } from "node:crypto";
import type { FeedPollDto, FeedPollSaveInput, FeedPollVoteInput } from "@gafus/types";
import { FEED_LIMITS } from "../../../../types/src/feed";
import { FeedError } from "./errors";
import { assertFeedPublishingAllowed } from "./preferences";
import type { FeedDb, FeedStoragePort, FeedTx } from "./ports";
import { feedIdSchema, feedParse, feedPollSaveSchema, feedPollVoteSchema } from "./schemas";

/** Polls deliberately stay independent of edits to published FeedPostRevision text. */
export function createFeedPolls({ db, storage, now = () => new Date(), enabled = () => false }: {
  db: FeedDb;
  storage: Pick<FeedStoragePort, "signCdn">;
  now?: () => Date;
  enabled?: () => boolean;
}) {
  async function auth(actorId: string) {
    if (!enabled()) throw new FeedError("FEED_DISABLED", undefined, 503);
    feedParse(feedIdSchema, actorId);
    if (!await db.user.findUnique({ where: { id: actorId }, select: { id: true } })) {
      throw new FeedError("UNAUTHENTICATED", undefined, 401);
    }
  }
  const transact = <T>(fn: (tx: FeedTx) => Promise<T>) =>
    db.$transaction(fn, { maxWait: 10_000, timeout: 30_000 });
  async function lock(tx: FeedTx, postId: string, exclusive: boolean) {
    if (exclusive) {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "FeedPost" WHERE "id" = ${postId} FOR UPDATE`;
      if (!rows.length) throw new FeedError("NOT_FOUND", undefined, 404);
    } else {
      // Shared row lock permits parallel voters but serializes with soft deletion.
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "FeedPost" WHERE "id" = ${postId} FOR SHARE`;
      if (!rows.length) throw new FeedError("NOT_FOUND", undefined, 404);
    }
  }
  async function visiblePost(postId: string, actorId: string) {
    const row = await db.feedPost.findUnique({ where: { id: postId } });
    if (!row || row.deletedAt || row.status === "deleted" || row.moderationState !== "visible" ||
        (row.authorId !== actorId && (row.status !== "published" || !row.activeRevisionId))) {
      throw new FeedError("NOT_FOUND", undefined, 404);
    }
    return row;
  }
  async function render(actorId: string, postId: string): Promise<FeedPollDto> {
    const post = await visiblePost(postId, actorId);
    const poll = await db.feedPoll.findUnique({
      where: { postId },
      include: { options: { orderBy: { position: "asc" }, include: { imageMedia: true } } },
    });
    if (!poll) throw new FeedError("NOT_FOUND", undefined, 404);
    const at = now();
    const closed = !!poll.endDate && at >= poll.endDate;
    const [mine, counts, total] = await Promise.all([
      db.feedPollVoteSelection.findMany({ where: { pollId: poll.id, userId: actorId }, select: { optionId: true } }),
      db.feedPollVoteSelection.groupBy({ by: ["optionId"], where: { pollId: poll.id }, _count: { _all: true } }),
      db.feedPollVote.count({ where: { pollId: poll.id } }),
    ]);
    const myOptionIds = mine.map(row => row.optionId);
    const showResults = closed || (!poll.hideResults && (myOptionIds.length > 0 || post.authorId === actorId));
    const revealQuiz = poll.isQuiz && showResults && (closed || myOptionIds.length > 0 || post.authorId === actorId);
    const countsById = new Map(counts.map(row => [row.optionId, row._count._all]));
    const expiresAt = new Date(at.getTime() + FEED_LIMITS.mediaUrlSeconds * 1000);
    // Shuffle privately per viewer, keeping the order stable while results refresh.
    const orderedOptions = poll.shuffleOptions ? [...poll.options].sort((left, right) => {
      const rank = (id: string) => createHash("sha256").update(`${poll.id}:${actorId}:${id}`).digest("hex");
      return rank(left.id).localeCompare(rank(right.id));
    }) : poll.options;
    const options = await Promise.all(orderedOptions.map(async (option) => {
      const media = option.imageMedia;
      const validMedia = !!media && media.kind === "photo" && media.status === "ready" &&
        media.postId === post.id && media.ownerId === post.authorId &&
        !!media.thumbKey && !!media.fullKey;
      const url = validMedia && media.thumbKey ? await storage.signCdn({ key: media.thumbKey, expiresAt }) : null;
      return {
        id: option.id, position: option.position, text: option.text,
        imageMediaId: validMedia ? option.imageMediaId : null, imageUrl: url,
        votes: showResults ? countsById.get(option.id) ?? 0 : null,
        ...(revealQuiz ? { isCorrect: option.isCorrect } : {}),
      };
    }));
    return {
      id: poll.id, postId, question: poll.question,
      explanation: revealQuiz ? poll.explanation : null,
      allowMultiple: poll.allowMultiple, isQuiz: poll.isQuiz,
      isAnonymous: poll.isAnonymous, hideResults: poll.hideResults,
      shuffleOptions: poll.shuffleOptions, endDate: poll.endDate?.toISOString() ?? null,
      closed, totalVotes: showResults ? total : null, myOptionIds, options,
      canEdit: post.authorId === actorId && !post.publishedAt && !post.activeRevisionId &&
        (post.status === "draft" || post.status === "failed") && post.moderationState === "visible",
      serverNow: at.toISOString(),
    };
  }
  return {
    async get(actorId: string, postId: string) {
      await auth(actorId);
      feedParse(feedIdSchema, postId);
      return render(actorId, postId);
    },
    async save(actorId: string, postId: string, input: FeedPollSaveInput) {
      await auth(actorId);
      feedParse(feedIdSchema, postId);
      const value = feedParse(feedPollSaveSchema, input);
      const at = now();
      if (value.endDate && (new Date(value.endDate) <= at ||
          new Date(value.endDate).getTime() > at.getTime() + 365 * 24 * 60 * 60 * 1000)) {
        throw new FeedError("VALIDATION_ERROR", "Недопустимая дата окончания опроса", 400);
      }
      await transact(async tx => {
        await assertFeedPublishingAllowed(tx, actorId);
        await lock(tx, postId, true);
        const post = await tx.feedPost.findUnique({ where: { id: postId } });
        if (!post || post.authorId !== actorId || post.deletedAt || post.moderationState !== "visible") {
          throw new FeedError("NOT_FOUND", undefined, 404);
        }
        if (post.publishedAt || post.activeRevisionId || !["draft", "failed"].includes(post.status)) {
          throw new FeedError("VERSION_CONFLICT", "Опубликованный опрос нельзя изменять", 409);
        }
        if (post.version !== value.expectedVersion) throw new FeedError("VERSION_CONFLICT", undefined, 409);
        const mediaIds = [...new Set(value.options.map(option => option.imageMediaId).filter((id): id is string => !!id))];
        if (mediaIds.length) {
          // Dedicated poll photos are owned FeedMediaAssets, not gallery attachments.
          // Each must be fully processed, have the same post/author, and be a photo.
          const media = await tx.feedMediaAsset.findMany({
            where: { id: { in: mediaIds }, postId, ownerId: actorId, kind: "photo", status: "ready" },
            select: { id: true, thumbKey: true, fullKey: true },
          });
          if (media.length !== mediaIds.length || media.some(item => !item.thumbKey || !item.fullKey)) {
            throw new FeedError("VALIDATION_ERROR", "Изображение не готово или не принадлежит публикации", 400);
          }
        }
        const fields = {
          question: value.question, explanation: value.explanation ?? null,
          allowMultiple: value.allowMultiple, isQuiz: value.isQuiz,
          isAnonymous: value.isAnonymous, hideResults: value.hideResults,
          shuffleOptions: value.shuffleOptions,
          endDate: value.endDate ? new Date(value.endDate) : null,
        };
        const prior = await tx.feedPoll.findUnique({
          where: { postId }, include: { options: { orderBy: { position: "asc" } } },
        });
        if (prior) {
          if (await tx.feedPollVote.count({ where: { pollId: prior.id } })) {
            throw new FeedError("VERSION_CONFLICT", "Нельзя изменить опрос с голосами", 409);
          }
          // PUT is idempotent: replaying the same body preserves stable option IDs.
          const sameOptions = prior.options.length === value.options.length &&
            prior.options.every((option, position) => option.position === position &&
              option.text === value.options[position]!.text &&
              option.imageMediaId === (value.options[position]!.imageMediaId ?? null) &&
              option.isCorrect === value.options[position]!.isCorrect);
          const sameConfig = prior.question === fields.question &&
            prior.explanation === fields.explanation &&
            prior.allowMultiple === fields.allowMultiple && prior.isQuiz === fields.isQuiz &&
            prior.isAnonymous === fields.isAnonymous && prior.hideResults === fields.hideResults &&
            prior.shuffleOptions === fields.shuffleOptions &&
            (prior.endDate?.getTime() ?? null) === (fields.endDate?.getTime() ?? null);
          if (!sameOptions || !sameConfig) {
            await tx.feedPollOption.deleteMany({ where: { pollId: prior.id } });
            await tx.feedPoll.update({ where: { id: prior.id }, data: fields });
          } else return;
        } else {
          await tx.feedPoll.create({ data: { ...fields, postId } });
        }
        const poll = await tx.feedPoll.findUniqueOrThrow({ where: { postId }, select: { id: true } });
        await tx.feedPollOption.createMany({ data: value.options.map((option, position) => ({
          pollId: poll.id, position, text: option.text,
          imageMediaId: option.imageMediaId ?? null, isCorrect: option.isCorrect,
        })) });
      });
      return render(actorId, postId);
    },
    async remove(actorId: string, postId: string) {
      await auth(actorId);
      feedParse(feedIdSchema, postId);
      await transact(async tx => {
        await lock(tx, postId, true);
        const post = await tx.feedPost.findUnique({ where: { id: postId } });
        if (!post || post.authorId !== actorId || post.deletedAt || post.moderationState !== "visible") {
          throw new FeedError("NOT_FOUND", undefined, 404);
        }
        if (post.publishedAt || post.activeRevisionId || !["draft", "failed"].includes(post.status)) {
          throw new FeedError("VERSION_CONFLICT", "Опубликованный опрос нельзя удалить", 409);
        }
        await tx.feedPoll.deleteMany({ where: { postId } });
      });
      return { removed: true };
    },
    async vote(actorId: string, postId: string, input: FeedPollVoteInput) {
      await auth(actorId);
      feedParse(feedIdSchema, postId);
      const value = feedParse(feedPollVoteSchema, input);
      try {
        await transact(async tx => {
          await lock(tx, postId, false);
          const post = await tx.feedPost.findFirst({
            where: { id: postId, deletedAt: null, status: "published", moderationState: "visible",
              activeRevisionId: { not: null } },
            select: { id: true },
          });
          if (!post) throw new FeedError("NOT_FOUND", undefined, 404);
          const poll = await tx.feedPoll.findUnique({ where: { postId }, include: { options: true } });
          if (!poll) throw new FeedError("NOT_FOUND", undefined, 404);
          if (poll.endDate && now() >= poll.endDate) throw new FeedError("POLL_CLOSED", "Опрос завершён", 409);
          if (!poll.allowMultiple && value.optionIds.length !== 1) {
            throw new FeedError("VALIDATION_ERROR", "Можно выбрать только один вариант", 400);
          }
          const available = new Set(poll.options.map(option => option.id));
          if (value.optionIds.some(id => !available.has(id))) {
            throw new FeedError("VALIDATION_ERROR", "Недопустимый вариант ответа", 400);
          }
          const at = now();
          await tx.feedPollVote.create({ data: { pollId: poll.id, userId: actorId, updatedAt: at } });
          await tx.feedPollVoteSelection.createMany({
            data: value.optionIds.map(optionId => ({ pollId: poll.id, userId: actorId, optionId })),
          });
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new FeedError("ALREADY_VOTED", "Вы уже проголосовали", 409);
        }
        throw error;
      }
      return render(actorId, postId);
    },
  };
}
export type FeedPollService = ReturnType<typeof createFeedPolls>;
