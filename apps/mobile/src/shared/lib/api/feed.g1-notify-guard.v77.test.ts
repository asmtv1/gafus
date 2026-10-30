import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.api }));
import { feedAuthorPreferenceGuarded } from "./feed";
beforeEach(() => {
  m.api.mockReset().mockResolvedValue({ success: true, data: { hidden: false, notify: true } });
});
describe("V77 existing author-notification native guarded transport", () => {
  it("notify:true is PATCH with the existing encoded author preferences route", async () => {
    const guard = vi.fn(() => true);
    await expect(
      feedAuthorPreferenceGuarded("author/01", { notify: true }, guard),
    ).resolves.toEqual({ hidden: false, notify: true });
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/feed/authors/author%2F01/preferences",
      expect.objectContaining({
        method: "PATCH",
        body: { notify: true },
        requestGuard: guard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      }),
    );
  });
  it("notify:false retains same route and does not send hidden field", async () => {
    m.api.mockResolvedValueOnce({ success: true, data: { hidden: false, notify: false } });
    await expect(
      feedAuthorPreferenceGuarded("author-01", { notify: false }, () => true),
    ).resolves.toEqual({ hidden: false, notify: false });
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/feed/authors/author-01/preferences",
      expect.objectContaining({ method: "PATCH", body: { notify: false } }),
    );
  });
  it("unverified actor refuses transport and late epoch invalidates acknowledged response", async () => {
    await expect(
      feedAuthorPreferenceGuarded("author-01", { notify: true }, () => false),
    ).rejects.toThrow("FEED_AUTHOR_SESSION_CHANGED");
    expect(m.api).not.toHaveBeenCalled();
    let active = true;
    let resolve!: (v: unknown) => void;
    m.api.mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        }),
    );
    const inFlight = feedAuthorPreferenceGuarded("author-01", { notify: false }, () => active);
    await vi.waitFor(() => expect(m.api).toHaveBeenCalledOnce());
    active = false;
    resolve({ success: true, data: { hidden: false, notify: false } });
    await expect(inFlight).rejects.toThrow("FEED_AUTHOR_SESSION_CHANGED");
  });
});
