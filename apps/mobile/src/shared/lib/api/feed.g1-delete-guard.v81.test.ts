import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.api }));
import { feedDeletePostGuarded } from "./feed";
beforeEach(() => {
  m.api.mockReset().mockResolvedValue({ success: true, data: { id: "p-A" } });
});
describe("V81 existing Feed post delete native guarded transport", () => {
  it("preserves exact encoded post DELETE path, method and no invented body", async () => {
    const guard = vi.fn(() => true);
    await expect(feedDeletePostGuarded("post/with space", guard)).resolves.toEqual({ id: "p-A" });
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/feed/posts/post%2Fwith%20space",
      expect.objectContaining({
        method: "DELETE",
        requestGuard: guard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      }),
    );
    expect(m.api.mock.calls[0][1]).not.toHaveProperty("body");
  });
  it("guest/unverified actor blocks before network", async () => {
    await expect(feedDeletePostGuarded("p-A", () => false)).rejects.toThrow(
      "FEED_DELETE_SESSION_CHANGED",
    );
    expect(m.api).not.toHaveBeenCalled();
  });
  it("late A->B actor change fences already successful server response", async () => {
    let live = true;
    let resolve!: (x: unknown) => void;
    m.api.mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        }),
    );
    const pending = feedDeletePostGuarded("p-A", () => live);
    await vi.waitFor(() => expect(m.api).toHaveBeenCalledTimes(1));
    live = false;
    resolve({ success: true, data: { id: "p-A" } });
    await expect(pending).rejects.toThrow("FEED_DELETE_SESSION_CHANGED");
    expect(m.api).toHaveBeenCalledTimes(1);
  });
  it("timeout/unconfirmed result never leaks provider error into UI exception", async () => {
    const sensitive = "Bearer secret https://signed-image/?private_token=1";
    m.api.mockResolvedValueOnce({ success: false, error: sensitive, code: "REQUEST_TIMEOUT" });
    await expect(feedDeletePostGuarded("p-A", () => true)).rejects.toThrow(
      "FEED_DELETE_RESULT_UNCONFIRMED",
    );
    expect(m.api).toHaveBeenCalledTimes(1);
  });
  it("missing response data is unconfirmed; no synthetic positive ACK", async () => {
    m.api.mockResolvedValueOnce({ success: true, data: undefined });
    await expect(feedDeletePostGuarded("p-A", () => true)).rejects.toThrow(
      "FEED_DELETE_RESULT_UNCONFIRMED",
    );
    expect(m.api).toHaveBeenCalledTimes(1);
  });
});
