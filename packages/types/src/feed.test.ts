import { describe, expect, it, vi } from "vitest";
import {
  FEED_LIMITS,
  FEED_ERROR_MESSAGES,
  FEED_REACTIONS,
  countFeedCharacters,
  createFeedClient,
  formatFeedTime,
  getFeedClockOffsetMs,
  getFeedCompositionError,
  getFeedCommentError,
  getFeedAuthorRoleBadge,
  isFeedReaction,
  type FeedTransport,
} from "./feed";

describe("feed contracts", () => {
  it("shows privileged author badges only for ADMIN and TRAINER", () => {
    expect(getFeedAuthorRoleBadge("ADMIN")).toBe("Администратор");
    expect(getFeedAuthorRoleBadge("TRAINER")).toBe("Кинолог");
    for (const role of ["USER", "MODERATOR", "PARTNER", "", null, undefined]) {
      expect(getFeedAuthorRoleBadge(role)).toBeNull();
    }
  });

  it("matches agreed limits", () => {
    expect(FEED_LIMITS.postCharacters).toBe(5000);
    expect(FEED_LIMITS.maxAttachments).toBe(10);
    expect(FEED_LIMITS.maxVideos).toBe(3);
    expect(FEED_LIMITS.videoSeconds).toBe(120);
    expect(FEED_ERROR_MESSAGES.VIDEO_TOO_LONG).toContain("120 секунд");
    expect(FEED_REACTIONS).toEqual(["❤️", "😂", "🐶", "🔥", "👍"]);
    expect(countFeedCharacters("🐶🐶")).toBe(2);
    expect(countFeedCharacters("a🐶b")).toBe(3);
  });

  it("checks empty posts, Unicode, attachments, videos and unsupported reactions", () => {
    expect(getFeedCompositionError("", [])).toBe("EMPTY_POST");
    expect(getFeedCompositionError("  ", [])).toBe("EMPTY_POST");
    expect(getFeedCompositionError("🐶".repeat(5000), [])).toBeNull();
    expect(getFeedCompositionError("🐶".repeat(5001), [])).toBe("TEXT_TOO_LONG");
    expect(getFeedCompositionError("", Array.from({ length: 10 }, () => ({ kind: "photo" })))).toBeNull();
    expect(getFeedCompositionError("", Array.from({ length: 11 }, () => ({ kind: "photo" })))).toBe("ATTACHMENT_LIMIT");
    expect(getFeedCompositionError("", Array.from({ length: 4 }, () => ({ kind: "video" })))).toBe("VIDEO_LIMIT");
    expect(getFeedCompositionError("", [{ kind: "video" }])).toBeNull();
    expect(isFeedReaction("😂")).toBe(true);
    expect(isFeedReaction("❤️")).toBe(true);
    expect(isFeedReaction("😡")).toBe(false);
    expect(isFeedReaction(undefined)).toBe(false);
    expect(getFeedCommentError("")).toBe("VALIDATION_ERROR");
    expect(getFeedCommentError("🐶".repeat(2000))).toBeNull();
    expect(getFeedCommentError("🐶".repeat(2001))).toBe("COMMENT_TOO_LONG");
  });

  it("uses elapsed time and correct Russian plurals", () => {
    const nowMs = Date.parse("2026-10-09T12:00:00.000Z");
    const age = (milliseconds: number) =>
      formatFeedTime(new Date(nowMs - milliseconds).toISOString(), { nowMs, timeZone: "UTC" });
    expect(age(59_999)).toBe("Только что");
    expect(age(60_000)).toBe("1 минуту назад");
    expect(age(2 * 60_000)).toBe("2 минуты назад");
    expect(age(5 * 60_000)).toBe("5 минут назад");
    expect(age(11 * 60_000)).toBe("11 минут назад");
    expect(age(21 * 60_000)).toBe("21 минуту назад");
    expect(age(59 * 60_000)).toBe("59 минут назад");
    expect(age(60 * 60_000)).toBe("1 час назад");
    expect(age(2 * 3_600_000)).toBe("2 часа назад");
    expect(age(5 * 3_600_000)).toBe("5 часов назад");
    expect(age(11 * 3_600_000)).toBe("11 часов назад");
    expect(age(21 * 3_600_000)).toBe("21 час назад");
    expect(age(86_400_000 - 1)).toBe("23 часа назад");
    expect(age(86_400_000)).toBe("8 октября 2026");
  });

  it("uses server offset if device time is wrong and handles future timestamps", () => {
    const serverNow = "2026-10-09T12:00:00.000Z";
    const serverTime = Date.parse(serverNow);
    const wrongDeviceTime = serverTime - 86_400_000;
    const offsetMs = getFeedClockOffsetMs(serverNow, wrongDeviceTime);
    expect(offsetMs).toBe(86_400_000);
    expect(
      formatFeedTime("2026-10-09T11:58:00.000Z", {
        nowMs: wrongDeviceTime,
        offsetMs,
      }),
    ).toBe("2 минуты назад");
    expect(formatFeedTime("2026-10-09T12:01:00.000Z", { nowMs: serverTime })).toBe("Только что");
    expect(formatFeedTime("bad", { nowMs: serverTime })).toBe("");
    expect(getFeedClockOffsetMs("bad", wrongDeviceTime)).toBe(0);
  });

  it("creates paths relative to /api/v1/feed and does not perform its own fetch", async () => {
    const transport = vi.fn(async <T>(path: string, opts?: unknown): Promise<T> => ({ path, opts }) as T);
    const client = createFeedClient(transport as unknown as FeedTransport);
    await client.listProfilePosts("пользователь /test", { pageSize: 20, cursor: "xyz/2" });
    expect(transport).toHaveBeenCalledWith(
      "profiles/%D0%BF%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D1%8C%20%2Ftest/posts?cursor=xyz%2F2&pageSize=20",
    );
    await client.saveRevision("post", {
      clientRequestId: "once",
      expectedVersion: 4,
      text: "Новый текст",
      attachmentIds: ["b", "a"],
    });
    expect(transport).toHaveBeenLastCalledWith("posts/post/revisions", {
      method: "PUT",
      body: {
        clientRequestId: "once",
        expectedVersion: 4,
        text: "Новый текст",
        attachmentIds: ["b", "a"],
      },
    });
    await client.setPostReaction("id", "🐶");
    expect(transport).toHaveBeenLastCalledWith("posts/id/reaction", {
      method: "PUT",
      body: { reaction: "🐶" },
    });
  });
});
