/**
 * Source-only negative import boundary for the existing guest catalog route.
 * The actual Core barrel, DB, queues, media and provider code MUST NOT load
 * during route registration. Request-time loading retains original fail-closed 500.
 */
import { describe, expect, it, vi } from "vitest";

const guard = vi.hoisted(() => ({ coreEvaluations: 0, errors: vi.fn() }));

vi.mock("@gafus/core/services/course", () => {
  guard.coreEvaluations++;
  throw Error("BLOCKED_COURSE_BARREL_LOAD_ON_REGISTRATION");
});
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: guard.errors }),
}));

import { publicCoursesRoutes } from "./public-courses";

describe("COURSE030 real guest Hono route registration is import safe", () => {
  it("registers the existing GET without importing any Core course barrel at module evaluation", () => {
    expect(guard.coreEvaluations).toBe(0);
    expect(publicCoursesRoutes).toBeDefined();
    expect(guard.errors).not.toHaveBeenCalled();
  });
  it("on the first actual GET defers the Core load and sanitizes an import/provider failure", async () => {
    expect(guard.coreEvaluations).toBe(0);
    const response = await publicCoursesRoutes.request("/");
    expect(guard.coreEvaluations).toBe(1);
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(body).not.toContain("BLOCKED_COURSE_BARREL_LOAD_ON_REGISTRATION");
    expect(body).toContain("Не удалось загрузить каталог");
    expect(guard.errors).toHaveBeenCalledTimes(1);
  });
});
