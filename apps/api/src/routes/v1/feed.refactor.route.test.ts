import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ dispatch: vi.fn(), error: vi.fn() }));
vi.mock("@gafus/feed-server", () => ({
  dispatchFeedRequest: mocks.dispatch,
  feedHttpError: mocks.error,
  FEED_MAX_BODY_BYTES: 65_536,
}));
import {
  createMomentDraft, getMomentEditor, listMomentDrafts, saveMomentText,
  publishMomentDraft, deleteMomentDraft,
} from "../../../../../apps/web-vite/src/features/moments/momentComposerApi";
import { createTextDraftPoll } from
  "../../../../../apps/web-vite/src/features/moments/momentDraftPollApi";
import { feedClient } from
  "../../../../../apps/web-vite/src/features/moments/feedClient";
import { appendMomentMediaRevision, reorderMomentMedia } from
  "../../../../../apps/web-vite/src/features/moments/momentComposerApi";
import {
  getPublishedMomentEditor, savePublishedMomentText,
  publishPublishedMomentText,
} from "../../../../../apps/web-vite/src/features/moments/momentPublishedEditor";
import { feedRoutes } from "./feed";
import {
  getMomentsStatus, listMoments, getMoment, setMomentReaction, setMomentBookmark,
  listMomentComments, createMomentComment, listSavedMoments,
  listMomentReplies, editMomentComment, deleteMomentComment, setMomentCommentReaction,
  getMomentPoll, voteMomentPoll, listProfileMoments,
} from
  "../../../../../apps/web-vite/src/features/moments/momentsApi";

const actor = { id: "user-A", username: "a", role: "USER" } as const;
function app() {
  const api = new Hono();
  api.use("/api/v1/feed/*", async (c, next) => {
    c.set("user", actor);
    await next();
  });
  api.route("/api/v1/feed", feedRoutes);
  return api;
}

const post = {
  id: "post-1", author: { id: "private", name: "Автор",
    username: "author", role: null },
  status: "published", text: "Пост", attachments: [],
  createdAt: "2026-10-16T12:00:00.000Z",
  publishedAt: "2026-10-16T12:00:00.000Z",
  reactions: [], myReaction: null, viewCount: 1, commentCount: 0,
  canEdit: false,
};

beforeEach(() => {
  // Drop any queued once-return values left by an earlier assertion.
  // clearAllMocks resets history, but preserves queued responses and can make
  // unrelated feed scenarios pass/fail depending on preceding test order.
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  mocks.error.mockReturnValue({ status: 503,
    body: { success: false, error: "Feed unavailable", code: "FEED_DISABLED" } });
});

