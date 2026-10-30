import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.api }));
import { feedReportGuarded } from "./feed";
beforeEach(() => {
  m.api.mockReset().mockResolvedValue({ success: true, data: { id: "report-confirmed" } });
});
describe("existing Feed report route guarded adapter", () => {
  it("POSTs exact type route, encoded id and current guard with no automatic refresh replay", async () => {
    const guard = vi.fn(() => true);
    const result = await feedReportGuarded(
      "comment",
      "comment/with whitespace",
      { reason: "spam", comment: "synthetic" },
      guard,
    );
    expect(result).toEqual({ id: "report-confirmed" });
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/feed/comments/comment%2Fwith%20whitespace/report",
      expect.objectContaining({
        method: "POST",
        body: { reason: "spam", comment: "synthetic" },
        suppressSubscriptionPaywall: true,
        skipAuthRefreshReplay: true,
        requestGuard: guard,
      }),
    );
  });
  it("unverified owner rejects before HTTP", async () => {
    await expect(feedReportGuarded("post", "p1", { reason: "spam" }, () => false)).rejects.toThrow(
      "FEED_REPORT_SESSION_CHANGED",
    );
    expect(m.api).not.toHaveBeenCalled();
  });
  it("A->B during network await rejects old ACK", async () => {
    let live = true;
    let resolve!: (v: unknown) => void;
    m.api.mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        }),
    );
    const result = feedReportGuarded("post", "p1", { reason: "spam" }, () => live);
    await vi.waitFor(() => expect(m.api).toHaveBeenCalledOnce());
    live = false;
    resolve({ success: true, data: { id: "old-report" } });
    await expect(result).rejects.toThrow("FEED_REPORT_SESSION_CHANGED");
  });
  it("server timeout cannot return success or raw sensitive error", async () => {
    const secret = "Bearer private-token /hidden/path?signature=secret";
    m.api.mockResolvedValueOnce({ success: false, error: secret, code: "REQUEST_TIMEOUT" });
    await expect(feedReportGuarded("post", "p1", { reason: "spam" }, () => true)).rejects.toThrow(
      "FEED_REPORT_UNCONFIRMED",
    );
  });
});
