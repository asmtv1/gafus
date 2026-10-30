/** Synthetic-only confirmed log-privacy regression; NOT real reminder DB writes. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  audit: vi.fn(), list: vi.fn(), update: vi.fn(), remove: vi.fn(),
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: m.audit }),
}));
vi.mock("@gafus/core/services/reminders", () => ({
  getReminders: m.list, updateReminder: m.update, deleteReminder: m.remove,
  createReminder: vi.fn(), createReminderAG4: vi.fn(), lookupReminderAG4: vi.fn(),
  ReminderConflictError: class ReminderConflictError extends Error {},
  ReminderUnknownError: class ReminderUnknownError extends Error {},
  ReminderInvalidError: class ReminderInvalidError extends Error {},
  ReminderCapError: class ReminderCapError extends Error {},
}));
import { remindersRoutes } from "./g1-reminder-private-error-log.candidate.review";
const app = new Hono();
app.use("/api/v1/reminders/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.set("user", { id: "synthetic-owner", username: "synthetic", role: "USER" });
  await next();
});
app.route("/api/v1/reminders", remindersRoutes);
const canary = "SYNTHETIC_PRIVATE_ERROR_CANARY_DO_NOT_LOG";
beforeEach(() => { vi.clearAllMocks(); });
const verify = async (res: Response, event: string) => {
  expect(res.status).toBe(500);
  expect(res.headers.get("cache-control")).toContain("no-store");
  expect(await res.json()).toEqual({ success: false, error: "Внутренняя ошибка" });
  expect(m.audit).toHaveBeenCalledTimes(1);
  const [label, err] = m.audit.mock.calls[0] as [string, Error];
  expect(label).toBe(`${event} reminders error`);
  expect(err.message).toBe(`REMINDER_${event === "GET" ? "READ" : event === "PUT" ? "UPDATE" : event}_FAILED`);
  expect(JSON.stringify(m.audit.mock.calls)).not.toContain(canary);
};
describe("Reminder readonly/list + update/delete error logging is privacy safe", () => {
  it("P00 owner-scoped keyless GET is read-only with private no-store", async () => {
    m.list.mockResolvedValueOnce([{ id: "synthetic-owned", name: "Training" }]);
    const res = await app.request("/api/v1/reminders");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.json()).toEqual({ success: true, data: [
      { id: "synthetic-owned", name: "Training" },
    ] });
    expect(m.list).toHaveBeenCalledExactlyOnceWith("synthetic-owner");
    expect(m.update).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });
  it("P01 owner GET list must not log raw ORM response or owner exception", async () => {
    m.list.mockRejectedValueOnce(new Error(canary));
    await verify(await app.request("/api/v1/reminders"), "GET");
  });
  it("P02 owner PUT must not log private payload/ORM exception", async () => {
    m.update.mockRejectedValueOnce(new Error(canary));
    await verify(await app.request("/api/v1/reminders/synthetic-one", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "synthetic training" }),
    }), "PUT");
  });
  it("P03 owner DELETE must not log raw ORM exception", async () => {
    m.remove.mockRejectedValueOnce(new Error(canary));
    await verify(await app.request("/api/v1/reminders/synthetic-one", { method: "DELETE" }), "DELETE");
  });
});
