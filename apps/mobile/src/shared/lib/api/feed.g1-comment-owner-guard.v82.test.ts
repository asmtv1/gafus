import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.api }));
import { feedEditCommentGuarded, feedDeleteCommentGuarded } from "./feed";
const comment = {
  id: "comment/id",
  postId: "post-A",
  author: { id: "A" },
  text: "Изменено",
  deleted: false,
};
beforeEach(() => {
  m.api.mockReset().mockResolvedValue({ success: true, data: comment });
});
describe("V82 existing typed owner comment PATCH/DELETE contract guard", () => {
  it("keeps original encoded comment PATCH route, exact edit body, requestGuard and no auth replay", async () => {
    const guard = vi.fn(() => true);
    await expect(
      feedEditCommentGuarded("comment/id", { text: "Изменено" }, guard),
    ).resolves.toEqual(comment);
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/feed/comments/comment%2Fid",
      expect.objectContaining({
        method: "PATCH",
        body: { text: "Изменено" },
        requestGuard: guard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      }),
    );
  });
  it("keeps original encoded comment DELETE route with no body", async () => {
    const guard = vi.fn(() => true);
    m.api.mockResolvedValueOnce({ success: true, data: { id: "comment/id" } });
    await expect(feedDeleteCommentGuarded("comment/id", guard)).resolves.toEqual({
      id: "comment/id",
    });
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/feed/comments/comment%2Fid",
      expect.objectContaining({
        method: "DELETE",
        requestGuard: guard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      }),
    );
    expect(m.api.mock.calls[0][1]).not.toHaveProperty("body");
  });
  it("unverified principal blocks both methods before transport", async () => {
    await expect(feedEditCommentGuarded("c1", { text: "x" }, () => false)).rejects.toThrow(
      "FEED_COMMENT_EDIT_SESSION_CHANGED",
    );
    await expect(feedDeleteCommentGuarded("c1", () => false)).rejects.toThrow(
      "FEED_COMMENT_DELETE_SESSION_CHANGED",
    );
    expect(m.api).not.toHaveBeenCalled();
  });
  it("A->B switch during PATCH discards otherwise positive old comment ACK", async () => {
    let live = true,
      resolve!: (v: unknown) => void;
    m.api.mockImplementationOnce(
      () =>
        new Promise((ok) => {
          resolve = ok;
        }),
    );
    const pending = feedEditCommentGuarded("c1", { text: "new" }, () => live);
    await vi.waitFor(() => expect(m.api).toHaveBeenCalledOnce());
    live = false;
    resolve({ success: true, data: { ...comment, id: "c1" } });
    await expect(pending).rejects.toThrow("FEED_COMMENT_EDIT_SESSION_CHANGED");
  });
  it("A->B switch during DELETE discards otherwise positive old delete ACK", async () => {
    let live = true,
      resolve!: (v: unknown) => void;
    m.api.mockImplementationOnce(
      () =>
        new Promise((ok) => {
          resolve = ok;
        }),
    );
    const pending = feedDeleteCommentGuarded("c1", () => live);
    await vi.waitFor(() => expect(m.api).toHaveBeenCalledOnce());
    live = false;
    resolve({ success: true, data: { id: "c1" } });
    await expect(pending).rejects.toThrow("FEED_COMMENT_DELETE_SESSION_CHANGED");
  });
  it("negative HTTP and missing data return only static errors, no provider secrets", async () => {
    m.api.mockResolvedValueOnce({
      success: false,
      error: "Bearer private-token",
      code: "REQUEST_TIMEOUT",
    });
    await expect(feedDeleteCommentGuarded("c1", () => true)).rejects.toThrow(
      "FEED_COMMENT_DELETE_UNCONFIRMED",
    );
    m.api.mockResolvedValueOnce({ success: true, data: undefined });
    await expect(feedEditCommentGuarded("c1", { text: "x" }, () => true)).rejects.toThrow(
      "FEED_COMMENT_EDIT_UNCONFIRMED",
    );
    expect(m.api).toHaveBeenCalledTimes(2);
  });
});
