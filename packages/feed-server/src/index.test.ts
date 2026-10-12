import { afterEach, describe, expect, it, vi } from "vitest";
// The HTTP dispatcher tests do not exercise Redis; do not open a real socket.
vi.mock("@gafus/queues", () => ({ connection: { status: "end" } }));
afterEach(() => vi.unstubAllEnvs());
import { dispatchFeedRequest, feedHttpError } from "./index.js";
import type { FeedService, FeedSocialService } from "@gafus/core/services/feed";
const actor = "user_123";
const postId = "post_123";
function invoke(
  url: string, method = "GET", body?: string,
  posts = { list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }) },
) {
  const request = new Request(`https://example.test/api/v1/feed/${url}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body,
  });
  return dispatchFeedRequest(
    actor, request, new URL(request.url).pathname.slice("/api/v1/feed".length),
    posts as unknown as FeedService,
    {} as FeedSocialService,
  );
}
describe("feed shared HTTP dispatcher", () => {
  it("protects personalization routes behind the migration rollout flag", async () => {
    vi.stubEnv("FEED_SMART_ENABLED", "false");
    await expect(invoke("personalization", "GET")).rejects.toMatchObject({
      code: "FEED_DISABLED", status: 503,
    });
    await expect(invoke("personalization", "PATCH", JSON.stringify({ useCity: true })))
      .rejects.toMatchObject({ code: "FEED_DISABLED", status: 503 });
    await expect(invoke("personalization/reset", "POST", "{}"))
      .rejects.toMatchObject({ code: "FEED_DISABLED", status: 503 });
  });
  it("keeps Cloud.ru fallback unavailable by default and rejects untrusted variants", async () => {
    const posts = { list: vi.fn(), fallbackSource: vi.fn() };
    vi.stubEnv("FEED_MEDIA_FALLBACK_ENABLED", "false");
    await expect(invoke("media/m1/fallback", "POST", JSON.stringify({ variant: "thumb" }), posts))
      .rejects.toMatchObject({ status: 404 });
    expect(posts.fallbackSource).not.toHaveBeenCalled();
    vi.stubEnv("FEED_MEDIA_FALLBACK_ENABLED", "true");
    await expect(invoke("media/m1/fallback", "POST", JSON.stringify({ variant: "source", key: "/private" }), posts))
      .rejects.toMatchObject({ status: 400 });
    expect(posts.fallbackSource).not.toHaveBeenCalled();
  });
  it("routes cursor query through the validated shared handler", async () => {
    const list = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    await invoke("posts?pageSize=20&cursor=abc", "GET", undefined, { list });
    expect(list).toHaveBeenCalledWith(actor, { pageSize: 20, cursor: "abc", sort: "new" });
  });
  it("accepts main feed sorts but rejects them on unrelated endpoints", async () => {
    const list = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    await invoke("posts?sort=popular", "GET", undefined, { list });
    expect(list).toHaveBeenCalledWith(actor, { pageSize: 20, sort: "popular" });
    await invoke("posts?sort=discussed", "GET", undefined, { list });
    expect(list).toHaveBeenCalledWith(actor, { pageSize: 20, sort: "discussed" });
    await invoke("posts?sort=smart", "GET", undefined, { list });
    expect(list).toHaveBeenCalledWith(actor, { pageSize: 20, sort: "smart" });
    await expect(invoke("posts?sort=broken")).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    await expect(invoke("me/bookmarks?sort=popular")).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });
  it("rejects unknown query keys, duplicate keys and oversized pages", async () => {
    for (const url of ["posts?admin=true", "posts?pageSize=20&pageSize=21", "posts?pageSize=51"]) {
      await expect(invoke(url)).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    }
  });
  it("rejects oversized JSON, wrong content-type and invalid JSON", async () => {
    const invalid = new Request("https://example.test/api/v1/feed/posts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(65_537),
    });
    await expect(dispatchFeedRequest(actor, invalid, "/posts", {} as FeedService, {} as FeedSocialService))
      .rejects.toMatchObject({ status: 413 });
    await expect(invoke("posts", "POST", "{")).rejects.toMatchObject({ status: 400 });
    const type = new Request("https://example.test/api/v1/feed/posts", {
      method: "POST", headers: { "Content-Type": "text/plain" }, body: "hi",
    });
    await expect(dispatchFeedRequest(actor, type, "/posts", {} as FeedService, {} as FeedSocialService))
      .rejects.toMatchObject({ status: 415 });
  });
  it("checks post ID and unknown routes before any domain access", async () => {
    await expect(invoke("posts/..%2Fgallery", "GET")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(invoke("nonexistent")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });
  it("routes owned upload status, completion, cancellation and retry", async () => {
    const posts = {
      getUpload: vi.fn().mockResolvedValue({ status: "uploaded" }),
      completeUpload: vi.fn().mockResolvedValue({ status: "uploaded" }),
      cancelUpload: vi.fn().mockResolvedValue({ status: "cancelled" }),
      retryUpload: vi.fn().mockResolvedValue({ status: "reserved" }),
    };
    const run = (path: string, method: "GET" | "POST" | "DELETE", body?: object) =>
      dispatchFeedRequest(actor, new Request(`https://example.test/api/v1/feed${path}`, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }), path, posts as unknown as FeedService, {} as FeedSocialService);
    await run("/uploads/upload_1", "GET");
    await run("/uploads/upload_1/complete", "POST", {});
    await run("/uploads/upload_1", "DELETE", {});
    await run("/uploads/upload_1/retry", "POST", { clientRequestId: "123e4567-e89b-42d3-a456-426614174000" });
    expect(posts.getUpload).toHaveBeenCalledWith(actor, "upload_1");
    expect(posts.completeUpload).toHaveBeenCalledWith(actor, "upload_1");
    expect(posts.cancelUpload).toHaveBeenCalledWith(actor, "upload_1");
    expect(posts.retryUpload).toHaveBeenCalledWith(actor, "upload_1", { clientRequestId: "123e4567-e89b-42d3-a456-426614174000" });
  });
  it("does not leak unexpected internal error information in HTTP responses", () => {
    const result = feedHttpError(new Error("internal-storage-key=private"));
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain("internal-storage-key");
    expect(result.body.code).toBe("INTERNAL_ERROR");
  });
});


