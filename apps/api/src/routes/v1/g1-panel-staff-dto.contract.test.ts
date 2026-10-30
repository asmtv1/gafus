/** G1-PANEL-CONS-001: real 14 Hono methods, Core/service mocked.
 * No database, queue, remote, payments or shared test fixtures.
 */
import { Hono } from "hono";
import type { ConsultationBookingDto } from "@gafus/consultation-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  jwt: vi.fn(), registration: vi.fn(), target: vi.fn(),
  bookings: vi.fn(), confirm: vi.fn(), complete: vi.fn(), noShow: vi.fn(), reject: vi.fn(),
  availability: vi.fn(), setAvailability: vi.fn(), dayOff: vi.fn(), removeDay: vi.fn(),
  exception: vi.fn(), removeException: vi.fn(),
  adminTrainers: vi.fn(), adminBookings: vi.fn(), adminListed: vi.fn(),
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
  listTrainerBookings: m.bookings,
  confirmBookingByTrainer: m.confirm, completeBookingByTrainer: m.complete,
  markBookingNoShowByTrainer: m.noShow, rejectBookingByTrainer: m.reject,
  getTrainerAvailability: m.availability, setTrainerAvailability: m.setAvailability,
  addDayOff: m.dayOff, removeDayOff: m.removeDay,
  addSlotException: m.exception, removeSlotException: m.removeException,
  listAllTrainersForAdmin: m.adminTrainers, listAdminBookings: m.adminBookings,
  adminSetListedCynologists: m.adminListed,
}));
import {
  ConsultationForbiddenError, ConsultationNotFoundError, ConsultationSlotTakenError,
} from "@gafus/core/services/consultation";
import { authMiddleware } from "../../middleware/auth";
import { consultationsRoutes } from "./consultations";

