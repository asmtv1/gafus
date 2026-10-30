import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.api }));
import { feedCreateCommentGuarded } from "./feed";
const input = {
  text: "Привет",
  replyToId: "reply-123",
  clientRequestId: "123e4567-e89b-12d3-a456-426614174000",
};
const ack = {
  id: "comment-123",
  postId: "post/id",
  author: { id: "A" },
  text: "Привет",
  replyToId: "reply-123",
  deleted: false,
};
beforeEach(() => {
  m.api.mockReset().mockResolvedValue({ success: true, data: ack });
});
describe("V85 existing comment POST native guard", () => {
  it("uses encoded post URL, original POST and exact reply/request ID body", async () => {
    const guard = vi.fn(() => true);
    await expect(feedCreateCommentGuarded("post/id", input, guard)).resolves.toEqual(ack);
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/feed/posts/post%2Fid/comments",
      expect.objectContaining({
        method: "POST",
        body: input,
        requestGuard: guard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      }),
    );
  });
  it("top-level comment preserves null replyToId and same request ID", async () => {
    const body = { ...input, replyToId: null };
    await feedCreateCommentGuarded("post-A", body, () => true);
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/feed/posts/post-A/comments",
      expect.objectContaining({ method: "POST", body }),
    );
  });
  it("unverified actor blocks before transport", async () => {
    await expect(feedCreateCommentGuarded("post-A", input, () => false)).rejects.toThrow(
      "FEED_CREATE_COMMENT_SESSION_CHANGED",
    );
    expect(m.api).not.toHaveBeenCalled();
  });
  it("stale actor during await rejects successful-looking ACK", async () => {
    let live = true,
      resolve!: (result: unknown) => void;
    m.api.mockImplementationOnce(
      () =>
        new Promise((ok) => {
          resolve = ok;
        }),
    );
    const pending = feedCreateCommentGuarded("post-A", input, () => live);
    await vi.waitFor(() => expect(m.api).toHaveBeenCalledOnce());
    live = false;
    resolve({ success: true, data: { ...ack, postId: "post-A" } });
    await expect(pending).rejects.toThrow("FEED_CREATE_COMMENT_SESSION_CHANGED");
    expect(m.api).toHaveBeenCalledTimes(1);
  });
  it("negative HTTP with private message gives static sanitized error", async () => {
    m.api.mockResolvedValueOnce({ success: false, error: "Bearer private-token", code: "TIMEOUT" });
    await expect(feedCreateCommentGuarded("post-A", input, () => true)).rejects.toThrow(
      "FEED_CREATE_COMMENT_RESULT_UNCONFIRMED",
    );
    expect(m.api).toHaveBeenCalledTimes(1);
  });
  it("missing ACK payload stays unconfirmed", async () => {
    m.api.mockResolvedValueOnce({ success: true, data: undefined });
    await expect(feedCreateCommentGuarded("post-A", input, () => true)).rejects.toThrow(
      "FEED_CREATE_COMMENT_RESULT_UNCONFIRMED",
    );
    expect(m.api).toHaveBeenCalledTimes(1);
  });
});