describe("feed S3 fallback authorization", () => {
  it("rejects rollout-off requests without resolving keys", async () => {
    vi.stubEnv("FEED_MEDIA_FALLBACK_ENABLED", "false");
    const posts = { list: vi.fn(), fallbackSource: vi.fn() };
    await expect(invoke("media/media123/fallback", "POST", '{"variant":"thumb"}', posts))
      .rejects.toMatchObject({ status: 404 });
    expect(posts.fallbackSource).not.toHaveBeenCalled();
  });
  it("refuses arbitrary sources before core lookup and never signs denied media", async () => {
    vi.stubEnv("FEED_MEDIA_FALLBACK_ENABLED", "true");
    const posts = { list: vi.fn(), fallbackSource: vi.fn(async () => { throw new Error("NOT_VISIBLE"); }) };
    await expect(invoke("media/media123/fallback", "POST", '{"variant":"playlist"}', posts))
      .rejects.toMatchObject({ status: 400 });
    expect(posts.fallbackSource).not.toHaveBeenCalled();
    await expect(invoke("media/media123/fallback", "POST", '{"variant":"poster"}', posts))
      .rejects.toThrow("NOT_VISIBLE");
    expect(posts.fallbackSource).toHaveBeenCalledWith(actor, "media123", "poster");
  });
});

describe("feed personal actions routing", () => {
  it("routes bookmarks separately so hidden authors remain accessible there", async () => {
    const list = vi.fn().mockResolvedValue({ items: [] });
    await dispatchFeedRequest(actor, new Request("https://example.test/api/v1/feed/me/bookmarks"), "/me/bookmarks", { list } as unknown as FeedService, {} as FeedSocialService);
    expect(list).toHaveBeenCalledWith(actor, { pageSize: 20 }, true);
  });
  it("scopes preferences and post/comment reports to the authenticated actor", async () => {
    const personal = { preference: vi.fn(), report: vi.fn(), bookmark: vi.fn(), hiddenAuthors: vi.fn() };
    const run = (path: string, method: string, body: object) => dispatchFeedRequest(actor, new Request(`https://example.test/api/v1/feed${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), path, {} as FeedService, {} as FeedSocialService, personal as unknown as NonNullable<Parameters<typeof dispatchFeedRequest>[5]>);
    await run("/authors/author_1/preferences", "PATCH", { hidden: true });
    expect(personal.preference).toHaveBeenCalledWith(actor, "author_1", { hidden: true });
    await run("/posts/post_1/report", "POST", { reason: "spam" });
    expect(personal.report).toHaveBeenCalledWith(actor, "post", "post_1", { reason: "spam" });
    await run("/comments/comment_1/report", "POST", { reason: "other" });
    expect(personal.report).toHaveBeenCalledWith(actor, "comment", "comment_1", { reason: "other" });
    await run("/posts/post_1/bookmark", "PUT", {});
    expect(personal.bookmark).toHaveBeenCalledWith(actor, "post_1", true);
  });
});
