/** G1-POLICY-001: exact approved MODERATOR deny matrix (AG4 handoff).
 * Real Hono middleware/route dispatch, Core mocked, no DB/network.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  jwt: vi.fn(), registration: vi.fn(),
  target: vi.fn(), list: vi.fn(), confirm: vi.fn(), complete: vi.fn(),
  noShow: vi.fn(), reject: vi.fn(), getAvailability: vi.fn(),
  setAvailability: vi.fn(), addDayOff: vi.fn(), removeDayOff: vi.fn(),
  addException: vi.fn(), removeException: vi.fn(),
  adminList: vi.fn(), adminBookings: vi.fn(), adminSet: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", async original => ({
  ...(await original<object>()), verifyAccessToken: m.jwt,
}));
vi.mock("@gafus/core/services/auth", async original => ({
  ...(await original<object>()), isRegistrationCompleted: m.registration,
}));
vi.mock("@gafus/core/services/consultation", async original => ({
  ...(await original<object>()),
  resolveTargetTrainerUserIdForStaff: m.target,
  listTrainerBookings: m.list,
  confirmBookingByTrainer: m.confirm,
  completeBookingByTrainer: m.complete,
  markBookingNoShowByTrainer: m.noShow,
  rejectBookingByTrainer: m.reject,
  getTrainerAvailability: m.getAvailability,
  setTrainerAvailability: m.setAvailability,
  addDayOff: m.addDayOff, removeDayOff: m.removeDayOff,
  addSlotException: m.addException, removeSlotException: m.removeException,
  listAllTrainersForAdmin: m.adminList,
  listAdminBookings: m.adminBookings,
  adminSetListedCynologists: m.adminSet,
}));
import { authMiddleware } from "../../middleware/auth";
import { consultationsRoutes } from "./consultations";

type Role = "MODERATOR" | "ADMIN" | "TRAINER" | "USER" | "PARTNER";
function app() {
  const a = new Hono();
  a.use("/api/v1/consultations/*", authMiddleware);
  a.route("/api/v1/consultations", consultationsRoutes);
  return a;
}
const root = "http://local.test/api/v1/consultations";
function request(role: Role, path: string, method: string) {
  m.jwt.mockResolvedValue({ id: `${role.toLowerCase()}-A`, username: "actor", role });
  return app().request(root + path, {
    method,
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    ...(["POST", "PUT"].includes(method) ? { body: "{}" } : {}),
  });
}
const staff = [
  ["GET", "/trainer/bookings"],
  ["POST", "/trainer/bookings/booking-A/confirm"],
  ["POST", "/trainer/bookings/booking-A/complete"],
  ["POST", "/trainer/bookings/booking-A/no-show"],
  ["POST", "/trainer/bookings/booking-A/reject"],
  ["GET", "/trainer/availability?trainerUserId=trainer-A"],
  ["PUT", "/trainer/availability?trainerUserId=trainer-A"],
  ["POST", "/trainer/day-offs?trainerUserId=trainer-A"],
  ["DELETE", "/trainer/day-offs/day-off-A?trainerUserId=trainer-A"],
  ["POST", "/trainer/exceptions?trainerUserId=trainer-A"],
  ["DELETE", "/trainer/exceptions/exception-A?trainerUserId=trainer-A"],
  ["GET", "/admin/cynologists"],
  ["PUT", "/admin/cynologists/listed"],
  ["GET", "/admin/bookings"],
] as const;
const effects = () => [m.target, m.list, m.confirm, m.complete, m.noShow,
  m.reject, m.getAvailability, m.setAvailability, m.addDayOff, m.removeDayOff,
  m.addException, m.removeException, m.adminList, m.adminBookings, m.adminSet];
beforeEach(() => {
  vi.clearAllMocks();
  m.registration.mockResolvedValue(true);
  m.target.mockResolvedValue("trainer-A");
  m.list.mockResolvedValue([]); m.adminList.mockResolvedValue([]);
  m.adminBookings.mockResolvedValue([]); m.getAvailability.mockResolvedValue({ rules: [] });
});

describe("AG4 approved staff RBAC enforced at Hono before Core", () => {
  it.each(staff)("MODERATOR %s %s denied 403 before Core", async (method, path) => {
    const r = await request("MODERATOR", path, method);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ success: false });
    for (const spy of effects()) expect(spy).not.toHaveBeenCalled();
  });

  it.each(staff)("USER %s %s denied 403", async (method, path) => {
    const r = await request("USER", path, method);
    expect(r.status).toBe(403);
    for (const spy of effects()) expect(spy).not.toHaveBeenCalled();
  });

  it("PARTNER remains denied for trainer list", async () => {
    const r = await request("PARTNER", "/trainer/bookings", "GET");
    expect(r.status).toBe(403);
    expect(m.list).not.toHaveBeenCalled();
  });

  it("ADMIN still reads admin bookings and catalog", async () => {
    expect((await request("ADMIN", "/admin/bookings", "GET")).status).toBe(200);
    expect((await request("ADMIN", "/admin/cynologists", "GET")).status).toBe(200);
    expect(m.adminBookings).toHaveBeenCalledOnce();
    expect(m.adminList).toHaveBeenCalledOnce();
  });

  it("TRAINER still lists own bookings; ADMIN retains trainer-wide list", async () => {
    expect((await request("TRAINER", "/trainer/bookings", "GET")).status).toBe(200);
    expect((await request("ADMIN", "/trainer/bookings", "GET")).status).toBe(200);
    expect(m.list).toHaveBeenNthCalledWith(1, "trainer-A", "TRAINER");
    expect(m.list).toHaveBeenNthCalledWith(2, "admin-A", "ADMIN");
  });

  it("no JWT stays 401 and Core is never called", async () => {
    const r = await app().request(root + "/trainer/bookings");
    expect(r.status).toBe(401);
    for (const spy of effects()) expect(spy).not.toHaveBeenCalled();
  });

  it("forged cookie Origin denied 403 before Core", async () => {
    const r = await app().request(root + "/trainer/availability", {
      method: "PUT", headers: { origin: "https://attacker.invalid", cookie: "gafus_access=bad" },
      body: "{}",
    });
    expect(r.status).toBe(403);
    for (const spy of effects()) expect(spy).not.toHaveBeenCalled();
  });
});
