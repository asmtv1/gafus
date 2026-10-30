import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.api }));
import { feedAuthorPreferenceGuarded } from "./feed";
beforeEach(() => {
  m.api.mockReset().mockResolvedValue({ success: true, data: { hidden: true, notify: false } });
});
describe("V76 existing Mobile feed author preference PATCH", () => {
  it("uses encoded author path and exact PATCH body with native requestGuard and no refresh replay", async () => {
    const guard = vi.fn(() => true);
    await expect(
      feedAuthorPreferenceGuarded("author/id", { hidden: true }, guard),
    ).resolves.toEqual({ hidden: true, notify: false });
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/feed/authors/author%2Fid/preferences",
      expect.objectContaining({
        method: "PATCH",
        body: { hidden: true },
        requestGuard: guard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      }),
    );
  });
  it("unhide uses same route with false; no invented endpoint", async () => {
    m.api.mockResolvedValueOnce({ success: true, data: { hidden: false, notify: false } });
    await expect(
      feedAuthorPreferenceGuarded("author-A", { hidden: false }, () => true),
    ).resolves.toEqual({ hidden: false, notify: false });
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/feed/authors/author-A/preferences",
      expect.objectContaining({ method: "PATCH", body: { hidden: false } }),
    );
  });
  it("guest/unverified guard sends no HTTP", async () => {
    await expect(
      feedAuthorPreferenceGuarded("author-A", { hidden: true }, () => false),
    ).rejects.toThrow("FEED_AUTHOR_SESSION_CHANGED");
    expect(m.api).not.toHaveBeenCalled();
  });
  it("late A->B actor change rejects otherwise positive old ACK", async () => {
    let active = true;
    let resolve!: (result: unknown) => void;
    m.api.mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        }),
    );
    const pending = feedAuthorPreferenceGuarded("author-A", { hidden: true }, () => active);
    await vi.waitFor(() => expect(m.api).toHaveBeenCalledOnce());
    active = false;
    resolve({ success: true, data: { hidden: true, notify: false } });
    await expect(pending).rejects.toThrow("FEED_AUTHOR_SESSION_CHANGED");
  });
  it("timeout/503 drops provider PII and preserves unknown outcome without a second request", async () => {
    m.api.mockResolvedValueOnce({
      success: false,
      code: "REQUEST_TIMEOUT",
      error: "Bearer private-token?s3signature=secret",
    });
    await expect(
      feedAuthorPreferenceGuarded("author-A", { hidden: true }, () => true),
    ).rejects.toThrow("FEED_AUTHOR_RESULT_UNCONFIRMED");
    expect(m.api).toHaveBeenCalledOnce();
  });
});
