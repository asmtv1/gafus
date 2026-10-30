import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createTrainerDailyManageRoutes, type TrainerDailyManagePorts } from "./trainer-daily-manage";

const bundle = { title: "Курс дня", equipment: "Поводок", description: "Проработка команд",
  type: "daily_course", stepIds: ["a1", "a2"] };
const schedule = { date: "2026-11-15", bundleId: "bundle-1", isPublished: true };
const make = (role: "TRAINER" | "ADMIN" | "MODERATOR" | "USER" = "TRAINER") => {
  const ports = {
    putBundle: vi.fn(async () => ({ success: true as const, id: "bundle-1" })),
    deleteBundle: vi.fn(async () => ({ success: true as const })),
    putSchedule: vi.fn(async () => ({ success: true as const, id: "schedule-1" })),
    deleteSchedule: vi.fn(async () => ({ success: true as const })),
  } satisfies TrainerDailyManagePorts;
  const app = new Hono();
  app.use("/*", async (c, next) => {
    c.set("user", { id: "trainer-A", username: "trainer", role });
    await next();
  });
  app.route("/manage", createTrainerDailyManageRoutes(ports));
  const json = (path: string, value: unknown) => app.request(`/manage/${path}`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(value),
  });
  const del = (path: string) => app.request(`/manage/${path}`, { method: "DELETE" });
  return { ports, json, del };
};
describe("daily-course mutable owner-guarded authoring API", () => {
  it("creates or updates bundle via original Core with actor derived from JWT", async () => {
    const { json, ports } = make();
    const response = await json("bundles", bundle);
    expect(response.status).toBe(200);
    expect(ports.putBundle).toHaveBeenCalledWith({ id: "trainer-A", role: "TRAINER" }, bundle);
    expect((await response.json()).success).toBe(true);
    expect((await json("bundles", { ...bundle, authorId: "foreign" })).status).toBe(400);
    expect(ports.putBundle).toHaveBeenCalledTimes(1);
  });
  it("updates scheduled future date via existing Core guards", async () => {
    const { json, ports } = make("ADMIN");
    expect((await json("schedule", schedule)).status).toBe(200);
    expect(ports.putSchedule).toHaveBeenCalledWith(
      { id: "trainer-A", role: "ADMIN" }, schedule,
    );
    expect((await json("schedule", { ...schedule, injectedAuthor: "other" })).status).toBe(400);
    expect((await json("schedule", { ...schedule, isPublished: "true" })).status).toBe(400);
    expect(ports.putSchedule).toHaveBeenCalledTimes(1);
  });
  it("denies trainer schedule upsert until Core owns global date replacement atomically", async () => {
    const { json, ports } = make("TRAINER");
    expect((await json("schedule", schedule)).status).toBe(403);
    expect(ports.putSchedule).not.toHaveBeenCalled();
  });
  it("delete bundle/schedule delegates by typed ID but never creates global cleanup", async () => {
    const { del, ports } = make();
    expect((await del("bundles/bundle-1")).status).toBe(200);
    expect((await del("schedule/schedule-1")).status).toBe(200);
    expect(ports.deleteBundle).toHaveBeenCalledWith({ id: "trainer-A", role: "TRAINER" },
      { bundleId: "bundle-1" });
    expect(ports.deleteSchedule).toHaveBeenCalledWith({ id: "trainer-A", role: "TRAINER" },
      { scheduleId: "schedule-1" });
  });
  it("rejects moderator USER and PARTNER-equivalent via staff gate", async () => {
    for (const role of ["MODERATOR", "USER"] as const) {
      const { json, del, ports } = make(role);
      expect((await json("bundles", bundle)).status).toBe(403);
      expect((await json("schedule", schedule)).status).toBe(403);
      expect((await del("bundles/bundle-1")).status).toBe(403);
      expect(ports.putBundle).not.toHaveBeenCalled();
      expect(ports.deleteBundle).not.toHaveBeenCalled();
      expect(ports.putSchedule).not.toHaveBeenCalled();
    }
  });
  it("never reports Core conflict/foreign target as successful save", async () => {
    const { json, ports } = make();
    ports.putBundle.mockRejectedValueOnce(new Error("PRIVATE_OTHER_TRAINER"));
    const response = await json("bundles", bundle);
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).not.toContain("PRIVATE_OTHER_TRAINER");
  });
});
