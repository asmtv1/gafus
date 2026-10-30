import {
  validateFeedPollDraft, type FeedPollDraft,
} from "@gafus/types";
import { feedClient } from "./feedClient";
import { getMomentDraftPoll, getMomentPoll, type MomentPoll } from "./momentsApi";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const rec = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? v as Record<string, unknown> : null;

export async function getExistingDraftPoll(postId: string): Promise<MomentPoll | null> {
  // Only an explicit 200/null means an absent poll. Never swallow genuine
  // 404 for missing, deleted or foreign drafts.
  return getMomentDraftPoll(postId);
}

/** Creation-only phase: never silently overwrite a poll authored on another device. */
export async function createTextDraftPoll(input: {
  postId: string;
  expectedVersion: number;
  poll: FeedPollDraft;
  allowInitialVersion?: boolean;
  /** Option IDs came from server-verified READY Feed photo uploads in this actor. */
  confirmedProcessedOptionImages?: boolean;
}): Promise<MomentPoll> {
  if (!ID.test(input.postId) || !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion < (input.allowInitialVersion ? 0 : 1) ||
      input.poll.options.some(option => option.imageMediaId != null &&
        (!input.confirmedProcessedOptionImages || typeof option.imageMediaId !== "string" ||
          !ID.test(option.imageMediaId)))) {
    throw new Error("Некорректные параметры опроса");
  }
  const error = validateFeedPollDraft(input.poll);
  if (error) throw new Error(error);
  // Fetch first and refuse replacing any pre-existing poll.
  const prior = await getExistingDraftPoll(input.postId);
  if (prior) throw new Error("У публикации уже есть опрос");
  const saved = rec(await feedClient.savePoll(input.postId, {
    ...input.poll, expectedVersion: input.expectedVersion,
  }));
  if (!saved || saved.postId !== input.postId ||
      saved.question !== input.poll.question.trim() ||
      !Array.isArray(saved.options) ||
      saved.options.length !== input.poll.options.length) {
    throw new Error("Сервер не подтвердил опрос");
  }
  return getMomentPoll(input.postId);
}
