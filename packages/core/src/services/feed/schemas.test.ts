import { describe, expect, it } from "vitest";
import {
  feedCommentSchema, feedCopyPhotoSchema, feedCreatePostSchema, feedListSchema, feedPostListSchema,
  feedParse, feedReactionSchema, feedRevisionSchema, feedUploadSchema,
} from "./schemas";
import { FeedError } from "./errors";
const uuid = "123e4567-e89b-42d3-a456-426614174000";

describe("feed input validation", () => {
  it("demands a UUID idempotency key and disallows extra fields", () => {
    expect(feedCreatePostSchema.safeParse({ clientRequestId: uuid }).success).toBe(true);
    expect(feedCreatePostSchema.safeParse({ clientRequestId: "feed-123" }).success).toBe(false);
    expect(feedCreatePostSchema.safeParse({ clientRequestId: uuid, authorId: "hacker" }).success).toBe(false);
  });
  it("prevents blank content, overlong text and duplicate/eleven attachments", () => {
    const base = { clientRequestId: uuid, expectedVersion: 0, text: "", attachmentIds: [] };
    expect(feedRevisionSchema.safeParse(base).success).toBe(false);
    expect(feedRevisionSchema.safeParse({ ...base, text: "🐶".repeat(5000) }).success).toBe(true);
    expect(feedRevisionSchema.safeParse({ ...base, text: "🐶".repeat(5001) }).success).toBe(false);
    expect(feedRevisionSchema.safeParse({ ...base, attachmentIds: ["same", "same"] }).success).toBe(false);
    expect(feedRevisionSchema.safeParse({ ...base, attachmentIds: Array.from({ length: 11 }, (_, n) => "a" + n) }).success).toBe(false);
    expect(feedRevisionSchema.safeParse({ ...base, attachmentIds: ["image_1"] }).success).toBe(true);
  });
  it("rejects spoofed upload type and oversized files", () => {
    const base = { filename: "photo.jpg", kind: "photo", declaredMime: "image/jpeg", declaredBytes: 1024, clientRequestId: uuid };
    expect(feedUploadSchema.safeParse(base).success).toBe(true);
    expect(feedUploadSchema.safeParse({ ...base, declaredMime: "video/mp4" }).success).toBe(false);
    expect(feedUploadSchema.safeParse({ ...base, declaredBytes: 10 * 1024 * 1024 + 1 }).success).toBe(false);
    expect(feedUploadSchema.safeParse({ ...base, kind: "video", declaredMime: "video/mp4", declaredBytes: 200 * 1024 * 1024 }).success).toBe(true);
    expect(feedUploadSchema.safeParse({ ...base, kind: "video", declaredMime: "video/mp4", declaredBytes: 200 * 1024 * 1024 + 1 }).success).toBe(false);
  });
  it("validates reactions, comments and paging", () => {
    expect(feedReactionSchema.safeParse({ reaction: "🐶" }).success).toBe(true);
    expect(feedReactionSchema.safeParse({ reaction: "👎" }).success).toBe(false);
    expect(feedCommentSchema.safeParse({ clientRequestId: uuid, text: " " }).success).toBe(false);
    expect(feedCommentSchema.safeParse({ clientRequestId: uuid, text: "🐶".repeat(2000) }).success).toBe(true);
    expect(feedCommentSchema.safeParse({ clientRequestId: uuid, text: "🐶".repeat(2001) }).success).toBe(false);
    expect(feedListSchema.safeParse({ pageSize: 50 }).success).toBe(true);
    expect(feedListSchema.safeParse({ pageSize: 51 }).success).toBe(false);
    expect(feedPostListSchema.parse({}).sort).toBe("new");
    expect(feedPostListSchema.safeParse({ sort: "popular" }).success).toBe(true);
    expect(feedPostListSchema.safeParse({ sort: "discussed" }).success).toBe(true);
    expect(feedPostListSchema.safeParse({ sort: "views" }).success).toBe(false);
    expect(feedCopyPhotoSchema.safeParse({ photoId: "../albums/private", clientRequestId: uuid }).success).toBe(false);
  });
  it("returns localized typed validation errors", () => {
    expect(() => feedParse(feedRevisionSchema, { clientRequestId: uuid, expectedVersion: 0, text: "", attachmentIds: [] }))
      .toThrow(FeedError);
    try {
      feedParse(feedRevisionSchema, { clientRequestId: uuid, expectedVersion: 0, text: "a".repeat(5001), attachmentIds: [] });
      throw new Error("Expected schema validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(FeedError);
      expect((error as FeedError).code).toBe("TEXT_TOO_LONG");
    }
  });
});

describe("poll request schemas", () => {
  it("bounds options, rejects invalid quizzes and duplicate selections", async () => {
    const { feedPollSaveSchema, feedPollVoteSchema } = await import("./schemas");
    const base = { expectedVersion: 0, question: "Выберите вариант", options: [
      { text: "Да" }, { text: "Нет" },
    ] };
    expect(feedPollSaveSchema.safeParse(base).success).toBe(true);
    expect(feedPollSaveSchema.safeParse({ ...base, options: [{ text: "Да" }] }).success).toBe(false);
    expect(feedPollSaveSchema.safeParse({ ...base, options: [{ text: "ДА" }, { text: "да" }] }).success).toBe(false);
    expect(feedPollSaveSchema.safeParse({ ...base, options: [{ text: "Да", isCorrect: true }, { text: "Нет" }] }).success).toBe(false);
    expect(feedPollSaveSchema.safeParse({ ...base, isQuiz: true }).success).toBe(false);
    expect(feedPollSaveSchema.safeParse({ ...base, isQuiz: true, options: [
      { text: "Да", isCorrect: true }, { text: "Нет" },
    ] }).success).toBe(true);
    expect(feedPollSaveSchema.safeParse({ ...base, isQuiz: true, options: [
      { text: "Да", isCorrect: true }, { text: "Нет", isCorrect: true },
    ] }).success).toBe(false);
    expect(feedPollSaveSchema.safeParse({ ...base, ownerId: "forged" }).success).toBe(false);
    expect(feedPollVoteSchema.safeParse({ optionIds: ["a", "a"] }).success).toBe(false);
    expect(feedPollVoteSchema.safeParse({ optionIds: [] }).success).toBe(false);
    expect(feedPollVoteSchema.safeParse({ optionIds: ["a"], userId: "forged" }).success).toBe(false);
  });
});
