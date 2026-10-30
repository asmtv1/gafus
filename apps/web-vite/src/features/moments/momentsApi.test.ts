import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getMoment, getMomentsStatus, listMoments, setMomentReaction, setMomentBookmark,
  listMomentComments, createMomentComment, listSavedMoments,
  listMomentReplies, editMomentComment, deleteMomentComment, setMomentCommentReaction,
  getMomentPoll, voteMomentPoll, changeMomentPollVote, cancelMomentPollVote,
  listProfileMoments, isSafeMomentUsername,
} from "./momentsApi";

const author = {
  id: "private-user-id", username: "trainer", name: "Кинолог",
  avatarUrl: "https://storage.example/avatar?secret=1", role: "TRAINER",
};
const post = {
  id: "post-1", author, status: "published", text: "Учимся спокойно ждать",
  attachments: [{
    id: "media-1", kind: "photo", position: 0, status: "ready",
    thumbUrl: "https://cdn.example/feed/medium.webp",
    fullUrl: "https://cdn.example/feed/full.webp",
    posterUrl: null, urlsExpireAt: "2026-10-16T14:00:00.000Z",
  }],
  createdAt: "2026-10-16T12:00:00.000Z",
  publishedAt: "2026-10-16T12:00:00.000Z", editedAt: null, editUntil: null,
  version: 1, reactions: [{ emoji: "❤️", count: 3 }], myReaction: null,
  viewCount: 20, commentCount: 2, canEdit: false, canDelete: false,
  hasPoll: true, bookmarked: false,
  moderationReason: "hidden-moderation-note",
  recommendationExposureToken: "secret-token",
};
function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200, data, error: "Core error",
  }), { status });
}
afterEach(() => vi.unstubAllGlobals());

