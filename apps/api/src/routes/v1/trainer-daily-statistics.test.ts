import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createTrainerDailyStatisticsRoutes, type TrainerDailyStatisticsPorts } from
  "./trainer-daily-statistics";

const schedule = [{ id: "schedule-A", date: "2026-10-25", isPublished: true,
  bundle: { id: "bundle-A", title: "Тренировка", type: "daily_course", stepsCount: 3 },
  createdBy: { id: "trainer-A", username: "trainer" } }];
const stats = { scheduleId: "schedule-A", mskDate: "2026-10-25", bundleId: "bundle-A",
  title: "Тренировка", totalSteps: 3,
  summary: { openedUsers: 2, startedUsers: 1, completedUsers: 1, openedWithoutStartUsers: 1 },
  users: [],
};
const make = (role: "TRAINER" | "ADMIN" | "MODERATOR" | "USER" = "TRAINER") => {
  const ports: TrainerDailyStatisticsPorts = {
    today: () => "2026-10-25",
    range: vi.fn(async () => schedule),
    statistics: vi.fn(async () => stats),
  };
  const app = new Hono();
  app.use("/*", async (c, next) => {
    c.set("user", { id: "trainer-A", role, username: "trainer" });
    await next();
  });
  app.route("/daily", createTrainerDailyStatisticsRoutes(ports));
  return { ports, get: (query = "") => app.request("/daily" + query) };
};
describe("trainer daily-course statistics Next source parity (injected Core)", () => {
  it("defaults to Moscow 30-day range, uses first owned schedule and full statistics", async () => {
    const { ports, get } = make();
    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json() as {
      success: boolean; data: { selectedScheduleId: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.selectedScheduleId).toBe("schedule-A");
    expect(ports.range).toHaveBeenCalledWith({ id: "trainer-A", role: "TRAINER" },
      { from: "2026-10-25", to: "2026-11-23" });
    expect(ports.statistics).toHaveBeenCalledWith({ id: "trainer-A", role: "TRAINER" },
      { scheduleId: "schedule-A" });
  });
  it("ignores unknown selected schedule exactly like Next, never reads foreign schedule", async () => {
    const { ports, get } = make();
    expect((await get("?scheduleId=foreign&from=2026-10-21&to=2026-10-26")).status).toBe(200);
    expect(ports.statistics).toHaveBeenCalledWith(expect.anything(), { scheduleId: "schedule-A" });
  });
  it("returns real empty schedule with null stats instead of private fallback", async () => {
    const { ports, get } = make();
    vi.mocked(ports.range).mockResolvedValueOnce([]);
    const response = await get();
    expect((await response.json()).data).toEqual({
      schedule: [], selectedScheduleId: null, statistics: null,
    });
    expect(ports.statistics).not.toHaveBeenCalled();
  });
  it("rejects malformed/repeated dates and unauthorized actor before Core", async () => {
    const { ports, get } = make();
    for (const query of ["?from=2026-02-30", "?from=2026-11-04&to=2026-10-25",
      "?extra=true", "?from=2026-10-25&from=2026-10-26", "?scheduleId=bad%2Fid"])
      expect((await get(query)).status).toBe(400);
    expect(ports.range).not.toHaveBeenCalled();
    const user = make("USER");
    expect((await user.get()).status).toBe(403);
    expect(user.ports.range).not.toHaveBeenCalled();
  });
  it("does not turn Core failure into no-users success or leak exceptions", async () => {
    const { ports, get } = make();
    vi.mocked(ports.statistics).mockRejectedValueOnce(new Error("SECRET_OWNERS_PRIVATE"));
    const response = await get();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("SECRET_OWNERS_PRIVATE");
  });
});
