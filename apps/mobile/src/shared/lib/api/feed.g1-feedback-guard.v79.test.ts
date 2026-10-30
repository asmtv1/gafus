import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.api }));
import { feedPostFeedbackGuarded } from "./feed";
beforeEach(() => {
  m.api.mockReset().mockResolvedValue({ success: true, data: { saved: true } });
});
describe("V79 existing feed not_interested POST and verified native actor", () => {
  it("preserves the exact encoded original path, method and not_interested kind", async () => {
    const guard = vi.fn(() => true);
    await expect(feedPostFeedbackGuarded("post/has space", guard)).resolves.toEqual({
      saved: true,
    });
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/feed/posts/post%2Fhas%20space/feedback",
      expect.objectContaining({
        method: "POST",
        body: { kind: "not_interested" },
        requestGuard: guard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      }),
    );
  });
  it("when native actor is unverified no HTTP request is issued", async () => {
    await expect(feedPostFeedbackGuarded("post-A", () => false)).rejects.toThrow(
      "FEED_FEEDBACK_SESSION_CHANGED",
    );
    expect(m.api).not.toHaveBeenCalled();
  });
  it("old actor after await cannot observe a positive-looking server ACK", async () => {
    let live = true;
    let resolve!: (result: unknown) => void;
    m.api.mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        }),
    );
    const pending = feedPostFeedbackGuarded("post-A", () => live);
    await vi.waitFor(() => expect(m.api).toHaveBeenCalledOnce());
    live = false;
    resolve({ success: true, data: { saved: true } });
    await expect(pending).rejects.toThrow("FEED_FEEDBACK_SESSION_CHANGED");
    expect(m.api).toHaveBeenCalledTimes(1);
  });
  it("timeout/error response remains unconfirmed without returning provider text", async () => {
    m.api.mockResolvedValueOnce({
      success: false,
      code: "REQUEST_TIMEOUT",
      error: "Bearer private-token s3://sensitive",
    });
    await expect(feedPostFeedbackGuarded("post-A", () => true)).rejects.toThrow(
      "FEED_FEEDBACK_RESULT_UNCONFIRMED",
    );
    expect(m.api).toHaveBeenCalledTimes(1);
  });
  it("an unstructured success missing data is not accepted as feedback", async () => {
    m.api.mockResolvedValueOnce({ success: true, data: undefined });
    await expect(feedPostFeedbackGuarded("post-A", () => true)).rejects.toThrow(
      "FEED_FEEDBACK_RESULT_UNCONFIRMED",
    );
    expect(m.api).toHaveBeenCalledTimes(1);
  });
});
