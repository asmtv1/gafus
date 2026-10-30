/** AG1-SOC-041: ambiguous empty path segments must not reach mutating Feed Core operations. */
import { describe, expect, it, vi } from "vitest";
import type { FeedService, FeedSocialService } from "@gafus/core/services/feed";

vi.mock("@gafus/queues", () => ({ connection: { status: "end" } }));
import { dispatchFeedRequest } from "./index.js";

const actor = "account-A";
const postId = "post_1";
const uuid = "123e4567-e89b-42d3-a456-426614174000";

function fixture() {
  const posts = {
    get: vi.fn().mockResolvedValue({ id: postId }),
    remove: vi.fn().mockResolvedValue({ removed: true }),
    publish: vi.fn().mockResolvedValue({ id: postId, status: "published" }),
    saveRevision: vi.fn().mockResolvedValue({ id: postId }),
  };
  return { posts };
}

function request(path: string, method: string, payload?: unknown, posts = fixture().posts) {
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  const url = `https://example.test/api/v1/feed${path}`;
  return dispatchFeedRequest(actor, new Request(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body,
  }), path, posts as unknown as FeedService, {} as FeedSocialService);
}

describe("AG1-SOC-041 canonical feed path boundary", () => {
  it.each([
    ["DELETE", "/posts//post_1", {}],
    ["GET", "/posts//post_1", undefined],
    ["POST", "/posts//post_1/publish", { clientRequestId: uuid }],
    ["PUT", "/posts//post_1/revisions", {
      clientRequestId: uuid, expectedVersion: 0, text: "text", attachmentIds: [],
    }],
    ["DELETE", "//posts/post_1", {}],
  ])("rejects %s ambiguous path %s before Core", async (method, path, payload) => {
    const { posts } = fixture();
    await expect(request(path, method, payload, posts)).rejects.toMatchObject({
      code: "NOT_FOUND", status: 404,
    });
    expect(posts.get).not.toHaveBeenCalled();
    expect(posts.remove).not.toHaveBeenCalled();
    expect(posts.publish).not.toHaveBeenCalled();
    expect(posts.saveRevision).not.toHaveBeenCalled();
  });

  it("preserves canonical DELETE route and actor scoping", async () => {
    const { posts } = fixture();
    await expect(request(`/posts/${postId}`, "DELETE", {}, posts)).resolves.toEqual({ removed: true });
    expect(posts.remove).toHaveBeenCalledExactlyOnceWith(actor, postId);
  });

  it("preserves canonical publish route with stable request id", async () => {
    const { posts } = fixture();
    await expect(request(`/posts/${postId}/publish`, "POST", { clientRequestId: uuid }, posts))
      .resolves.toMatchObject({ status: "published" });
    expect(posts.publish).toHaveBeenCalledExactlyOnceWith(actor, postId, { clientRequestId: uuid });
  });


  it("preserves the client revision base version and exact media order", async () => {
    const { posts } = fixture();
    const revision = {
      clientRequestId: uuid,
      expectedVersion: 7,
      text: "Обновлённый момент",
      attachmentIds: ["media_B", "media_A", "media_C"],
    };
    await expect(request(`/posts/${postId}/revisions`, "PUT", revision, posts))
      .resolves.toMatchObject({ id: postId });
    expect(posts.saveRevision).toHaveBeenCalledExactlyOnceWith(actor, postId, revision);
  });

  it.each([
    ["duplicate media IDs", ["media_A", "media_A"], 0],
    ["negative revision", ["media_A"], -1],
  ])("rejects %s before Core receives a revision", async (_label, attachmentIds, expectedVersion) => {
    const { posts } = fixture();
    const input = { clientRequestId: uuid, expectedVersion, text: "Текст", attachmentIds };
    await expect(request(`/posts/${postId}/revisions`, "PUT", input, posts)).rejects.toMatchObject({
      code: "VALIDATION_ERROR", status: 400,
    });
    expect(posts.saveRevision).not.toHaveBeenCalled();
  });

});
