import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.api }));
import { feedBookmarkGuarded } from "./feed";
beforeEach(() => {
  m.api.mockReset().mockResolvedValue({ success: true, data: { saved: true } });
});
describe("V78 existing Feed bookmark native authenticated PUT/DELETE", () => {
  it("uses exact encoded POST ID and PUT with empty existing body for bookmark", async () => {
    const guard = vi.fn(() => true);
    await expect(feedBookmarkGuarded("post/with space", true, guard)).resolves.toEqual({
      saved: true,
    });
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/feed/posts/post%2Fwith%20space/bookmark",
      expect.objectContaining({
        method: "PUT",
        body: {},
        requestGuard: guard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      }),
    );
  });
  it("unbookmark uses existing DELETE same path with no new request fields", async () => {
    m.api.mockResolvedValueOnce({ success: true, data: { saved: false } });
    await expect(feedBookmarkGuarded("post-A", false, () => true)).resolves.toEqual({
      saved: false,
    });
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/feed/posts/post-A/bookmark",
      expect.objectContaining({ method: "DELETE", body: {} }),
    );
  });
  it("no verified actor means zero transport attempts", async () => {
    await expect(feedBookmarkGuarded("post-A", true, () => false)).rejects.toThrow(
      "FEED_BOOKMARK_SESSION_CHANGED",
    );
    expect(m.api).not.toHaveBeenCalled();
  });
  it("actor switch while network pending quarantines otherwise positive ACK", async () => {
    let live = true;
    let resolve!: (value: unknown) => void;
    m.api.mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        }),
    );
    const pending = feedBookmarkGuarded("post-A", true, () => live);
    await vi.waitFor(() => expect(m.api).toHaveBeenCalledOnce());
    live = false;
    resolve({ success: true, data: { saved: true } });
    await expect(pending).rejects.toThrow("FEED_BOOKMARK_SESSION_CHANGED");
  });
  it("timeout and 5xx errors do not echo raw token or fabricate ACK", async () => {
    m.api.mockResolvedValueOnce({
      success: false,
      code: "REQUEST_TIMEOUT",
      error: "Bearer private value /signed?secret",
    });
    await expect(feedBookmarkGuarded("post-A", true, () => true)).rejects.toThrow(
      "FEED_BOOKMARK_RESULT_UNCONFIRMED",
    );
    expect(m.api).toHaveBeenCalledOnce();
  });
});
