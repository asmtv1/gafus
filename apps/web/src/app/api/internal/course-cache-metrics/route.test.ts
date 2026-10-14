import { beforeEach, describe, expect, it, vi } from "vitest";

const metrics = vi.hoisted(() => ({
  authorized: vi.fn(),
  snapshot: vi.fn(),
}));

vi.mock("@gafus/core/services/training", () => ({
  canReadCourseCacheMetrics: metrics.authorized,
  getCourseCacheMetricsSnapshot: metrics.snapshot,
}));

import { GET } from "./route";

describe("internal Web course cache metrics route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    metrics.authorized.mockReturnValue(false);
    metrics.snapshot.mockReturnValue({ counters: { hit: 1 } });
  });

  it("returns 404 with no metrics when the secret is not accepted", async () => {
    const response = GET(new Request("https://gafus.ru/api/internal/course-cache-metrics"));
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(metrics.snapshot).not.toHaveBeenCalled();
  });

  it("returns the process snapshot with no-store when authorized", async () => {
    metrics.authorized.mockReturnValue(true);
    const response = GET(
      new Request("https://gafus.ru/api/internal/course-cache-metrics", {
        headers: { Authorization: "Bearer long-test-token" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(metrics.authorized).toHaveBeenCalledWith("Bearer long-test-token");
    await expect(response.json()).resolves.toEqual({ counters: { hit: 1 } });
  });
});
