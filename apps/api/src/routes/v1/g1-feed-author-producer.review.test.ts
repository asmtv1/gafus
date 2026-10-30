/** AG1 producer admission: actual signed JWT Hono, synthetic feed dispatcher. */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  prisma: { user: { findUnique: async ({ where }: { where: { id: string } }) => ({
    sessionsRevokedAt: null, registrationPending: false,
    role: where.id === "ag2feed_author_a_20261018" ? "TRAINER" : "USER",
  }) } },
}));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: async () => true }));
vi.mock("@gafus/feed-server", () => ({
  FEED_MAX_BODY_BYTES: 65536,
  dispatchFeedRequest: dispatch,
  feedHttpError: (error: unknown) => ({ status: 404, body: {
    success: false, code: "NOT_FOUND", error: error instanceof Error ? "Не найдено" : "Ошибка",
  } }),
}));
import { generateAccessToken } from "@gafus/auth/jwt";
import { createFeedAuthorReviewProducer, isAllowedFeedAuthorRead } from
  "./g1-feed-author-producer.review";
const origin = "http://127.0.0.1:4138";
const fixture = {
  authorUsername: "ag2feedauthora20261018",
  actorId: "ag2feed_reader_b_20261018",
  visiblePostIds: ["ag2feed_visible_01_20261018", "ag2feed_visible_02_20261018"],
  hiddenPostId: "ag2feed_hidden_01_20261018",
  deletedPostId: "ag2feed_deleted_01_20261018",
  visibleCommentId: "ag2feed_comment_visible_01",
};
const app = createFeedAuthorReviewProducer(origin, fixture);
let b = ""; let a = "";
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  a = await generateAccessToken({ id: "ag2feed_author_a_20261018", username: "a", role: "TRAINER" });
  b = await generateAccessToken({ id: fixture.actorId, username: "b", role: "USER" });
});
beforeEach(() => {
  vi.clearAllMocks();
  dispatch.mockResolvedValue({ enabled: true });
});
const req = (path: string, token = b, method = "GET", headers: Record<string, string> = {}) =>
  app.request(origin + path, { method, headers: {
    cookie: `gafus_access=${token}`, ...headers,
  } });
const statusPath = "/api/v1/feed/status";
describe("AG1 AG2 feed producer source-only whitelist, signed JWT and no writes", () => {
  it("F01 status owner B GET, direct dispatcher exactly once, no-store", async () => {
    const res = await req(statusPath);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ success: true, data: { enabled: true } });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0]?.[0]).toBe(fixture.actorId);
  });
  it("F02 8 read shape variants include pageSize1 cursor and comment, reject unknown", () => {
    const allow = [
      "/status",
      `/profiles/${fixture.authorUsername}/posts?pageSize=20`,
      `/profiles/${fixture.authorUsername}/posts?pageSize=1`,
      `/profiles/${fixture.authorUsername}/posts?cursor=opaque-123&pageSize=1`,
      `/posts/${fixture.visiblePostIds[0]}`,
      `/posts/${fixture.visiblePostIds[0]}/comments?pageSize=20`,
      `/comments/${fixture.visibleCommentId}`,
      `/posts/${fixture.hiddenPostId}`,
      `/posts/${fixture.deletedPostId}`,
      "/profiles/ag2feed-unknown-author/posts?pageSize=20",
    ];
    for (const input of allow) {
      const u = new URL(origin + "/api/v1/feed" + input);
      expect(isAllowedFeedAuthorRead(u.pathname, u.search, fixture)).toBe(true);
    }
    for (const input of [
      "/posts/other-post", "/me/bookmarks", "/notifications",
      `/profiles/${fixture.authorUsername}/posts?pageSize=999`,
      `/profiles/${fixture.authorUsername}/posts?cursor=opaque&pageSize=20`,
      `/posts/${fixture.visiblePostIds[0]}/comments?pageSize=20&unknown=1`,
    ]) {
      const u = new URL(origin + "/api/v1/feed" + input);
      expect(isAllowedFeedAuthorRead(u.pathname, u.search, fixture)).toBe(false);
    }
  });
  it("F03 write POST/PUT/DELETE/POST comments denied before handler", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await req(statusPath, b, method);
      expect(res.status).toBe(405);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("F04 owner A denied, forged owner body cannot change B JWT", async () => {
    const denied = await req(statusPath, a);
    expect(denied.status).toBe(403);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("F05 no/expired JWT 401; local loopback Origin never relaxes prod", async () => {
    const noToken = await app.request(origin + statusPath);
    expect(noToken.status).toBe(401);
    const expired = await req(statusPath, "bad.jwt");
    expect(expired.status).toBe(401);
    expect(dispatch).not.toHaveBeenCalled();
    expect(() => createFeedAuthorReviewProducer("http://0.0.0.0:4138", fixture)).toThrow();
  });
  it("F06 untrusted Origin header and nonloopback Host denied", async () => {
    const res = await req(statusPath, b, "GET", { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    const outside = await app.request("http://attacker.invalid" + statusPath, {
      headers: { cookie: `gafus_access=${b}` },
    });
    expect(outside.status).toBe(403);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("F07 allowed response not caller-chosen raw path (query strict)", async () => {
    const res = await req(`/api/v1/feed/profiles/${fixture.authorUsername}/posts?pageSize=1`);
    expect(res.status).toBe(200);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0]?.[2]).toBe(`/profiles/${fixture.authorUsername}/posts`);
  });
});
