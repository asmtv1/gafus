import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.api }));
import { feedPostReactionGuarded } from "./feed";
const ack = (reaction: string | null) => ({
  id: "post/id",
  status: "published",
  myReaction: reaction,
});
beforeEach(() => {
  m.api.mockReset().mockResolvedValue({ success: true, data: ack("❤️") });
});
describe("V84 existing post-reaction PUT/DELETE guarded native transport", () => {
  it("uses encoded original PUT route with exact reaction body, verified guard and no auth replay", async () => {
    const guard = vi.fn(() => true);
    await expect(feedPostReactionGuarded("post/id", "❤️", guard)).resolves.toEqual(ack("❤️"));
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/feed/posts/post%2Fid/reaction",
      expect.objectContaining({
        method: "PUT",
        body: { reaction: "❤️" },
        requestGuard: guard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      }),
    );
  });
  it("removal uses existing DELETE route and no body", async () => {
    m.api.mockResolvedValueOnce({ success: true, data: ack(null) });
    await expect(feedPostReactionGuarded("post/id", null, () => true)).resolves.toEqual(ack(null));
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/feed/posts/post%2Fid/reaction",
      expect.objectContaining({ method: "DELETE", skipAuthRefreshReplay: true }),
    );
    expect(m.api.mock.calls[0][1]).not.toHaveProperty("body");
  });
  it("guest and missing native actor blocks PUT and DELETE without HTTP", async () => {
    await expect(feedPostReactionGuarded("post-A", "❤️", () => false)).rejects.toThrow(
      "FEED_POST_REACTION_SESSION_CHANGED",
    );
    await expect(feedPostReactionGuarded("post-A", null, () => false)).rejects.toThrow(
      "FEED_POST_REACTION_SESSION_CHANGED",
    );
    expect(m.api).not.toHaveBeenCalled();
  });
  it("late A->B epoch invalidates otherwise successful response", async () => {
    let live = true,
      resolve!: (v: unknown) => void;
    m.api.mockImplementationOnce(
      () =>
        new Promise((ok) => {
          resolve = ok;
        }),
    );
    const pending = feedPostReactionGuarded("post-A", "❤️", () => live);
    await vi.waitFor(() => expect(m.api).toHaveBeenCalledOnce());
    live = false;
    resolve({ success: true, data: { ...ack("❤️"), id: "post-A" } });
    await expect(pending).rejects.toThrow("FEED_POST_REACTION_SESSION_CHANGED");
    expect(m.api).toHaveBeenCalledTimes(1);
  });
  it("negative HTTP or missing response is UNKNOWN with fixed private-safe error", async () => {
    m.api.mockResolvedValueOnce({
      success: false,
      error: "Bearer signed private URL",
      code: "TIMEOUT",
    });
    await expect(feedPostReactionGuarded("post-A", "❤️", () => true)).rejects.toThrow(
      "FEED_POST_REACTION_UNCONFIRMED",
    );
    m.api.mockResolvedValueOnce({ success: true, data: undefined });
    await expect(feedPostReactionGuarded("post-A", null, () => true)).rejects.toThrow(
      "FEED_POST_REACTION_UNCONFIRMED",
    );
    expect(m.api).toHaveBeenCalledTimes(2);
  });
});
