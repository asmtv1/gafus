import { describe, expect, it } from "vitest";
import { feedCommentSchema, feedUploadSchema } from "./schemas";
import { FEED_LIMITS } from "../../../../types/src/feed";

const uuid = "550e8400-e29b-41d4-a716-446655440000";
describe("Feed Media V2 comment contracts", () => {
  it("accepts a comment consisting only of uploaded media", () => {
    expect(feedCommentSchema.parse({
      text: "   ", clientRequestId: uuid, mediaIds: ["photo_1", "video_1"],
    })).toMatchObject({ text: "", mediaIds: ["photo_1", "video_1"] });
  });
  it("rejects an empty comment, duplicate IDs, and excess media", () => {
    expect(feedCommentSchema.safeParse({ text: "", clientRequestId: uuid }).success).toBe(false);
    expect(feedCommentSchema.safeParse({
      text: "test", mediaIds: ["same", "same"], clientRequestId: uuid,
    }).success).toBe(false);
    expect(feedCommentSchema.safeParse({
      text: "", mediaIds: Array.from({ length: FEED_LIMITS.maxCommentAttachments + 1 },
        (_, index) => "photo_" + index), clientRequestId: uuid,
    }).success).toBe(false);
  });
  it("uses the existing photo/video reserve validation and optional scope", () => {
    const original = {
      clientRequestId: uuid, kind: "video" as const,
      filename: "short.mp4", declaredMime: "video/mp4" as const,
      declaredBytes: 200_000,
    };
    expect(feedUploadSchema.parse(original).purpose).toBeUndefined();
    expect(feedUploadSchema.parse({ ...original, purpose: "comment" }).purpose).toBe("comment");
    expect(feedUploadSchema.safeParse({ ...original, purpose: "unknown" }).success).toBe(false);
    expect(feedUploadSchema.safeParse({
      ...original, kind: "photo", declaredMime: "video/mp4",
    }).success).toBe(false);
  });
});