describe("Moments browser/Shared Core read-only adapter", () => {
  it("status follows existing FEED_ENABLED/FEED_PROCESSOR_READY server gate", async () => {
    const fake = vi.fn()
      .mockResolvedValueOnce(ok({ enabled: false, smartEnabled: false }))
      .mockResolvedValueOnce(ok({ enabled: true, smartEnabled: true }));
    vi.stubGlobal("fetch", fake);
    expect(await getMomentsStatus()).toEqual({ enabled: false, smartEnabled: false });
    expect(await getMomentsStatus()).toEqual({ enabled: true, smartEnabled: true });
    expect(fake.mock.calls[0][0]).toBe("/api/v1/feed/status");
    expect(fake.mock.calls[0][1]).toMatchObject({
      method: "GET", credentials: "include", cache: "no-store",
    });
  });

  it("uses same cursor/sort contract as Mobile, preserves only safe display fields", async () => {
    const fake = vi.fn().mockResolvedValue(ok({
      items: [post], nextCursor: "next_cursor_123",
      serverNow: "2026-10-16T12:00:00.000Z",
      feedMeta: { mode: "new", rankingSessionId: "private-session" },
    }));
    vi.stubGlobal("fetch", fake);
    const page = await listMoments("new", "previous_cursor");
    expect(fake.mock.calls[0][0]).toBe(
      "/api/v1/feed/posts?cursor=previous_cursor&pageSize=20&sort=new",
    );
    expect(page.nextCursor).toBe("next_cursor_123");
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: "post-1", text: post.text, authorName: "Кинолог",
      username: "trainer", roleBadge: "Кинолог",
      createdAt: post.createdAt, publishedAt: post.publishedAt,
      reactions: [{ emoji: "❤️", count: 3 }], myReaction: null,
      commentCount: 2, viewCount: 20, bookmarked: false,
      hasPoll: true, canEdit: false,
      media: [{ id: "media-1", kind: "photo",
        url:"https://cdn.example/feed/medium.webp",
        mediumUrl:"https://cdn.example/feed/medium.webp",
        fullUrl:"https://cdn.example/feed/full.webp" }],
    });
    // V2 allows safe CDN presentation links, never source object metadata.
    expect(Object.keys(page.items[0].media[0])).not.toContain("urlsExpireAt");
    expect(JSON.stringify(page)).not.toMatch(
      /private-user-id|storage.example|secret-token|hidden-moderation-note|private-session/,
    );
  });

  it("detail is server-authorized and strips signed URLs and private author ids", async () => {
    const fake = vi.fn().mockResolvedValue(ok({
      ...post, author: { ...author, role: "ADMIN" },
    }));
    vi.stubGlobal("fetch", fake);
    const item = await getMoment("post-1");
    expect(item.roleBadge).toBe("Администратор");
    expect(JSON.stringify(item)).not.toContain("private-user-id");
    expect(fake.mock.calls[0][0]).toBe("/api/v1/feed/posts/post-1");
    await expect(getMoment("../admin")).rejects.toThrow("Некорректная");
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it("rejects spoofed sorting, malformed cursors and incorrect data before caching", async () => {
    const fake = vi.fn().mockResolvedValue(ok({
      items: [{ ...post, status: "draft" }], nextCursor: null,
    }));
    vi.stubGlobal("fetch", fake);
    await expect(listMoments("owner" as "new")).rejects.toThrow("Некорректные");
    await expect(listMoments("new", "x".repeat(2049))).rejects.toThrow("Некорректные");
    expect(fake).not.toHaveBeenCalled();
    await expect(listMoments()).rejects.toThrow("некорректную публикацию");
  });

  it("never returns a fake empty list on backend failure or a denied status", async () => {
    const fake = vi.fn().mockResolvedValue(ok(null, 503));
    vi.stubGlobal("fetch", fake);
    await expect(getMomentsStatus()).rejects.toMatchObject({ status: 503 });
    await expect(listMoments()).rejects.toMatchObject({ status: 503 });
  });

  it("sends explicit server-owned reaction and bookmark mutation, no optimistic count", async () => {
    const fake = vi.fn()
      .mockResolvedValueOnce(ok({ ...post, myReaction: "❤️",
        reactions: [{ emoji: "❤️", count: 4 }] }))
      .mockResolvedValueOnce(ok({ ...post, myReaction: null }))
      .mockResolvedValueOnce(ok({ saved: true }))
      .mockResolvedValueOnce(ok({ saved: false }));
    vi.stubGlobal("fetch", fake);
    const added = await setMomentReaction("post-1", "❤️");
    expect(added.myReaction).toBe("❤️");
    expect(added.reactions[0].count).toBe(4);
    const removed = await setMomentReaction("post-1", null);
    expect(removed.myReaction).toBeNull();
    expect(await setMomentBookmark("post-1", true)).toBe(true);
    expect(await setMomentBookmark("post-1", false)).toBe(false);
    expect(fake.mock.calls.map(call => call[0])).toEqual([
      "/api/v1/feed/posts/post-1/reaction",
      "/api/v1/feed/posts/post-1/reaction",
      "/api/v1/feed/posts/post-1/bookmark",
      "/api/v1/feed/posts/post-1/bookmark",
    ]);
    expect(fake.mock.calls.map(call => call[1].method))
      .toEqual(["PUT", "DELETE", "PUT", "DELETE"]);
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({ reaction: "❤️" });
    expect(JSON.parse(fake.mock.calls[2][1].body)).toEqual({});
  });

  it("bookmarks list reuses Core paging, private URLs removed from Query DTO", async () => {
    const fake = vi.fn().mockResolvedValue(ok({
      items: [{ ...post, bookmarked: true }], nextCursor: "next123",
    }));
    vi.stubGlobal("fetch", fake);
    const result = await listSavedMoments("previous");
    expect(fake.mock.calls[0][0])
      .toBe("/api/v1/feed/me/bookmarks?cursor=previous&pageSize=20");
    expect(result.nextCursor).toBe("next123");
    expect(result.items[0].bookmarked).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/private-user-id|storage.example|SECRET/);
    await expect(listSavedMoments("../".repeat(200)))
      .rejects.toThrow("Некорректный");
  });

  it("fails closed for wrong post IDs, unsupported emoji and mismatched bookmark ACK", async () => {
    const fake = vi.fn().mockImplementation(() => Promise.resolve(ok({ saved: false })));
    vi.stubGlobal("fetch", fake);
    await expect(setMomentReaction("../private", "❤️")).rejects.toThrow("Некорректная");
    await expect(setMomentReaction("post-1", "invalid" as "❤️"))
      .rejects.toThrow("Некорректная");
    await expect(setMomentBookmark("..", true)).rejects.toThrow("Некорректная");
    expect(fake).not.toHaveBeenCalled();
    await expect(setMomentBookmark("post-1", true)).rejects.toThrow("не подтвердил");
  });

  it("listComments reuses cursor contract and hides private author data", async () => {
    const fake = vi.fn().mockResolvedValue(ok({
      items: [{ id: "comment-1", postId: "post-1", text: "Полезно",
        author: { ...author, role: "ADMIN" }, createdAt: post.createdAt,
        deleted: false, rootId: null, replyToName: null, replyCount: 2,
        moderationState: "hidden-internal", replyToId: null,
        canEdit: false, canDelete: false, myReaction: null, reactions: [],
      }], nextCursor: "cursor-next", serverNow: post.createdAt,
    }));
    vi.stubGlobal("fetch", fake);
    const page = await listMomentComments("post-1", "cursor-before");
    expect(fake.mock.calls[0][0])
      .toBe("/api/v1/feed/posts/post-1/comments?cursor=cursor-before&pageSize=20");
    expect(page.nextCursor).toBe("cursor-next");
    expect(page.items).toEqual([{
      id: "comment-1", text: "Полезно", authorName: "Кинолог",
      username: "trainer", roleBadge: "Администратор",
      createdAt: post.createdAt, editedAt: null, deleted: false,
      rootId: null, replyToName: null, replyCount: 2,
      replyToId: null, canEdit: false, canDelete: false,
      myReaction: null, reactions: [],
      media: [], mediaProcessing: 0, mediaFailed: false,
    }]);
    expect(JSON.stringify(page)).not.toMatch(/private-user-id|storage.example|hidden-internal/);
  });

  it("new comments use idempotency UUID and shared Core text schema", async () => {
    const fake = vi.fn().mockResolvedValue(ok({
      id: "comment-A", postId: "post-1",
    }));
    vi.stubGlobal("fetch", fake);
    const UUID = "550e8400-e29b-41d4-a716-446655440000";
    await expect(createMomentComment({
      postId: "post-1", text: "  Спасибо!  ", clientRequestId: UUID,
    })).resolves.toBe("comment-A");
    expect(fake.mock.calls[0][0]).toBe("/api/v1/feed/posts/post-1/comments");
    expect(fake.mock.calls[0][1]).toMatchObject({
      method: "POST", cache: "no-store", credentials: "include",
    });
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({
      text: "Спасибо!", clientRequestId: UUID,
    });
  });

  it("comment validation prevents invalid IDs, text, cursors and mismatched ACK", async () => {
    const fake = vi.fn().mockImplementation(() => Promise.resolve(ok({
      id: "comment-1", postId: "another-post",
    })));
    vi.stubGlobal("fetch", fake);
    const UUID = "550e8400-e29b-41d4-a716-446655440000";
    const valid = { postId: "post-1", text: "Ответ", clientRequestId: UUID };
    await expect(listMomentComments("../user")).rejects.toThrow("Некорректные");
    await expect(listMomentComments("post-1", "a".repeat(513)))
      .rejects.toThrow("Некорректные");
    await expect(createMomentComment({ ...valid, text: " " }))
      .rejects.toThrow("Проверьте");
    await expect(createMomentComment({ ...valid, clientRequestId: "invalid" }))
      .rejects.toThrow("Проверьте");
    await expect(createMomentComment({ ...valid, replyToId: "../admin" }))
      .rejects.toThrow("Проверьте");
    expect(fake).not.toHaveBeenCalled();
    await expect(createMomentComment(valid)).rejects.toThrow("не подтвердил");
  });

  it("paginates rootId-scoped replies and rejects replies from other roots", async () => {
    const reply = {
      id: "reply-1", postId: "post-1", text: "Другой совет", author,
      createdAt: post.createdAt, rootId: "root-1", replyToId: "root-1",
      replyToName: "Автор", deleted: false, replyCount: 0, canEdit: true,
      canDelete: true, myReaction: null, reactions: [],
      moderationState: "hidden-private",
    };
    const fake = vi.fn()
      .mockResolvedValueOnce(ok({ items: [reply], nextCursor: "next" }))
      .mockResolvedValueOnce(ok({ items: [{ ...reply, rootId: "another" }],
        nextCursor: null }));
    vi.stubGlobal("fetch", fake);
    const page = await listMomentReplies("root-1", "before");
    expect(fake.mock.calls[0][0]).toBe(
      "/api/v1/feed/comments/root-1/replies?cursor=before&pageSize=20",
    );
    expect(page.items[0]).toMatchObject({
      id: "reply-1", rootId: "root-1", replyToId: "root-1", canEdit: true,
    });
    expect(JSON.stringify(page)).not.toMatch(/hidden-private|private-user-id|storage.example/);
    await expect(listMomentReplies("root-1")).rejects.toThrow("другой ветки");
    await expect(listMomentReplies("../admin")).rejects.toThrow("Некорректные");
    expect(fake).toHaveBeenCalledTimes(2);
  });

  it("create reply targets exact comment ID and preserves UUID", async () => {
    const fake = vi.fn().mockResolvedValue(ok({ id: "reply-1", postId: "post-1" }));
    vi.stubGlobal("fetch", fake);
    const clientRequestId = "550e8400-e29b-41d4-a716-446655440000";
    expect(await createMomentComment({
      postId: "post-1", text: "  Ответ на ветку  ", clientRequestId,
      replyToId: "child-1",
    })).toBe("reply-1");
    expect(fake.mock.calls[0][0]).toBe("/api/v1/feed/posts/post-1/comments");
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({
      text: "Ответ на ветку", replyToId: "child-1", clientRequestId,
    });
  });

  it("edit and delete require an exact ACK and cannot create client permissions", async () => {
    const comment = {
      id: "comment-1", postId: "post-1", text: "Изменено", author,
      createdAt: post.createdAt, rootId: null, replyToId: null, replyToName: null,
      deleted: false, replyCount: 0, canEdit: true, canDelete: true,
      myReaction: null, reactions: [],
    };
    const fake = vi.fn()
      .mockResolvedValueOnce(ok(comment))
      .mockResolvedValueOnce(ok({ id: "comment-1" }))
      .mockResolvedValueOnce(ok({ id: "other-comment" }));
    vi.stubGlobal("fetch", fake);
    expect(await editMomentComment("comment-1", "  Изменено  "))
      .toMatchObject({ text: "Изменено", canEdit: true });
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({ text: "Изменено" });
    expect(fake.mock.calls[0][1].method).toBe("PATCH");
    expect(await deleteMomentComment("comment-1")).toBe("comment-1");
    expect(fake.mock.calls[1][1].method).toBe("DELETE");
    await expect(deleteMomentComment("comment-1")).rejects.toThrow("не подтвердил");
    await expect(editMomentComment("../bad", "Совет")).rejects.toThrow("Проверьте");
    expect(fake).toHaveBeenCalledTimes(3);
  });

  it("comment reaction uses Core ACK and rejects forged or mismatched emoji", async () => {
    const fake = vi.fn()
      .mockResolvedValueOnce(ok({ reaction: "❤️" }))
      .mockResolvedValueOnce(ok({ reaction: null }))
      .mockResolvedValueOnce(ok({ reaction: "😂" }));
    vi.stubGlobal("fetch", fake);
    expect(await setMomentCommentReaction("comment-1", "❤️")).toBe("❤️");
    expect(await setMomentCommentReaction("comment-1", null)).toBeNull();
    expect(fake.mock.calls.map(call => call[0])).toEqual([
      "/api/v1/feed/comments/comment-1/reaction",
      "/api/v1/feed/comments/comment-1/reaction",
    ]);
    expect(fake.mock.calls.map(call => call[1].method)).toEqual(["PUT", "DELETE"]);
    await expect(setMomentCommentReaction("comment-1", "❤️"))
      .rejects.toThrow("не подтвердил");
    await expect(setMomentCommentReaction("../bad", "❤️"))
      .rejects.toThrow("Некорректная");
    await expect(setMomentCommentReaction("comment-1", "invalid" as "❤️"))
      .rejects.toThrow("Некорректная");
    expect(fake).toHaveBeenCalledTimes(3);
  });

  it("poll projection hides signed option image URLs and does not reveal results", async () => {
    const poll = {
      id: "poll-1", postId: "post-1", question: "Что помогает?",
      isQuiz: false, allowMultiple: false, isAnonymous: true,
      closed: false, explanation: null, totalVotes: null, myOptionIds: [],
      canEdit: true, serverNow: post.createdAt,
      options: [
        { id: "opt-1", text: "Терпение", votes: null, imageMediaId: "media-1",
          imageUrl: "https://private.cdn/secret?token=123", position: 0 },
        { id: "opt-2", text: "Награда", votes: null, imageMediaId: null,
          imageUrl: null, position: 1 },
      ],
    };
    const fake = vi.fn().mockResolvedValue(ok(poll));
    vi.stubGlobal("fetch", fake);
    const data = await getMomentPoll("post-1");
    expect(fake.mock.calls[0][0]).toBe("/api/v1/feed/posts/post-1/poll");
    expect(data.options).toEqual([
      { id: "opt-1", text: "Терпение", votes: null, isCorrect: null,
        hasImage: true },
      { id: "opt-2", text: "Награда", votes: null, isCorrect: null },
    ]);
    expect(JSON.stringify(data)).not.toMatch(/private.cdn|secret|media-1|canEdit/);
  });

  it("poll vote delegates exact option IDs and requires server selection ACK", async () => {
    const base = {
      id: "poll-1", postId: "post-1", question: "Викторина",
      isQuiz: true, allowMultiple: true, isAnonymous: false,
      closed: false, explanation: "Пояснение", totalVotes: 1,
      options: [{ id: "opt-1", text: "Первый", votes: 1, isCorrect: true },
        { id: "opt-2", text: "Второй", votes: 0, isCorrect: false }],
    };
    const fake = vi.fn()
      .mockResolvedValueOnce(ok({ ...base, myOptionIds: ["opt-1", "opt-2"] }))
      .mockResolvedValueOnce(ok({ ...base, myOptionIds: ["opt-2"] }));
    vi.stubGlobal("fetch", fake);
    expect((await voteMomentPoll("post-1", ["opt-1", "opt-2"])).myOptionIds)
      .toEqual(["opt-1", "opt-2"]);
    expect(fake.mock.calls[0][0]).toBe("/api/v1/feed/posts/post-1/poll/vote");
    expect(fake.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({
      optionIds: ["opt-1", "opt-2"],
    });
    await expect(voteMomentPoll("post-1", ["opt-1"]))
      .rejects.toThrow("не подтвердил");
  });

  it("poll guards invalid post, duplicate options, forged results and empty vote", async () => {
    const fake = vi.fn().mockResolvedValue(ok({
      id: "poll-1", postId: "post-1", question: "Что выбрать?",
      isQuiz: false, allowMultiple: false, isAnonymous: false,
      closed: false, explanation: null, totalVotes: null,
      myOptionIds: [], options: [
        { id: "a", text: "Первый", votes: 100 },
        { id: "b", text: "Второй", votes: 50 },
      ],
    }));
    vi.stubGlobal("fetch", fake);
    await expect(getMomentPoll("../other")).rejects.toThrow("Некорректная");
    await expect(voteMomentPoll("post-1", [])).rejects.toThrow("Проверьте");
    await expect(voteMomentPoll("post-1", ["opt-1", "opt-1"]))
      .rejects.toThrow("Проверьте");
    expect(fake).not.toHaveBeenCalled();
    await expect(getMomentPoll("post-1")).rejects.toThrow("некорректные результаты");
  });

  it("profile read scopes author and pagination through shared Core", async () => {
    const fake = vi.fn().mockResolvedValue(ok({
      items: [post], nextCursor: "next-1", serverNow: post.createdAt,
      feedMeta: { rankingSessionId: "secret" },
    }));
    vi.stubGlobal("fetch", fake);
    const page = await listProfileMoments("trainer", "older");
    expect(fake.mock.calls[0][0])
      .toBe("/api/v1/feed/profiles/trainer/posts?cursor=older&pageSize=20");
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe("next-1");
    expect(JSON.stringify(page)).not.toMatch(/storage.example|private-user-id|secret/);
    expect(isSafeMomentUsername("trainer")).toBe(true);
    expect(isSafeMomentUsername("../admin")).toBe(false);
  });

  it("profile API rejects malformed handles and cross-author page responses", async () => {
    const fake = vi.fn().mockResolvedValue(ok({
      items: [{ ...post, author: { ...author, username: "someone-else" } }],
      nextCursor: null,
    }));
    vi.stubGlobal("fetch", fake);
    await expect(listProfileMoments("../admin")).rejects.toThrow("Некорректный");
    await expect(listProfileMoments("trainer", "x".repeat(513)))
      .rejects.toThrow("Некорректный");
    expect(fake).not.toHaveBeenCalled();
    await expect(listProfileMoments("trainer"))
      .rejects.toThrow("другого автора");
  });

  it("rejects forged reaction counters and private media structures", async () => {
    const fake = vi.fn()
      .mockResolvedValueOnce(ok({ items: [{ ...post,
        reactions: [{ emoji: "❤️", count: -1 }] }], nextCursor: null }))
      .mockResolvedValueOnce(ok({ items: [{ ...post,
        attachments: [{ ...post.attachments[0], id: "../private" }] }],
      nextCursor: null }));
    vi.stubGlobal("fetch", fake);
    await expect(listMoments()).rejects.toThrow("некорректные реакции");
    await expect(listMoments()).rejects.toThrow("некорректное вложение");
  });
});


