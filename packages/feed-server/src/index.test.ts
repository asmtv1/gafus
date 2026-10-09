import { describe, expect, it, vi } from "vitest";
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
  it("routes cursor query through the validated shared handler", async () => {
    const list = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    await invoke("posts?pageSize=20&cursor=abc", "GET", undefined, { list });
    expect(list).toHaveBeenCalledWith(actor, { pageSize: 20, cursor: "abc" });
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
