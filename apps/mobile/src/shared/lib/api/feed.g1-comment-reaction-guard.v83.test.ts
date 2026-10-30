import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.api }));
import { feedCommentReactionGuarded } from "./feed";
const ack = (reaction: string | null) => ({
  id: "comment/id",
  postId: "post-A",
  deleted: false,
  myReaction: reaction,
});
beforeEach(() => {
  m.api.mockReset().mockResolvedValue({ success: true, data: ack("❤️") });
});
describe("V83 current shared comment reaction PUT/DELETE native guard", () => {
  it("positive reaction uses original encoded PUT route and reaction body", async () => {
    const guard = vi.fn(() => true);
    await expect(feedCommentReactionGuarded("comment/id", "❤️", guard)).resolves.toEqual(ack("❤️"));
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/feed/comments/comment%2Fid/reaction",
      expect.objectContaining({
        method: "PUT",
        body: { reaction: "❤️" },
        requestGuard: guard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      }),
    );
  });
  it("reaction removal uses original DELETE route with no invented body", async () => {
    m.api.mockResolvedValueOnce({ success: true, data: ack(null) });
    await expect(feedCommentReactionGuarded("comment/id", null, () => true)).resolves.toEqual(
      ack(null),
    );
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/feed/comments/comment%2Fid/reaction",
      expect.objectContaining({ method: "DELETE", skipAuthRefreshReplay: true }),
    );
    expect(m.api.mock.calls[0][1]).not.toHaveProperty("body");
  });
  it("guest or no verified actor blocks both operations before API", async () => {
    await expect(feedCommentReactionGuarded("c1", "❤️", () => false)).rejects.toThrow(
      "FEED_COMMENT_REACTION_SESSION_CHANGED",
    );
    await expect(feedCommentReactionGuarded("c1", null, () => false)).rejects.toThrow(
      "FEED_COMMENT_REACTION_SESSION_CHANGED",
    );
    expect(m.api).not.toHaveBeenCalled();
  });
  it("actor switch while awaiting PUT quarantines otherwise successful ACK", async () => {
    let live = true,
      resolve!: (v: unknown) => void;
    m.api.mockImplementationOnce(
      () =>
        new Promise((ok) => {
          resolve = ok;
        }),
    );
    const p = feedCommentReactionGuarded("c1", "❤️", () => live);
    await vi.waitFor(() => expect(m.api).toHaveBeenCalledOnce());
    live = false;
    resolve({ success: true, data: { ...ack("❤️"), id: "c1" } });
    await expect(p).rejects.toThrow("FEED_COMMENT_REACTION_SESSION_CHANGED");
  });
  it("negative HTTP, missing data or timeout never emits private provider error", async () => {
    m.api.mockResolvedValueOnce({
      success: false,
      error: "Bearer private signed-url",
      code: "TIMEOUT",
    });
    await expect(feedCommentReactionGuarded("c1", "❤️", () => true)).rejects.toThrow(
      "FEED_COMMENT_REACTION_UNCONFIRMED",
    );
    m.api.mockResolvedValueOnce({ success: true, data: undefined });
    await expect(feedCommentReactionGuarded("c1", null, () => true)).rejects.toThrow(
      "FEED_COMMENT_REACTION_UNCONFIRMED",
    );
    expect(m.api).toHaveBeenCalledTimes(2);
  });
});
