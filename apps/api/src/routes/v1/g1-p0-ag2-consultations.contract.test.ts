/** AG1/AG2 P0 G11-G13: real Hono route, auth, validation and error mapper;
 * consultation Core + rate limit mocked, NO Redis/Prisma/provider network.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  jwt: vi.fn(), registration: vi.fn(),
  list: vi.fn(), eligibility: vi.fn(), slotsAccess: vi.fn(), bookingAccess: vi.fn(),
  bookingEligibility: vi.fn(), slots: vi.fn(), calendar: vi.fn(), days: vi.fn(),
  verify: vi.fn(), book: vi.fn(), my: vi.fn(), cancel: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", async original => ({
  ...(await original<object>()), verifyAccessToken: m.jwt,
}));
vi.mock("@gafus/core/services/auth", async original => ({
  ...(await original<object>()), isRegistrationCompleted: m.registration,
}));
vi.mock("@gafus/core/services/consultation", async original => ({
  ...(await original<object>()),
  listListedCynologists: m.list,
  getConsultationBookingEligibility: m.eligibility,
  requireConsultationSlotsSubscriptionAccess: m.slotsAccess,
  requireConsultationBookingSubscriptionAccess: m.bookingAccess,
  requireConsultationBookingEligibility: m.bookingEligibility,
  getAvailableSlots: m.slots, getCalendarSlots: m.calendar,
  getCynologistDayOffDates: m.days,
  verifyConsultationSlotFreeForCynologist: m.verify,
  bookSlotWithSubscription: m.book, listClientBookings: m.my,
  cancelBookingByUser: m.cancel,
}));
vi.mock("../../middleware/rate-limit.js", async original => ({
  ...(await original<object>()),
  consultationBookRateLimiter: async (_c: unknown, next: () => Promise<void>) => next(),
}));
import {
  ConsultationBookingNotIncludedError, ConsultationBookingRestrictedError,
  ConsultationForbiddenError, ConsultationNotFoundError, ConsultationSlotTakenError,
} from "@gafus/core/services/consultation";
import { SubscriptionRequiredError } from "@gafus/core/services/appSubscription";
import { authMiddleware } from "../../middleware/auth";
import { consultationsRoutes } from "./consultations";

const prefix = "http://local.test/api/v1/consultations";
const uuid = "2bc12ef8-8baf-4977-9101-6ac5407957d2";
const booking = {
  slotId: "slot-A", idempotencyKey: uuid, clientOwnerName: "Пользователь",
  clientPhone: "+79990000000", petName: "Тест", petGender: "MALE",
  petAge: "2 года", petBreed: "Метис", clientProblem: "Проверка поведения питомца",
  clientSelfHelpAttempt: "Пробовали",
};
function app() {
  const h = new Hono();
  h.use("/api/v1/consultations/*", authMiddleware);
  h.route("/api/v1/consultations", consultationsRoutes);
  return h;
}
function req(path: string, method = "GET", body?: object) {
  return app().request(prefix + path, { method,
    headers: { authorization: "Bearer test", ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const noStore = (r: Response) => expect(r.headers.get("cache-control")).toContain("no-store");
beforeEach(() => {
  vi.clearAllMocks();
  m.jwt.mockResolvedValue({ id: "user-A", role: "USER", username: "user-a" });
  m.registration.mockResolvedValue(true);
  m.list.mockResolvedValue([{ id: "cyn-A", userId: "trainer-A", displayName: "Кинолог" }]);
  m.eligibility.mockResolvedValue({ canBook: true, reason: null, nextBookingAt: null, message: null });
  m.slots.mockResolvedValue([{ id: "slot-A", status: "FREE" }]);
  m.calendar.mockResolvedValue([{ id: "slot-A", status: "FREE" }, { id: "slot-B", status: "BOOKED" }]);
  m.days.mockResolvedValue(["2026-11-10"]);
  m.book.mockResolvedValue({ kind: "created", booking: { id: "booking-A" } });
  m.my.mockResolvedValue({ items: [{ id: "booking-A" }], nextCursor: null });
});

describe("AG2 G11 actual consultation catalog/slots/verify", () => {
  it("GET catalog embeds owner eligibility beside data and no-store", async () => {
    const r = await req("/cynologists");
    expect(r.status).toBe(200); noStore(r);
    expect(await r.json()).toEqual({ success: true,
      data: [{ id: "cyn-A", userId: "trainer-A", displayName: "Кинолог" }],
      bookingEligibility: { canBook: true, reason: null, nextBookingAt: null, message: null },
    });
    expect(m.eligibility).toHaveBeenCalledWith("user-A");
  });
  it("GET slots accepts ISO window and no busy; checks subscription before query", async () => {
    const r = await req("/cynologists/trainer-A/slots?from=2026-11-01T00%3A00%3A00Z&to=2026-11-08T00%3A00%3A00Z");
    expect(r.status).toBe(200); noStore(r);
    expect(await r.json()).toMatchObject({ success: true, data: [{ id: "slot-A" }], bookingEligibility: { canBook: true } });
    expect(m.slotsAccess).toHaveBeenCalledWith({ userId: "user-A" });
    expect(m.slots).toHaveBeenCalledWith("trainer-A", expect.any(Date), expect.any(Date));
    expect(m.calendar).not.toHaveBeenCalled();
  });
  it("GET busy calendar includes dayOffDates, distinct from available-only", async () => {
    const r = await req("/cynologists/trainer-A/slots?from=2026-11-01&to=2026-11-08&includeBusy=1");
    expect(r.status).toBe(200); noStore(r);
    expect(await r.json()).toMatchObject({ success: true, dayOffDates: ["2026-11-10"],
      data: [{ id: "slot-A" }, { id: "slot-B" }],
    });
    expect(m.calendar).toHaveBeenCalledWith("trainer-A", expect.any(Date), expect.any(Date));
    expect(m.days).toHaveBeenCalledOnce();
  });
  it("GET slots rejects invalid or >60 days window with 400 and no Core read", async () => {
    const r = await req("/cynologists/trainer-A/slots?from=2026-11-01&to=2027-06-01");
    expect(r.status).toBe(400); noStore(r);
    expect(m.slotsAccess).not.toHaveBeenCalled();
    expect(m.slots).not.toHaveBeenCalled();
  });
  it("GET slots subscription denial is actual 402 machine code", async () => {
    m.slotsAccess.mockRejectedValueOnce(new SubscriptionRequiredError());
    const r = await req("/cynologists/trainer-A/slots?from=2026-11-01&to=2026-11-08");
    expect(r.status).toBe(402); noStore(r);
    expect(await r.json()).toMatchObject({ success: false, code: "SUBSCRIPTION_REQUIRED" });
    expect(m.slots).not.toHaveBeenCalled();
  });
  it("GET verify checks booking entitlement/eligibility, success is bare success:true", async () => {
    const r = await req("/cynologists/trainer-A/slots/slot-A/verify");
    expect(r.status).toBe(200); noStore(r);
    expect(await r.json()).toEqual({ success: true });
    expect(m.bookingAccess).toHaveBeenCalledWith({ userId: "user-A" });
    expect(m.bookingEligibility).toHaveBeenCalledWith("user-A");
    expect(m.verify).toHaveBeenCalledWith("slot-A", "trainer-A");
  });
  it("GET verify returns typed 404 if slot missing and never exposes other booking", async () => {
    m.verify.mockRejectedValueOnce(new ConsultationNotFoundError("Слот"));
    const r = await req("/cynologists/trainer-A/slots/unknown/verify");
    expect(r.status).toBe(404); noStore(r);
    expect(await r.json()).toMatchObject({ success: false, code: "CONSULTATION_NOT_FOUND" });
  });
});

describe("AG2 G12 create/replay and error boundary", () => {
  it("POST book 201 created with exact actor and UUID", async () => {
    const r = await req("/book", "POST", booking);
    expect(r.status).toBe(201); noStore(r);
    expect(await r.json()).toEqual({ success: true, data: { kind: "created", booking: { id: "booking-A" } } });
    expect(m.book).toHaveBeenCalledWith({ userId: "user-A", body: booking, requestId: undefined });
  });
  it("POST replay returns 200 without a second Hono mutation", async () => {
    m.book.mockResolvedValueOnce({ kind: "idempotent_replay", booking: { id: "booking-A" } });
    const r = await req("/book", "POST", booking);
    expect(r.status).toBe(200); noStore(r);
    expect(await r.json()).toEqual({ success: true, data: { kind: "idempotent_replay", booking: { id: "booking-A" } } });
    expect(m.book).toHaveBeenCalledOnce();
  });
  it("POST malformed idempotencyKey gives 400 before Core", async () => {
    const r = await req("/book", "POST", { ...booking, idempotencyKey: "not-a-uuid" });
    expect(r.status).toBe(400); noStore(r);
    expect(m.book).not.toHaveBeenCalled();
  });
  it.each([
    ["missing subscription", new SubscriptionRequiredError(), 402, "SUBSCRIPTION_REQUIRED"],
    ["excluded plan", new ConsultationBookingNotIncludedError(), 403, "CONSULTATION_BOOKING_NOT_INCLUDED"],
    ["slot conflict", new ConsultationSlotTakenError(), 409, "CONSULTATION_SLOT_TAKEN"],
  ] as const)("POST book %s error %s", async (_, error, status, code) => {
    m.book.mockRejectedValueOnce(error);
    const r = await req("/book", "POST", booking);
    expect(r.status).toBe(status); noStore(r);
    expect(await r.json()).toMatchObject({ success: false, code });
  });
  it("POST unknown Core crash sanitized 500, not provider diagnostic", async () => {
    m.book.mockRejectedValueOnce(new Error("SECRET_INTERNAL_PROVIDER_VALUE"));
    const r = await req("/book", "POST", booking);
    expect(r.status).toBe(500); noStore(r);
    expect(await r.text()).not.toContain("SECRET_INTERNAL_PROVIDER_VALUE");
  });
});

describe("AG2 G13 owner-scoped list and cancellation", () => {
  it("GET my returns items/nextCursor pagination and passes actor", async () => {
    const r = await req("/my?limit=2&cursor=older-id");
    expect(r.status).toBe(200); noStore(r);
    expect(await r.json()).toEqual({ success: true, data: { items: [{ id: "booking-A" }], nextCursor: null } });
    expect(m.my).toHaveBeenCalledWith("user-A", "older-id", 2);
  });
  it("GET my without cursor defaults server limit=20", async () => {
    const r = await req("/my");
    expect(r.status).toBe(200); noStore(r);
    expect(m.my).toHaveBeenCalledWith("user-A", undefined, 20);
  });
  it("GET my rejects limit 51 with 400 before owner scoped query", async () => {
    const r = await req("/my?limit=51");
    expect(r.status).toBe(400); noStore(r);
    expect(m.my).not.toHaveBeenCalled();
  });
  it("POST cancel forwards only JWT actor, body reason ignored by Core", async () => {
    const r = await req("/bookings/booking-A/cancel", "POST", { reason: "передумал" });
    expect(r.status).toBe(200); noStore(r);
    expect(await r.json()).toEqual({ success: true, data: { bookingId: "booking-A" } });
    expect(m.cancel).toHaveBeenCalledWith("user-A", "booking-A");
  });
  it("POST cancel other owner's booking maps Core denial to 403", async () => {
    m.cancel.mockRejectedValueOnce(new ConsultationForbiddenError());
    const r = await req("/bookings/booking-foreign/cancel", "POST", {});
    expect(r.status).toBe(403); noStore(r);
    expect(await r.json()).toMatchObject({ success: false, code: "CONSULTATION_FORBIDDEN" });
    expect(m.cancel).toHaveBeenCalledWith("user-A", "booking-foreign");
  });
  it("POST cancel missing booking maps Core error to 404", async () => {
    m.cancel.mockRejectedValueOnce(new ConsultationNotFoundError("Бронирование"));
    const r = await req("/bookings/missing/cancel", "POST", {});
    expect(r.status).toBe(404); noStore(r);
    expect(await r.json()).toMatchObject({ success: false, code: "CONSULTATION_NOT_FOUND" });
  });
  it("POST cancel already changed status is 403, NOT 200 replay or 409", async () => {
    m.cancel.mockRejectedValueOnce(new ConsultationForbiddenError("Статус бронирования уже изменился"));
    const r = await req("/bookings/booking-A/cancel", "POST", {});
    expect(r.status).toBe(403); noStore(r);
    expect(await r.json()).toMatchObject({ success: false, code: "CONSULTATION_FORBIDDEN" });
  });
  it("GET my failure returns sanitized 500 and no-store", async () => {
    m.my.mockRejectedValueOnce(new Error("SECRET_INTERNAL_POSTGRES_VALUE"));
    const r = await req("/my");
    expect(r.status).toBe(500); noStore(r);
    expect(await r.text()).not.toContain("SECRET_INTERNAL_POSTGRES_VALUE");
  });
  it.each(["/my", "/cynologists", "/bookings/booking-A/cancel"])(
    "GET/POST %s has 401 without token and no Core calls", async path => {
      const method = path.endsWith("/cancel") ? "POST" : "GET";
      const r = await app().request(prefix + path, { method,
        ...(method === "POST" ? { headers: { "content-type": "application/json" }, body: "{}" } : {}),
      });
      expect(r.status).toBe(401);
      expect(m.my).not.toHaveBeenCalled();
      expect(m.cancel).not.toHaveBeenCalled();
      expect(m.list).not.toHaveBeenCalled();
    },
  );
});
// G1_AG2_P0_CONTRACT_SUITE_COMPLETE
