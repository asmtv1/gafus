/**
 * Source-only negative import boundary for the existing guest catalog route.
 * The actual course-server producer, DB, queues, media and provider code MUST NOT load
 * during route registration. Request-time loading retains original fail-closed 500.
 */
import { describe, expect, it, vi } from "vitest";

const guard = vi.hoisted(() => ({ serverEvaluations: 0, errors: vi.fn() }));

vi.mock("@gafus/course-server/public-catalog", () => {
  guard.serverEvaluations++;
  throw Error("BLOCKED_PUBLIC_CATALOG_PROVIDER_ON_REGISTRATION");
});
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: guard.errors }),
}));

import { publicCoursesRoutes } from "./public-courses";

describe("COURSE030 real guest Hono route registration is import safe", () => {
  it("registers the existing GET without importing any server public catalog at module evaluation", () => {
    expect(guard.serverEvaluations).toBe(0);
    expect(publicCoursesRoutes).toBeDefined();
    expect(guard.errors).not.toHaveBeenCalled();
  });
  it("on the first actual GET defers the server producer load and sanitizes an import/provider failure", async () => {
    expect(guard.serverEvaluations).toBe(0);
    const response = await publicCoursesRoutes.request("/");
    expect(guard.serverEvaluations).toBe(1);
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(body).not.toContain("BLOCKED_PUBLIC_CATALOG_PROVIDER_ON_REGISTRATION");
    expect(body).toContain("Не удалось загрузить каталог");
    expect(guard.errors).toHaveBeenCalledTimes(1);
  });
});
