import type { z } from "zod/v3";
import type { FeedPollSaveInput, FeedPollVoteInput } from "@gafus/types";
import { feedIdSchema, feedParse, feedPollSaveSchema, feedPollVoteSchema } from "./schemas";
import { stableMediaExpiry, stablePublicFeedExpiry } from "../mediaDelivery/signedExpiry";
import { createHash } from "node:crypto";
import { FEED_LIMITS, type FeedPollDto } from "@gafus/types";
import { FeedError } from "./errors";
import type { FeedStoragePort } from "./ports";

interface PollPost {
  id: string;
  authorId: string;
  deletedAt: Date | null;
  publishedAt: Date | null;
  status: string;
  moderationState: string;
  activeRevisionId: string | null;
}

interface PollOption {
  id: string;
  position: number;
  text: string;
  imageMediaId: string | null;
  isCorrect: boolean;
  imageMedia: {
    kind: string;
    status: string;
    postId: string;
    ownerId: string;
    thumbKey: string | null;
    fullKey: string | null;
  } | null;
}

interface PollProjection {
  id: string;
  question: string;
  explanation: string | null;
  allowMultiple: boolean;
  isQuiz: boolean;
  isAnonymous: boolean;
  hideResults: boolean;
  shuffleOptions: boolean;
  endDate: Date | null;
  options: PollOption[];
}

export interface FeedPollReadOperations {
  readPost(postId: string): Promise<PollPost | null>;
  readPoll(postId: string): Promise<PollProjection | null>;
  readResults(
    pollId: string,
    actorId: string,
  ): Promise<{
    myOptionIds: string[];
    counts: { optionId: string; count: number }[];
    total: number;
  }>;
}

function assertPollPostVisible(row: PollPost | null, actorId: string): asserts row is PollPost {
  if (
    !row ||
    row.deletedAt ||
    row.status === "deleted" ||
    row.moderationState !== "visible" ||
    (row.authorId !== actorId && (row.status !== "published" || !row.activeRevisionId))
  ) {
    throw new FeedError("NOT_FOUND", undefined, 404);
  }
}

export function assertPollVoteAllowed(
  poll: {
    isQuiz: boolean;
    endDate: Date | null;
    allowMultiple: boolean;
    options: { id: string }[];
  },
  now: () => Date,
  optionIds?: string[],
  changing = false,
) {
  if (changing && poll.isQuiz)
    throw new FeedError("QUIZ_VOTE_LOCKED", "Голос викторины нельзя изменить", 409);
  if (poll.endDate && now() >= poll.endDate)
    throw new FeedError("POLL_CLOSED", "Опрос завершён", 409);
  if (!optionIds) return;
  if (!poll.allowMultiple && optionIds.length !== 1) {
    throw new FeedError("VALIDATION_ERROR", "Можно выбрать только один вариант", 400);
  }
  const available = new Set(poll.options.map((option) => option.id));
  if (optionIds.some((id) => !available.has(id))) {
    throw new FeedError("VALIDATION_ERROR", "Недопустимый вариант ответа", 400);
  }
}

