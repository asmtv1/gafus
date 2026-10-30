import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@gafus/core/services/reminders", () => ({
  getReminders: vi.fn(), updateReminder: vi.fn(), deleteReminder: vi.fn(),
  createReminder: create,
}));
import { remindersRoutes } from "./reminders";
const h = new Hono();
h.use("/api/v1/reminders/*", async (c, next) => {
  c.set("user", { id: "owner-a", username: "a", role: "USER" });
  await next();
});
h.route("/api/v1/reminders", remindersRoutes);
const post = (reminderTime: string) => h.request("/api/v1/reminders", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Walk", reminderTime }),
});
describe("Legacy keyless contract remains unmodified before AG4 shared gate", () => {
  it("L01 no UUID preserves Core 5-argument call and response", async () => {
    create.mockResolvedValueOnce({ id: "r-legacy", name: "Walk" });
    const response = await post("09:00");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: {
      id: "r-legacy", name: "Walk",
    } });
    expect(create).toHaveBeenCalledExactlyOnceWith(
      "owner-a", "Walk", "09:00", undefined, undefined,
    );
  });
  it("L02 invalid time rejects create before DB call", async () => {
    create.mockClear();
    expect((await post("29:10")).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
