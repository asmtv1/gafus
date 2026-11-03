import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createTrainerStepManageRoutes, createTrainerDayManageRoutes,
  type TrainerContentPorts } from "./trainer-content-manage";

type Role = "TRAINER" | "ADMIN" | "MODERATOR" | "USER";
function setup(role: Role = "TRAINER") {
  const ports: TrainerContentPorts = {
    step: { read: vi.fn(), update: vi.fn(), remove: vi.fn(async () => ({ success: true })) },
    day: { read: vi.fn(), update: vi.fn(), remove: vi.fn(async () => ({ success: true })),
      countSteps: vi.fn() },
  } as unknown as TrainerContentPorts;
  const app = new Hono();
  app.use("*", async (c, next) => { c.set("user", { id: "trainer_1",
    username: "trainer", role }); await next(); });
  app.route("/steps/manage", createTrainerStepManageRoutes(ports));
  app.route("/days/manage", createTrainerDayManageRoutes(ports));
  const send = (kind: "steps" | "days", body: unknown, query = "") => app.request(
    `/${kind}/manage/batch${query}`, { method: "DELETE", headers: {
      "Content-Type": "application/json",
    }, body: JSON.stringify(body) });
  return { ports, app, send };
}
describe("trainer content batch removal with transactional Core ownership check", () => {
  it("passes exact validated distinct step and day IDs to owner-scoped atomic Core service", async () => {
    const { send, ports } = setup();
    const step = await send("steps", { stepIds: ["step_a", "step_b"] });
    expect(step.status).toBe(200);
    expect(step.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await step.json()).toEqual({ success: true, count: 2 });
    expect(ports.step.remove).toHaveBeenCalledWith({ stepIds: ["step_a", "step_b"] },
      { id: "trainer_1", role: "TRAINER" });
    const day = await send("days", { dayIds: ["day_a", "day_b"] });
    expect(day.status).toBe(200);
    expect(ports.day.remove).toHaveBeenCalledWith({ dayIds: ["day_a", "day_b"] },
      { id: "trainer_1", role: "TRAINER" });
  });
  it("rejects malformed payloads, duplicates, owner override, unknown keys and excessive batch", async () => {
    const { send, ports } = setup();
    const invalid = [
      {}, { stepIds: [] }, { stepIds: ["one", "one"] },
      { stepIds: ["../"] }, { stepIds: ["one"], ownerId: "foreign" },
      { stepIds: Array.from({ length: 101 }, (_, i) => `s_${i}`) },
      { dayIds: ["day_a"] }, { stepIds: [4] },
    ];
    for (const payload of invalid) expect((await send("steps", payload)).status).toBe(400);
    expect((await send("steps", { stepIds: ["one"] }, "?actor=foreign")).status).toBe(400);
    expect(ports.step.remove).not.toHaveBeenCalled();
    for (const payload of [{}, { dayIds: ["a", "a"] }, { dayIds: ["a"], role: "ADMIN" }])
      expect((await send("days", payload)).status).toBe(400);
    expect(ports.day.remove).not.toHaveBeenCalled();
  });
  it("denies non-authoring roles before Core and masks Core failures", async () => {
    for (const role of ["MODERATOR", "USER"] as const) {
      const { send, ports } = setup(role);
      expect((await send("steps", { stepIds: ["a"] })).status).toBe(403);
      expect((await send("days", { dayIds: ["a"] })).status).toBe(403);
      expect(ports.step.remove).not.toHaveBeenCalled();
      expect(ports.day.remove).not.toHaveBeenCalled();
    }
    const { send, ports } = setup();
    vi.mocked(ports.day.remove).mockRejectedValueOnce(Error("PRIVATE_DATABASE_ERROR"));
    const response = await send("days", { dayIds: ["a", "b"] });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("PRIVATE_DATABASE_ERROR");
    vi.mocked(ports.step.remove).mockResolvedValueOnce({ success: false });
    expect((await send("steps", { stepIds: ["a", "b"] })).status).toBe(409);
  });
});