export function createFeedPollRenderer({
  rows,
  storage,
  now,
}: {
  rows: FeedPollReadOperations;
  storage: Pick<FeedStoragePort, "signCdn" | "longLivedUrls">;
  now: () => Date;
}) {
  return async function render(actorId: string, postId: string): Promise<FeedPollDto> {
    const post = await rows.readPost(postId);
    assertPollPostVisible(post, actorId);
    const poll = await rows.readPoll(postId);
    if (!poll) throw new FeedError("NOT_FOUND", undefined, 404);
    const at = now();
    const closed = !!poll.endDate && at >= poll.endDate;
    const { myOptionIds, counts, total } = await rows.readResults(poll.id, actorId);
    const showResults =
      closed || (!poll.hideResults && (myOptionIds.length > 0 || post.authorId === actorId));
    const revealQuiz =
      poll.isQuiz && showResults && (closed || myOptionIds.length > 0 || post.authorId === actorId);
    const countsById = new Map(counts.map((row) => [row.optionId, row.count]));
    const expiresAt =
      storage.longLivedUrls === true
        ? stablePublicFeedExpiry(at)
        : stableMediaExpiry(at, FEED_LIMITS.mediaUrlSeconds);
    // Shuffle privately per viewer, keeping the order stable while results refresh.
    const orderedOptions = poll.shuffleOptions
      ? [...poll.options].sort((left, right) => {
          const rank = (id: string) =>
            createHash("sha256").update(`${poll.id}:${actorId}:${id}`).digest("hex");
          return rank(left.id).localeCompare(rank(right.id));
        })
      : poll.options;
    const options = await Promise.all(
      orderedOptions.map(async (option) => {
        const media = option.imageMedia;
        const validMedia =
          !!media &&
          media.kind === "photo" &&
          media.status === "ready" &&
          media.postId === post.id &&
          media.ownerId === post.authorId &&
          !!media.thumbKey &&
          !!media.fullKey;
        const url =
          validMedia && media.thumbKey
            ? await storage.signCdn({ key: media.thumbKey, expiresAt })
            : null;
        return {
          id: option.id,
          position: option.position,
          text: option.text,
          imageMediaId: validMedia ? option.imageMediaId : null,
          imageUrl: url,
          votes: showResults ? (countsById.get(option.id) ?? 0) : null,
          ...(revealQuiz ? { isCorrect: option.isCorrect } : {}),
        };
      }),
    );
    return {
      id: poll.id,
      postId,
      question: poll.question,
      explanation: revealQuiz ? poll.explanation : null,
      allowMultiple: poll.allowMultiple,
      isQuiz: poll.isQuiz,
      isAnonymous: poll.isAnonymous,
      hideResults: poll.hideResults,
      shuffleOptions: poll.shuffleOptions,
      endDate: poll.endDate?.toISOString() ?? null,
      closed,
      totalVotes: showResults ? total : null,
      myOptionIds,
      options,
      canClose:
        !closed &&
        post.authorId === actorId &&
        post.status === "published" &&
        !!post.activeRevisionId &&
        post.moderationState === "visible",
      canEdit:
        post.authorId === actorId &&
        !post.publishedAt &&
        !post.activeRevisionId &&
        (post.status === "draft" || post.status === "failed") &&
        post.moderationState === "visible",
      serverNow: at.toISOString(),
    };
  };
}

export interface FeedPollCommands {
  closePoll(actorId: string, postId: string): Promise<void>;
  saveDraft(
    actorId: string,
    postId: string,
    value: z.output<typeof feedPollSaveSchema>,
  ): Promise<void>;
  deleteDraft(actorId: string, postId: string): Promise<void>;
  reviseVote(actorId: string, postId: string, value: FeedPollVoteInput | null): Promise<void>;
  castVote(actorId: string, postId: string, value: FeedPollVoteInput): Promise<void>;
}

export function createFeedPollCommands(
  commands: FeedPollCommands,
  assertActor: (actorId: string) => Promise<void>,
  render: (actorId: string, postId: string) => Promise<FeedPollDto>,
  now: () => Date,
) {
  async function validateActorAndPost(actorId: string, postId: string) {
    await assertActor(actorId);
    feedParse(feedIdSchema, postId);
  }

  return {
    async get(actorId: string, postId: string) {
      await validateActorAndPost(actorId, postId);
      return render(actorId, postId);
    },
    async close(actorId: string, postId: string) {
      await validateActorAndPost(actorId, postId);
      await commands.closePoll(actorId, postId);
      return render(actorId, postId);
    },
    async save(actorId: string, postId: string, input: FeedPollSaveInput) {
      await validateActorAndPost(actorId, postId);
      const value = feedParse(feedPollSaveSchema, input);
      const at = now();
      if (
        value.endDate &&
        (new Date(value.endDate) <= at ||
          new Date(value.endDate).getTime() > at.getTime() + 365 * 24 * 60 * 60 * 1000)
      ) {
        throw new FeedError("VALIDATION_ERROR", "Недопустимая дата окончания опроса", 400);
      }
      await commands.saveDraft(actorId, postId, value);
      return render(actorId, postId);
    },
    async remove(actorId: string, postId: string) {
      await validateActorAndPost(actorId, postId);
      await commands.deleteDraft(actorId, postId);
      return { removed: true };
    },
    async changeVote(actorId: string, postId: string, input: FeedPollVoteInput) {
      await validateActorAndPost(actorId, postId);
      await commands.reviseVote(actorId, postId, feedParse(feedPollVoteSchema, input));
      return render(actorId, postId);
    },
    async cancelVote(actorId: string, postId: string) {
      await validateActorAndPost(actorId, postId);
      await commands.reviseVote(actorId, postId, null);
      return render(actorId, postId);
    },
    async vote(actorId: string, postId: string, input: FeedPollVoteInput) {
      await validateActorAndPost(actorId, postId);
      await commands.castVote(actorId, postId, feedParse(feedPollVoteSchema, input));
      return render(actorId, postId);
    },
  };
}