type Role = "TRAINER" | "ADMIN" | "MODERATOR";
const base = "http://local.test/api/v1/consultations";
function request(method: string, path: string, role: Role = "TRAINER", body?: object) {
  const userId = role === "TRAINER" ? "trainer-A" : role === "ADMIN" ? "admin-A" : "mod-A";
  m.jwt.mockResolvedValue({ id: userId, role, username: userId });
  const h = new Hono();
  h.use("/api/v1/consultations/*", authMiddleware);
  h.route("/api/v1/consultations", consultationsRoutes);
  return h.request(base + path, {
    method, headers: { authorization: "Bearer test", ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const day = { date: "2026-11-08", reason: "Отдых" };
const rule = { rules: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }] };
const availabilityDto = {
  rules: [{ id: "rule-A", ...rule.rules[0], isWorkingDay: true }],
  dayOffs: [{ id: "off-A", date: "2026-11-08", reason: "Отдых" }],
  exceptions: [], slotDurationMin: 60,
};
const bookingDto: ConsultationBookingDto = {
  id: "booking-A", status: "CONFIRMED",
  slot: { id: "slot-A", status: "BOOKED",
    startAtUtc: "2026-11-01T12:00:00.000Z", endAtUtc: "2026-11-01T13:00:00.000Z" },
  cynologistUserId: "trainer-A", cynologistDisplayName: "Кинолог",
  clientUsername: "student-A", clientOwnerName: "Тест", clientPhone: null,
  petName: "Питомец", petGender: "MALE", petAge: "2 года", petBreed: null,
  clientProblem: "Тестовая проблема", clientSelfHelpAttempt: null,
  cancelReason: null, confirmationDeadlineAt: "2026-10-31T20:00:00.000Z",
  createdAt: "2026-10-16T00:00:00.000Z",
};
const trainerCard = { userId: "trainer-A", username: "trainer", fullName: "Кинолог",
  avatarUrl: null, about: null, isListed: true, cynologistId: "cyno-A" };

const except = { startAt: "2026-11-08T09:00:00+00:00", endAt: "2026-11-08T10:00:00+00:00" };
const assertPrivate = (r: Response) => expect(r.headers.get("cache-control")).toBe("private, no-store");
beforeEach(() => {
  vi.clearAllMocks(); m.registration.mockResolvedValue(true);
  m.target.mockImplementation(async (actor: { id: string; role: Role }, target?: string) => {
    if (actor.role === "TRAINER" && (!target || target === actor.id)) return actor.id;
    if (actor.role === "ADMIN" && target === "trainer-A") return target;
    throw new ConsultationForbiddenError();
  });
  m.bookings.mockResolvedValue([bookingDto]);
  m.availability.mockResolvedValue(availabilityDto);
  m.adminTrainers.mockResolvedValue([trainerCard]);
  m.adminBookings.mockResolvedValue([]);
});

describe("G1 all staff method success DTOs and no-store", () => {
  it("GET trainer bookings returns Core array in success.data", async () => {
    const r = await request("GET", "/trainer/bookings");
    expect(r.status).toBe(200); assertPrivate(r);
    expect(await r.json()).toEqual({ success: true, data: [bookingDto] });
    expect(m.bookings).toHaveBeenCalledWith("trainer-A", "TRAINER");
  });
  it.each([
    ["confirm", "confirm"], ["complete", "complete"], ["no-show", "noShow"],
  ] as const)("POST %s returns bookingId and forwards actor", async (action, fn) => {
    const r = await request("POST", `/trainer/bookings/booking-A/${action}`);
    expect(r.status).toBe(200); assertPrivate(r);
    expect(await r.json()).toEqual({ success: true, data: { bookingId: "booking-A" } });
    expect(m[fn]).toHaveBeenCalledWith("trainer-A", "TRAINER", "booking-A");
  });
  it("POST reject uses optional max-500 reason in Core call", async () => {
    const r = await request("POST", "/trainer/bookings/booking-A/reject", "TRAINER", { reason: "На перенос" });
    expect(r.status).toBe(200); assertPrivate(r);
    expect(await r.json()).toEqual({ success: true, data: { bookingId: "booking-A" } });
    expect(m.reject).toHaveBeenCalledWith("trainer-A", "TRAINER", "booking-A", "На перенос");
  });
  it("GET own availability returns raw Core rule DTO in success.data", async () => {
    const r = await request("GET", "/trainer/availability");
    expect(r.status).toBe(200); assertPrivate(r);
    expect(await r.json()).toEqual({ success: true, data: availabilityDto });
    expect(m.availability).toHaveBeenCalledWith("trainer-A");
  });
  it("PUT availability validates time/weekday and defaults isWorkingDay=true", async () => {
    const r = await request("PUT", "/trainer/availability", "TRAINER", rule);
    expect(r.status).toBe(200); assertPrivate(r);
    expect(await r.json()).toEqual({ success: true, data: {} });
    expect(m.setAvailability).toHaveBeenCalledWith("trainer-A", {
      rules: [{ ...rule.rules[0], isWorkingDay: true }],
    });
  });
  it("POST day-off validates YYYY-MM-DD and forwards owner + reason", async () => {
    const r = await request("POST", "/trainer/day-offs", "TRAINER", day);
    expect(r.status).toBe(200); assertPrivate(r);
    expect(await r.json()).toEqual({ success: true, data: {} });
    expect(m.dayOff).toHaveBeenCalledWith("trainer-A", day.date, day.reason);
  });
  it("DELETE day-off forwards the exact id and resolved owner", async () => {
    const r = await request("DELETE", "/trainer/day-offs/dayoff-A");
    expect(r.status).toBe(200); assertPrivate(r);
    expect(await r.json()).toEqual({ success: true, data: {} });
    expect(m.removeDay).toHaveBeenCalledWith("trainer-A", "dayoff-A");
  });
  it("POST exception normalizes ISO instants and optional reason", async () => {
    const r = await request("POST", "/trainer/exceptions", "TRAINER", except);
    expect(r.status).toBe(200); assertPrivate(r);
    expect(await r.json()).toEqual({ success: true, data: {} });
    expect(m.exception).toHaveBeenCalledWith(
      "trainer-A", new Date(except.startAt), new Date(except.endAt), undefined,
    );
  });
  it("DELETE exception forwards the exact id and resolved owner", async () => {
    const r = await request("DELETE", "/trainer/exceptions/exception-A");
    expect(r.status).toBe(200); assertPrivate(r);
    expect(await r.json()).toEqual({ success: true, data: {} });
    expect(m.removeException).toHaveBeenCalledWith("trainer-A", "exception-A");
  });
  it("GET admin cynologists returns list with exact wrapper", async () => {
    const r = await request("GET", "/admin/cynologists", "ADMIN");
    expect(r.status).toBe(200); assertPrivate(r);
    expect(await r.json()).toEqual({ success: true, data: [trainerCard] });
    expect(m.adminTrainers).toHaveBeenCalledOnce();
  });
  it("GET admin bookings returns an unpaginated Core array, not items/nextCursor", async () => {
    const r = await request("GET", "/admin/bookings", "ADMIN");
    expect(r.status).toBe(200); assertPrivate(r);
    expect(await r.json()).toEqual({ success: true, data: [] });
    expect(m.adminBookings).toHaveBeenCalledOnce();
  });
  it("PUT admin listing accepts JSON object, sends array + actual admin actor", async () => {
    const r = await request("PUT", "/admin/cynologists/listed", "ADMIN", {
      cynologistUserIds: ["trainer-A"],
    });
    expect(r.status).toBe(200); assertPrivate(r);
    expect(await r.json()).toEqual({ success: true, data: {} });
    expect(m.adminListed).toHaveBeenCalledWith("admin-A", "ADMIN", ["trainer-A"]);
  });
  it.each([
    ["POST", "/trainer/bookings/booking-A/reject", { reason: "x".repeat(501) }, "reject"],
    ["PUT", "/trainer/availability", { rules: [{ weekday: 8, startTime: "17:00", endTime: "09:00" }] }, "setAvailability"],
    ["POST", "/trainer/day-offs", { date: "11/08/26" }, "dayOff"],
    ["POST", "/trainer/exceptions", { startAt: except.endAt, endAt: except.startAt }, "exception"],
    ["PUT", "/admin/cynologists/listed", ["trainer-A"], "adminListed"],
  ] as const)("invalid %s %s yields 400 before Core", async (method, path, body, handler) => {
    const role: Role = path.startsWith("/admin") ? "ADMIN" : "TRAINER";
    const r = await request(method, path, role, body);
    expect(r.status).toBe(400); assertPrivate(r);
    expect(m[handler]).not.toHaveBeenCalled();
  });
  it("TRAINER-B cannot read foreign availability", async () => {
    const h = new Hono();
    h.use("/api/v1/consultations/*", authMiddleware);
    h.route("/api/v1/consultations", consultationsRoutes);
    m.jwt.mockResolvedValue({ id: "trainer-B", role: "TRAINER", username: "trainerB" });
    const r = await h.request(base + "/trainer/availability?trainerUserId=trainer-A", {
      headers: { authorization: "Bearer test" },
    });
    expect(r.status).toBe(403); assertPrivate(r);
    expect(await r.json()).toMatchObject({ success: false, code: "CONSULTATION_FORBIDDEN" });
    expect(m.availability).not.toHaveBeenCalled();
  });
  it("ADMIN needs explicit verified target and never defaults to another account", async () => {
    const ok = await request("GET", "/trainer/availability?trainerUserId=trainer-A", "ADMIN");
    expect(ok.status).toBe(200); assertPrivate(ok);
    expect(m.target).toHaveBeenCalledWith({ id: "admin-A", role: "ADMIN" }, "trainer-A");
    const denied = await request("GET", "/trainer/availability", "ADMIN");
    expect(denied.status).toBe(403); assertPrivate(denied);
  });
  it("MODERATOR cannot relist catalog, no-store even on 403", async () => {
    const r = await request("PUT", "/admin/cynologists/listed", "MODERATOR", { cynologistUserIds: [] });
    expect(r.status).toBe(403); assertPrivate(r);
    expect(m.adminListed).not.toHaveBeenCalled();
  });
  it("missing Core booking yields stable 404", async () => {
    m.confirm.mockRejectedValueOnce(new ConsultationNotFoundError("Бронирование"));
    const r = await request("POST", "/trainer/bookings/absent/confirm");
    expect(r.status).toBe(404); assertPrivate(r);
    expect(await r.json()).toMatchObject({ success: false, code: "CONSULTATION_NOT_FOUND" });
  });
  it("Core conflict maps to stable 409", async () => {
    m.confirm.mockRejectedValueOnce(new ConsultationSlotTakenError());
    const r = await request("POST", "/trainer/bookings/booking-A/confirm");
    expect(r.status).toBe(409); assertPrivate(r);
    expect(await r.json()).toMatchObject({ success: false, code: "CONSULTATION_SLOT_TAKEN" });
  });
  it("Core failure is generic 500 without leaked diagnostic", async () => {
    m.adminBookings.mockRejectedValueOnce(new Error("INTERNAL_STAFF_TEST_SECRET"));
    const r = await request("GET", "/admin/bookings", "ADMIN");
    expect(r.status).toBe(500); assertPrivate(r);
    const payload = await r.text();
    expect(payload).not.toContain("INTERNAL_STAFF_TEST_SECRET");
    expect(JSON.parse(payload)).toEqual({ success: false, error: "Внутренняя ошибка сервера" });
  });
}); // G1_PANEL_DTO_SUITE_COMPLETE
