/** Actual authMiddleware + dailyCourseRoutes, Core mocked: ambient-cookie GET true must be CSRF guarded. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  verify: vi.fn(),
  completed: vi.fn(),
  day: vi.fn(),
  today: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: m.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: m.completed }));
vi.mock("@gafus/core/services/dailyCourse", () => ({
  getDailyCourseDayWithUserSteps: m.day,
  getTodayDailyCourse: m.today,
  updateDailyCourseStepAndDay: m.update,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));
import { authMiddleware } from "../../middleware/auth";
import { dailyCourseRoutes } from "./daily-course";
function app() {
  const a = new Hono();
  a.use("/api/v1/daily-course/*", authMiddleware);
  a.route("/api/v1/daily-course", dailyCourseRoutes);
  return a;
}
function send(flag: string | undefined, headers: Record<string, string> = {}) {
  const search = new URLSearchParams({ scheduleId: "test-schedule" });
  if (flag !== undefined) search.set("createIfMissing", flag);
  return app().request("http://local.test/api/v1/daily-course/day?" + search, { headers });
}
const cookie = { cookie: "gafus_access=test-only-cookie" };
const bearer = { authorization: "Bearer synthetic-valid-token" };
beforeEach(() => {
  vi.clearAllMocks();
  m.verify.mockResolvedValue({ id: "a", username: "ownerA", role: "USER" });
  m.completed.mockResolvedValue(true);
  m.day.mockResolvedValue({ scheduleId: "test-schedule", steps: [], userStatus: "NOT_STARTED" });
});
describe("G1 daily explicit GET initializer CSRF/auth/cache boundary", () => {
  it("CS01 cookie GET true absent Origin -> 403 no Core mutation", async () => {
    const r = await send("true", cookie);
    expect(r.status).toBe(403);
    expect(r.headers.get("cache-control")).toMatch(/no-store/);
    expect(m.day).not.toHaveBeenCalled();
  });
  it("CS02 cookie GET true hostile Origin -> 403 no Core mutation", async () => {
    const r = await send("true", { ...cookie, origin: "https://evil.invalid" });
    expect(r.status).toBe(403);
    expect(m.day).not.toHaveBeenCalled();
  });
  it("CS03 trusted exact HTTPS Origin + cookie GET true -> 200 explicit opt-in compatibility", async () => {
    const r = await send("true", { ...cookie, origin: "https://gafus.ru" });
    expect(r.status).toBe(200);
    expect(m.day).toHaveBeenCalledWith("a", "test-schedule", { createIfMissing: true });
    expect(r.headers.get("cache-control")).toMatch(/no-store/);
  });
  it("CS04 explicit native Bearer GET true ignores Origin, init compatible", async () => {
    const r = await send("true", { ...bearer, origin: "https://evil.invalid" });
    expect(r.status).toBe(200);
    expect(m.day).toHaveBeenCalledWith("a", "test-schedule", { createIfMissing: true });
  });
  it("CS05 cookie GET false hostile Origin remains ordinary read", async () => {
    const r = await send("false", { ...cookie, origin: "https://evil.invalid" });
    expect(r.status).toBe(200);
    expect(m.day).toHaveBeenCalledWith("a", "test-schedule", { createIfMissing: false });
  });
  it("CS06 cookie GET without flag and no Origin remains ordinary read", async () => {
    const r = await send(undefined, cookie);
    expect(r.status).toBe(200);
    expect(m.day).toHaveBeenCalledWith("a", "test-schedule", { createIfMissing: false });
  });
  it("CS07 missing auth rejects before body dispatch", async () => {
    const r = await send("true");
    expect(r.status).toBe(401);
    expect(m.day).not.toHaveBeenCalled();
  });
  it("CS08 invalid bearer never falls back to ambient cookie", async () => {
    m.verify.mockResolvedValue(null);
    const r = await send("true", { ...cookie, authorization: "Bearer invalid" });
    expect(r.status).toBe(401);
    expect(m.day).not.toHaveBeenCalled();
  });
});
