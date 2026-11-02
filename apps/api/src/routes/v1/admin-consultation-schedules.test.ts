import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  verify: vi.fn(), reg: vi.fn(), dbRole: vi.fn(), target: vi.fn(),
  availability: vi.fn(), editable: vi.fn(), set: vi.fn(), dayAdd: vi.fn(), dayRemove: vi.fn(),
  exceptionAdd: vi.fn(), exceptionRemove: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: f.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: f.reg }));
vi.mock("@gafus/core/services/adminUser", () => ({ readAdminActorRole: f.dbRole }));
vi.mock("@gafus/core/services/consultation", async () => {
  const { z } = await import("zod/v3");
  return {
    resolveTargetTrainerUserIdForStaff: f.target,
    getTrainerAvailability: f.availability, getTrainerEditableSlots: f.editable,
    setTrainerAvailability: f.set, addDayOff: f.dayAdd, removeDayOff: f.dayRemove,
    addSlotException: f.exceptionAdd, removeSlotException: f.exceptionRemove,
    trainerAvailabilityInputSchema: z.object({ rules: z.array(z.object({ weekday: z.number() })) }),
    dayOffInputSchema: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().optional(),
    }),
    slotExceptionInputSchema: z.object({
      startAt: z.string().datetime({ offset: true }),
      endAt: z.string().datetime({ offset: true }),
      reason: z.string().optional(),
    }).refine(x => new Date(x.endAt).getTime() > new Date(x.startAt).getTime()),
  };
});
import { authMiddleware } from "../../middleware/auth";
import { adminConsultationScheduleRoutes } from "./admin-consultation-schedules";
const base = "/api/v1/admin/consultations/schedules";
function app() {
  const h = new Hono();
  h.use(`${base}/*`, authMiddleware);
  h.route(base, adminConsultationScheduleRoutes);
  return h;
}
const range = "?fromUtc=2026-10-25T00%3A00%3A00%2B04%3A00&toUtc=2026-11-08T00%3A00%3A00%2B04%3A00";
function req(path: string, method = "GET", body?: object, authenticated = true) {
  return app().request("http://local.test" + base + path, {
    method, headers: {
      ...(authenticated ? { authorization: "Bearer token" } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const slot = { startAt: "2026-10-27T08:00:00+04:00", endAt: "2026-10-27T09:00:00+04:00" };
beforeEach(() => {
  vi.clearAllMocks();
  f.verify.mockResolvedValue({ id: "admin1", role: "ADMIN", username: "admin" });
  f.reg.mockResolvedValue(true);
  f.dbRole.mockResolvedValue("ADMIN");
  f.target.mockResolvedValue("trainer1");
  f.availability.mockResolvedValue({ rules: [{ weekday: 1 }] });
  f.editable.mockResolvedValue([{ id: "slot1" }]);
});

describe("admin consultations schedules vertical", () => {
  it("401 guest never fetches a trainer", async () => {
    expect((await req("/trainer1" + range, "GET", undefined, false)).status).toBe(401);
    expect(f.target).not.toHaveBeenCalled();
  });
  it("403 MODERATOR cannot edit another trainer", async () => {
    f.verify.mockResolvedValue({ id: "mod1", role: "MODERATOR", username: "mod" });
    expect((await req("/trainer1" + range)).status).toBe(403);
    expect((await req("/trainer1/day-offs", "POST", { date: "2026-10-31" })).status).toBe(403);
    expect(f.target).not.toHaveBeenCalled();
  });
  it("403 old ADMIN token denied after DB demotion", async () => {
    f.dbRole.mockResolvedValue("TRAINER");
    expect((await req("/trainer1" + range)).status).toBe(403);
    expect(f.availability).not.toHaveBeenCalled();
  });
  it("403 when requested target is not actually a trainer", async () => {
    f.target.mockRejectedValue(new Error("Указанный пользователь не тренер"));
    expect((await req("/any1" + range)).status).toBe(403);
    expect(f.availability).not.toHaveBeenCalled();
  });
  it("GET returns editable slots with exact UTC range and no-store", async () => {
    const response = await req("/trainer1" + range);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(f.target).toHaveBeenCalledWith({ id: "admin1", role: "ADMIN" }, "trainer1");
    expect(f.editable).toHaveBeenCalledWith("trainer1",
      new Date("2026-10-25T00:00:00+04:00"), new Date("2026-11-08T00:00:00+04:00"));
    expect((await response.json()).data).toEqual({
      availability: { rules: [{ weekday: 1 }] }, editableSlots: [{ id: "slot1" }],
    });
  });
  it("rejects reversed and too-wide ranges before DB read", async () => {
    expect((await req("/trainer1?fromUtc=2026-10-30T00:00:00Z&toUtc=2026-10-25T00:00:00Z")).status).toBe(400);
    expect((await req("/trainer1?fromUtc=2026-10-01T00:00:00Z&toUtc=2026-10-30T00:00:00Z")).status).toBe(400);
    expect(f.target).not.toHaveBeenCalled();
  });
  it("PUT saves validated weekly availability for selected trainer", async () => {
    const data = { rules: [{ weekday: 1 }] };
    expect((await req("/trainer1", "PUT", data)).status).toBe(200);
    expect(f.set).toHaveBeenCalledWith("trainer1", data);
  });
  it("rejects malformed weekly availability before modifying Core", async () => {
    expect((await req("/trainer1", "PUT", { rules: "fake" })).status).toBe(400);
    expect(f.set).not.toHaveBeenCalled();
  });
  it("POST and DELETE day-offs use the actual chosen trainer", async () => {
    expect((await req("/trainer1/day-offs", "POST", { date: "2026-10-31" })).status).toBe(200);
    expect(f.dayAdd).toHaveBeenCalledWith("trainer1", "2026-10-31", undefined);
    expect((await req("/trainer1/day-offs/holiday1", "DELETE")).status).toBe(200);
    expect(f.dayRemove).toHaveBeenCalledWith("trainer1", "holiday1");
  });
  it("POST and DELETE exceptions preserve timezone and ids", async () => {
    expect((await req("/trainer1/exceptions", "POST", slot)).status).toBe(200);
    expect(f.exceptionAdd).toHaveBeenCalledWith("trainer1", new Date(slot.startAt),
      new Date(slot.endAt), undefined);
    expect((await req("/trainer1/exceptions/exception1", "DELETE")).status).toBe(200);
    expect(f.exceptionRemove).toHaveBeenCalledWith("trainer1", "exception1");
  });
  it("rejects reversed exception dates without touching Core", async () => {
    expect((await req("/trainer1/exceptions", "POST", {
      startAt: slot.endAt, endAt: slot.startAt,
    })).status).toBe(400);
    expect(f.exceptionAdd).not.toHaveBeenCalled();
  });
  it("does not leak exceptions thrown by schedule Core", async () => {
    f.availability.mockRejectedValue(new Error("secret-internal-consultation-db"));
    const res = await req("/trainer1" + range);
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("secret-internal-consultation-db");
  });
});
