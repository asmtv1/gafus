import { describe, expect, it } from "vitest";
import { mobilePendingRefreshInterval } from "./pendingRefresh";

describe("mobile Moments pending recovery", () => {
  it("refreshes every 5 seconds with server-side processing posts", () => {
    expect(mobilePendingRefreshInterval([{ status: "draft" }, { status: "pending" }])).toBe(5_000);
  });

  it("refreshes every 20 seconds without pending posts", () => {
    expect(mobilePendingRefreshInterval(undefined)).toBe(20_000);
    expect(mobilePendingRefreshInterval([])).toBe(20_000);
    expect(mobilePendingRefreshInterval([{ status: "draft" }, { status: "failed" }])).toBe(20_000);
  });
});