describe("Vite Web Moments reuse existing authenticated Hono Feed/Core", () => {
  it("status is no-store and delegates to server rollout gate with actor", async () => {
    mocks.dispatch.mockResolvedValue({ enabled: false, smartEnabled: false });
    const response = await app().request("/api/v1/feed/status");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.dispatch).toHaveBeenCalledWith(actor.id, expect.any(Request), "/status");
    vi.stubGlobal("fetch", vi.fn((path: string) => app().request(path)));
    expect(await getMomentsStatus()).toEqual({ enabled: false, smartEnabled: false });
  });

  it("page sort/cursor uses unchanged Feed HTTP protocol with no client authorization", async () => {
    mocks.dispatch.mockResolvedValue({
      items: [post], nextCursor: "cursor_next", serverNow: post.createdAt,
    });
    vi.stubGlobal("fetch", vi.fn((path: string) => app().request(path)));
    const result = await listMoments("popular", "previous");
    expect(result.items[0].id).toBe("post-1");
    expect(result.nextCursor).toBe("cursor_next");
    const request = mocks.dispatch.mock.calls[0][1] as Request;
    expect(mocks.dispatch.mock.calls[0][2]).toBe("/posts");
    expect(request.method).toBe("GET");
    expect(new URL(request.url).searchParams.get("sort")).toBe("popular");
    expect(new URL(request.url).searchParams.get("cursor")).toBe("previous");
    expect(new URL(request.url).searchParams.get("pageSize")).toBe("20");
    expect(JSON.stringify(result)).not.toContain('"private"');
  });

  it("post detail is read-only, authorization and visibility stay in Core", async () => {
    mocks.dispatch.mockResolvedValue(post);
    vi.stubGlobal("fetch", vi.fn((path: string) => app().request(path)));
    expect((await getMoment("post-1")).text).toBe("Пост");
    expect(mocks.dispatch).toHaveBeenCalledWith(
      actor.id, expect.any(Request), "/posts/post-1",
    );
    expect((mocks.dispatch.mock.calls[0][1] as Request).method).toBe("GET");
  });

  it("reactions reuse PUT/DELETE Feed HTTP adapter, server retains counter authority", async () => {
    mocks.dispatch.mockResolvedValue(post);
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, {
        method: options.method, headers: options.headers, body: options.body,
      }),
    ));
    await setMomentReaction("post-1", "❤️");
    await setMomentReaction("post-1", null);
    expect(mocks.dispatch.mock.calls.map(call => call[2]))
      .toEqual(["/posts/post-1/reaction", "/posts/post-1/reaction"]);
    expect((mocks.dispatch.mock.calls[0][1] as Request).method).toBe("PUT");
    expect(await (mocks.dispatch.mock.calls[0][1] as Request).json())
      .toEqual({ reaction: "❤️" });
    expect((mocks.dispatch.mock.calls[1][1] as Request).method).toBe("DELETE");
  });

  it("bookmark changes have explicit saved ACK and keep Core authorization", async () => {
    mocks.dispatch.mockResolvedValue({ saved: true });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, {
        method: options.method, headers: options.headers, body: options.body,
      }),
    ));
    expect(await setMomentBookmark("post-1", true)).toBe(true);
    expect(mocks.dispatch.mock.calls[0][2]).toBe("/posts/post-1/bookmark");
    expect((mocks.dispatch.mock.calls[0][1] as Request).method).toBe("PUT");
    expect(await (mocks.dispatch.mock.calls[0][1] as Request).json()).toEqual({});
  });

  it("comments follow existing Hono cursor query and Core's authenticated actor", async () => {
    mocks.dispatch.mockResolvedValue({ items: [], nextCursor: null });
    vi.stubGlobal("fetch", vi.fn((path: string) => app().request(path)));
    expect(await listMomentComments("post-1", "older")).toEqual({
      items: [], nextCursor: null,
    });
    expect(mocks.dispatch.mock.calls[0][2]).toBe("/posts/post-1/comments");
    const request = mocks.dispatch.mock.calls[0][1] as Request;
    expect(new URL(request.url).searchParams.get("cursor")).toBe("older");
    expect(new URL(request.url).searchParams.get("pageSize")).toBe("20");
  });

  it("comment creation keeps UUID stable and lets Core validate permission and quota", async () => {
    mocks.dispatch.mockResolvedValue({ id: "comment-1", postId: "post-1" });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, { method: options.method, body: options.body,
        headers: options.headers }),
    ));
    const clientRequestId = "550e8400-e29b-41d4-a716-446655440000";
    expect(await createMomentComment({ postId: "post-1", text: "Совет",
      clientRequestId })).toBe("comment-1");
    expect(mocks.dispatch.mock.calls[0][2]).toBe("/posts/post-1/comments");
    expect((mocks.dispatch.mock.calls[0][1] as Request).method).toBe("POST");
    expect(await (mocks.dispatch.mock.calls[0][1] as Request).json()).toEqual({
      text: "Совет", clientRequestId,
    });
  });

  it("nested replies retain Core rootId pagination with actor", async () => {
    mocks.dispatch.mockResolvedValue({ items: [], nextCursor: null });
    vi.stubGlobal("fetch", vi.fn((path: string) => app().request(path)));
    expect(await listMomentReplies("root-1", "older")).toEqual({
      items: [], nextCursor: null,
    });
    expect(mocks.dispatch.mock.calls[0][2]).toBe("/comments/root-1/replies");
    const req = mocks.dispatch.mock.calls[0][1] as Request;
    expect(new URL(req.url).searchParams.get("cursor")).toBe("older");
  });

  it("reply creation preserves target/UUID through unchanged Hono dispatcher", async () => {
    mocks.dispatch.mockResolvedValue({ id: "reply-1", postId: "post-1" });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, {
        method: options.method, headers: options.headers, body: options.body,
      }),
    ));
    const clientRequestId = "550e8400-e29b-41d4-a716-446655440000";
    expect(await createMomentComment({ postId: "post-1",
      text: "Ответ на ответ", replyToId: "child-1", clientRequestId })).toBe("reply-1");
    const req = mocks.dispatch.mock.calls[0][1] as Request;
    expect(mocks.dispatch.mock.calls[0][2]).toBe("/posts/post-1/comments");
    expect(await req.json()).toEqual({
      text: "Ответ на ответ", replyToId: "child-1", clientRequestId,
    });
  });

  it("comment PATCH/DELETE/reactions delegate rights and counters to Core", async () => {
    const comment = {
      id: "comment-1", text: "Изменено", postId: "post-1",
      author: { id: "hidden", name: "Автор", username: "a" },
      createdAt: "2026-10-16T12:00:00.000Z",
      deleted: false, rootId: null, replyToId: null, replyToName: null,
      replyCount: 0, canEdit: true, canDelete: true, reactions: [],
      myReaction: null,
    };
    mocks.dispatch.mockResolvedValueOnce(comment)
      .mockResolvedValueOnce({ id: "comment-1" })
      .mockResolvedValueOnce({ reaction: "❤️" });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, {
        method: options.method, headers: options.headers, body: options.body,
      }),
    ));
    await editMomentComment("comment-1", "Изменено");
    await deleteMomentComment("comment-1");
    await setMomentCommentReaction("comment-1", "❤️");
    expect(mocks.dispatch.mock.calls.map(call => call[2])).toEqual([
      "/comments/comment-1", "/comments/comment-1",
      "/comments/comment-1/reaction",
    ]);
    expect(mocks.dispatch.mock.calls.map(call =>
      (call[1] as Request).method)).toEqual(["PATCH", "DELETE", "PUT"]);
  });

  it("poll read/vote reuse existing Feed Hono without leaking Core vote authority", async () => {
    const poll = {
      id: "poll-1", postId: "post-1", question: "Что важнее?",
      isQuiz: false, allowMultiple: false, isAnonymous: false,
      closed: false, explanation: null, totalVotes: null, myOptionIds: [],
      options: [{ id: "opt-1", text: "Терпение", votes: null },
        { id: "opt-2", text: "Постепенность", votes: null }],
    };
    mocks.dispatch.mockResolvedValueOnce(poll)
      .mockResolvedValueOnce({ ...poll, myOptionIds: ["opt-1"] });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, { method: options.method,
        headers: options.headers, body: options.body }),
    ));
    expect((await getMomentPoll("post-1")).id).toBe("poll-1");
    expect((await voteMomentPoll("post-1", ["opt-1"])).myOptionIds)
      .toEqual(["opt-1"]);
    expect(mocks.dispatch.mock.calls.map(call => call[2])).toEqual([
      "/posts/post-1/poll", "/posts/post-1/poll/vote",
    ]);
    const body = await (mocks.dispatch.mock.calls[1][1] as Request).json();
    expect(body).toEqual({ optionIds: ["opt-1"] });
  });

  it("saved publications use authenticated Core bookmarks route, not local filtering", async () => {
    mocks.dispatch.mockResolvedValue({
      items: [post], nextCursor: null,
    });
    vi.stubGlobal("fetch", vi.fn((path: string) => app().request(path)));
    expect((await listSavedMoments("previous")).items).toHaveLength(1);
    expect(mocks.dispatch.mock.calls[0][2]).toBe("/me/bookmarks");
    const request = mocks.dispatch.mock.calls[0][1] as Request;
    expect(new URL(request.url).searchParams.get("cursor")).toBe("previous");
    expect(request.method).toBe("GET");
  });

  it("text-only post composer uses existing Hono create/revision/publish and actor", async () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const editor = {
      id: "post-1", status: "draft", version: 0, canEdit: true,
      text: "", attachments: [], pendingRevision: null,
    };
    mocks.dispatch.mockResolvedValueOnce(editor)
      .mockResolvedValueOnce({ ...editor, version: 1,
        pendingRevision: { text: "Текст", status: "draft", attachmentIds: [] } })
      .mockResolvedValueOnce({ ...editor, version: 1, status: "published",
        text: "Текст" });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, { method: options.method,
        headers: options.headers, body: options.body }),
    ));
    expect((await createMomentDraft(uuid)).id).toBe("post-1");
    expect((await saveMomentText({
      postId: "post-1", text: "Текст", clientRequestId: uuid,
      expectedVersion: 0,
    })).version).toBe(1);
    expect((await publishMomentDraft("post-1", uuid)).status).toBe("published");
    expect(mocks.dispatch.mock.calls.map(row => row[2])).toEqual([
      "/posts", "/posts/post-1/revisions", "/posts/post-1/publish",
    ]);
    expect(mocks.dispatch.mock.calls.map(row =>
      (row[1] as Request).method)).toEqual(["POST", "PUT", "POST"]);
    expect(mocks.dispatch.mock.calls.every(row => row[0] === actor.id)).toBe(true);
    expect(await (mocks.dispatch.mock.calls[1][1] as Request).json()).toEqual({
      text: "Текст", expectedVersion: 0, clientRequestId: uuid,
      attachmentIds: [],
    });
  });

  it("recover/inspect/delete draft stays within owner-scoped Core Hono", async () => {
    const editor = {
      id: "post-1", status: "draft", version: 0, canEdit: true,
      text: "", attachments: [], pendingRevision: null,
    };
    mocks.dispatch.mockResolvedValueOnce({ items: [editor], nextCursor: null })
      .mockResolvedValueOnce(editor)
      .mockResolvedValueOnce({ id: "post-1" });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, { method: options.method,
        headers: options.headers, body: options.body }),
    ));
    expect((await listMomentDrafts()).items).toHaveLength(1);
    expect((await getMomentEditor("post-1")).canEdit).toBe(true);
    expect(await deleteMomentDraft("post-1")).toBe("post-1");
    expect(mocks.dispatch.mock.calls.map(row => row[2])).toEqual([
      "/me/pending-posts", "/posts/post-1/editor", "/posts/post-1",
    ]);
    expect((mocks.dispatch.mock.calls[2][1] as Request).method).toBe("DELETE");
  });

  it("poll draft GET 200/null + shared Hono PUT uses Core expectedVersion", async () => {
    const serverPoll = {
      id: "poll-1", postId: "post-1", question: "Поможет ли спокойствие?",
      isQuiz: false, allowMultiple: false, isAnonymous: false,
      hideResults: false, shuffleOptions: false, closed: false,
      totalVotes: null, explanation: null, myOptionIds: [],
      options: [{ id: "option-1", text: "Да", votes: null },
        { id: "option-2", text: "Нет", votes: null }],
    };
    // Current author-only draft read contract is 200/null for no poll;
    // inaccessible drafts remain 404, which must never be swallowed.
    mocks.dispatch.mockResolvedValueOnce(null)
      .mockResolvedValueOnce(serverPoll).mockResolvedValueOnce(serverPoll);
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, { method: options.method,
        headers: options.headers, body: options.body }),
    ));
    const input = {
      postId: "post-1", expectedVersion: 1,
      poll: { question: "Поможет ли спокойствие?",
        allowMultiple: false, isQuiz: false, isAnonymous: false,
        hideResults: false, shuffleOptions: false,
        options: [{ text: "Да", isCorrect: false },
          { text: "Нет", isCorrect: false }] },
    };
    expect((await createTextDraftPoll(input)).postId).toBe("post-1");
    expect(mocks.dispatch.mock.calls.map(call => call[2])).toEqual([
      "/posts/post-1/draft-poll", "/posts/post-1/poll", "/posts/post-1/poll",
    ]);
    expect(mocks.dispatch.mock.calls.map(call =>
      (call[1] as Request).method)).toEqual(["GET", "PUT", "GET"]);
    expect(await (mocks.dispatch.mock.calls[1][1] as Request).json())
      .toMatchObject({ expectedVersion: 1, question: input.poll.question });
    expect(mocks.dispatch.mock.calls.every(call => call[0] === actor.id)).toBe(true);
  });

  it("profile publications route stays in Hono/Core with requester authorization", async () => {
    mocks.dispatch.mockResolvedValue({ items: [post], nextCursor: null });
    vi.stubGlobal("fetch", vi.fn((path: string) => app().request(path)));
    const page = await listProfileMoments("author", "before");
    expect(page.items[0].username).toBe("author");
    expect(mocks.dispatch).toHaveBeenCalledWith(
      actor.id, expect.any(Request), "/profiles/author/posts",
    );
    const req = mocks.dispatch.mock.calls[0][1] as Request;
    expect(req.method).toBe("GET");
    expect(new URL(req.url).searchParams.get("cursor")).toBe("before");
  });

  it("video reserve/complete remains owner-bound Hono Core contract", async () => {
    const clientRequestId = "550e8400-e29b-41d4-a716-446655440000";
    const ticket = {
      uploadId: "video-upload", postId: "post-1", mediaId: "media-video",
      kind: "video", status: "reserved", postFields: { key: "video-only" },
      postUrl: "https://example.invalid/upload",
      urlExpiresAt: "2099-01-01T00:00:00Z",
    };
    mocks.dispatch.mockResolvedValueOnce(ticket)
      .mockResolvedValueOnce({ ...ticket, status: "processing",
        postUrl: null, postFields: null });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, {
        method: options.method, headers: options.headers, body: options.body,
      }),
    ));
    const reserved = await feedClient.reserveUpload("post-1", {
      filename: "walk.mp4", kind: "video", declaredMime: "video/mp4",
      declaredBytes: 1024, clientRequestId,
    });
    expect(reserved.mediaId).toBe("media-video");
    const completed = await feedClient.completeUpload("video-upload");
    expect(completed.kind).toBe("video");
    expect(completed.status).toBe("processing");
    expect(mocks.dispatch.mock.calls.map(row => row[2])).toEqual([
      "/posts/post-1/uploads", "/uploads/video-upload/complete",
    ]);
    expect(mocks.dispatch.mock.calls.every(row => row[0] === actor.id)).toBe(true);
    expect(await (mocks.dispatch.mock.calls[0][1] as Request).json()).toEqual({
      filename: "walk.mp4", kind: "video", declaredMime: "video/mp4",
      declaredBytes: 1024, clientRequestId,
    });
  });

  it("presigned photo reservation, completion and linked revision reuse owner-bound Hono", async () => {
    const UUID = "550e8400-e29b-41d4-a716-446655440000";
    const ticket = {
      uploadId: "upload-1", postId: "post-1", mediaId: "media-1",
      kind: "photo", status: "reserved",
      postUrl: "https://cloud-store.example.invalid/post",
      postFields: { key: "owner-only" }, urlExpiresAt: "2099-01-01T00:00:00Z",
    };
    mocks.dispatch.mockResolvedValueOnce(ticket)
      .mockResolvedValueOnce({
        ...ticket, status: "uploaded", postUrl: null, postFields: null,
      })
      .mockResolvedValueOnce({
        id: "post-1", version: 2, status: "draft", canEdit: true,
        text: "", attachments: [], pendingRevision: {
          text: "Медиа черновик", attachmentIds: ["media-1"], status: "draft",
        },
      });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, { method: options.method,
        headers: options.headers, body: options.body }),
    ));
    const reserved = await feedClient.reserveUpload("post-1", {
      filename: "friend.webp", kind: "photo", declaredMime: "image/webp",
      declaredBytes: 123, clientRequestId: UUID,
    });
    expect(reserved.uploadId).toBe("upload-1");
    const completed = await feedClient.completeUpload("upload-1");
    expect(completed.status).toBe("uploaded");
    const updated = await appendMomentMediaRevision({
      editor: {
        id: "post-1", version: 1, status: "draft", canEdit: true,
        text: "", attachmentCount: 0, pendingRevision: {
          text: "Медиа черновик", attachmentIds: [], status: "draft",
        },
      },
      mediaId: completed.mediaId, clientRequestId: UUID,
    });
    expect(updated.pendingRevision?.attachmentIds).toEqual(["media-1"]);
    expect(mocks.dispatch.mock.calls.map(row => row[2])).toEqual([
      "/posts/post-1/uploads", "/uploads/upload-1/complete",
      "/posts/post-1/revisions",
    ]);
    expect(mocks.dispatch.mock.calls.map(row => (row[1] as Request).method))
      .toEqual(["POST", "POST", "PUT"]);
    expect(mocks.dispatch.mock.calls.every(row => row[0] === actor.id)).toBe(true);
    expect(await (mocks.dispatch.mock.calls[2][1] as Request).json()).toEqual({
      text: "Медиа черновик", attachmentIds: ["media-1"],
      expectedVersion: 1, clientRequestId: UUID,
    });
  });

  it("media-only draft and reorder preserve Core authority via existing Hono", async () => {
    const clientRequestId = "550e8400-e29b-41d4-a716-446655440000";
    const draft = {
      id: "post-1", status: "draft" as const, version: 0, text: "",
      canEdit: true, attachmentCount: 0, pendingRevision: null,
    };
    const first = {
      id: "post-1", status: "draft", version: 1, text: "",
      canEdit: true, attachments: [], pendingRevision: {
        status: "draft", text: "", attachmentIds: ["photo-1"],
      },
    };
    const next = { ...first, version: 2, pendingRevision: {
      ...first.pendingRevision, attachmentIds: ["photo-1", "video-1"],
    } };
    const reordered = { ...first, version: 3, pendingRevision: {
      ...first.pendingRevision, attachmentIds: ["video-1", "photo-1"],
    } };
    mocks.dispatch.mockResolvedValueOnce(first)
      .mockResolvedValueOnce(next).mockResolvedValueOnce(reordered);
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, { method: options.method,
        headers: options.headers, body: options.body }),
    ));
    const afterFirst = await appendMomentMediaRevision({
      editor: draft, mediaId: "photo-1", clientRequestId,
    });
    const afterSecond = await appendMomentMediaRevision({
      editor: afterFirst, mediaId: "video-1", clientRequestId,
    });
    const final = await reorderMomentMedia({
      editor: afterSecond, from: 0, to: 1, clientRequestId,
    });
    expect(final.pendingRevision?.attachmentIds)
      .toEqual(["video-1", "photo-1"]);
    expect(mocks.dispatch.mock.calls.map(call => call[2])).toEqual([
      "/posts/post-1/revisions",
      "/posts/post-1/revisions",
      "/posts/post-1/revisions",
    ]);
    expect(mocks.dispatch.mock.calls.every(call => call[0] === actor.id)).toBe(true);
    expect((await (mocks.dispatch.mock.calls[0][1] as Request).json()))
      .toMatchObject({ text: "", expectedVersion: 0,
        attachmentIds: ["photo-1"] });
    expect((await (mocks.dispatch.mock.calls[2][1] as Request).json()))
      .toMatchObject({ text: "", expectedVersion: 2,
        attachmentIds: ["video-1", "photo-1"] });
  });

  it("published text revision preserves media IDs through Hono Core and requires publish", async () => {
    const clientRequestId = "550e8400-e29b-41d4-a716-446655440000";
    const core = {
      id: "post-1", status: "published", version: 4, text: "Старый текст",
      canEdit: true, attachments: [
        { id: "photo-1" }, { id: "video-1" },
      ], pendingRevision: null,
    };
    const pending = { ...core, version: 5, pendingRevision: {
      status: "draft", text: "Новый текст", attachmentIds: ["photo-1", "video-1"],
    } };
    mocks.dispatch.mockResolvedValueOnce(core)
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce({ ...pending, pendingRevision: {
        ...pending.pendingRevision, status: "pending",
      } });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, {
        method: options.method, headers: options.headers, body: options.body,
      }),
    ));
    const editor = await getPublishedMomentEditor("post-1");
    const saved = await savePublishedMomentText({
      editor, text: "Новый текст", clientRequestId,
    });
    const confirmed = await publishPublishedMomentText(saved, clientRequestId);
    expect(confirmed.status).toBe("published");
    expect(confirmed.pendingRevision?.status).toBe("pending");
    expect(mocks.dispatch.mock.calls.map(row => row[2])).toEqual([
      "/posts/post-1/editor", "/posts/post-1/revisions",
      "/posts/post-1/publish",
    ]);
    expect(mocks.dispatch.mock.calls.map(row => (row[1] as Request).method))
      .toEqual(["GET", "PUT", "POST"]);
    expect(mocks.dispatch.mock.calls.every(row => row[0] === actor.id)).toBe(true);
    expect(await (mocks.dispatch.mock.calls[1][1] as Request).json()).toEqual({
      text: "Новый текст", attachmentIds: ["photo-1", "video-1"],
      expectedVersion: 4, clientRequestId,
    });
  });

  it("Core disabled/DB outage cannot masquerade as an empty Moments list", async () => {
    mocks.dispatch.mockRejectedValue(new Error("rollout off"));
    vi.stubGlobal("fetch", vi.fn((path: string) => app().request(path)));
    await expect(listMoments()).rejects.toMatchObject({ status: 503 });
    expect(mocks.error).toHaveBeenCalledTimes(1);
  });
});