// SOC041_POLL_MUTATION_ADAPTERS: same existing Feed client + strict projection.
const pollWire = (ids: string[]) => ({
  id: "poll-1", postId: "post-1", question: "Обычный опрос",
  isQuiz: false, allowMultiple: true, isAnonymous: false,
  closed: false, explanation: null, totalVotes: ids.length ? 1 : null,
  myOptionIds: ids, options: [
    { id: "opt-1", text: "Первый", votes: ids.length ? Number(ids.includes("opt-1")) : null },
    { id: "opt-2", text: "Второй", votes: ids.length ? Number(ids.includes("opt-2")) : null },
  ],
});
describe("SOC041_POLL_MUTATION_ADAPTERS exact existing Feed PUT DELETE path", () => {
  it("valid PUT and DELETE preserve same authenticated no-store endpoint and DTO projection", async () => {
    const fake = vi.fn()
      .mockResolvedValueOnce(ok(pollWire(["opt-2"])))
      .mockResolvedValueOnce(ok(pollWire([])));
    vi.stubGlobal("fetch", fake);
    expect((await changeMomentPollVote("post-1", ["opt-2"])).myOptionIds).toEqual(["opt-2"]);
    expect((await cancelMomentPollVote("post-1")).myOptionIds).toEqual([]);
    expect(fake.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/feed/posts/post-1/poll/vote",
      "/api/v1/feed/posts/post-1/poll/vote",
    ]);
    expect(fake.mock.calls.map(([, opts]) => opts.method)).toEqual(["PUT", "DELETE"]);
    expect(fake.mock.calls[0][1]).toMatchObject({
      credentials: "include", cache: "no-store",
    });
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({ optionIds: ["opt-2"] });
    expect(JSON.parse(fake.mock.calls[1][1].body)).toEqual({});
  });

  it("rejects forged, duplicate, empty and mismatching option ACK, without replay", async () => {
    const fake = vi.fn().mockImplementation(() => Promise.resolve(ok(pollWire(["opt-1"]))));
    vi.stubGlobal("fetch", fake);
    await expect(changeMomentPollVote("../private", ["opt-1"])).rejects.toThrow("Проверьте");
    await expect(changeMomentPollVote("post-1", [])).rejects.toThrow("Проверьте");
    await expect(changeMomentPollVote("post-1", ["opt-1", "opt-1"]))
      .rejects.toThrow("Проверьте");
    await expect(cancelMomentPollVote("../private")).rejects.toThrow("Некорректная");
    expect(fake).not.toHaveBeenCalled();
    await expect(changeMomentPollVote("post-1", ["opt-2"]))
      .rejects.toThrow("не подтвердил");
    await expect(cancelMomentPollVote("post-1")).rejects.toThrow("не подтвердил");
    expect(fake).toHaveBeenCalledTimes(2);
  });
});
