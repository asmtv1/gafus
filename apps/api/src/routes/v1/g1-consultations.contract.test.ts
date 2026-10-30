/** AG1 G1 route characterization: real Hono auth/validation, mocked Core, no DB. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  isRegistrationCompleted: vi.fn(),
  resolveTarget: vi.fn(),
  getAvailability: vi.fn(),
  setAvailability: vi.fn(),
  trainerBookings: vi.fn(),
  confirmBooking: vi.fn(),
  listAdminBookings: vi.fn(),
  bookSlot: vi.fn(),
  consultationLookup: vi.fn(),
}));
vi.mock("../../lib/consultation-booking-lookup", () => ({
  lookupOwnConsultationBookingByKey: mocks.consultationLookup,
}));
vi.mock("@gafus/auth/jwt", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  verifyAccessToken: mocks.verifyAccessToken,
}));
vi.mock("@gafus/core/services/auth", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isRegistrationCompleted: mocks.isRegistrationCompleted,
}));
vi.mock("@gafus/core/services/consultation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveTargetTrainerUserIdForStaff: mocks.resolveTarget,
  getTrainerAvailability: mocks.getAvailability,
  setTrainerAvailability: mocks.setAvailability,
  listTrainerBookings: mocks.trainerBookings,
  confirmBookingByTrainer: mocks.confirmBooking,
  listAdminBookings: mocks.listAdminBookings,
  bookSlotWithSubscription: mocks.bookSlot,
}));

import {
  ConsultationForbiddenError,
  ConsultationSlotTakenError,
} from "@gafus/core/services/consultation";
// The shared Vitest Redis shim does not implement RedisStore.increment's array
// response. Keep the route/auth/Core mapping real but stub ONLY booking rate limit.
// Real 429 behavior requires a dedicated non-prod Redis integration gate.
vi.mock("../../middleware/rate-limit.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  consultationBookRateLimiter: async (_c: unknown, next: () => Promise<void>) => next(),
}));

import { authMiddleware } from "../../middleware/auth";
import { consultationsRoutes } from "./consultations";

type Role = "USER" | "PARTNER" | "TRAINER" | "MODERATOR" | "ADMIN";
const user = (role: Role, id = `${role.toLowerCase()}-A`) => ({ role, id, username: id });
function app() {
  const h = new Hono();
  h.use("/api/v1/consultations/*", authMiddleware);
  h.route("/api/v1/consultations", consultationsRoutes);
  return h;
}
function request(
  path: string,
  method = "GET",
  body?: object,
  headers: Record<string, string> = {},
) {
  return app().request("http://local.test/api/v1/consultations" + path, {
    method,
    headers: {
      authorization: "Bearer test-jwt",
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const validBooking = {
  slotId: "slot-A",
  idempotencyKey: "2bc12ef8-8baf-4977-9101-6ac5407957d2",
  clientOwnerName: "Сергей",
  clientPhone: "+79990000000",
  petName: "Бим",
  petGender: "MALE",
  petAge: "4 года",
  petBreed: "Метис",
  clientProblem: "Сильно тянет поводок на прогулках",
  clientSelfHelpAttempt: "Пробовали останавливаться на прогулке",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyAccessToken.mockResolvedValue(user("TRAINER"));
  mocks.isRegistrationCompleted.mockResolvedValue(true);
  mocks.resolveTarget.mockImplementation(
    async (actor: { id: string; role: Role }, target?: string) => {
      if (actor.role === "TRAINER") {
        if (target && target !== actor.id) throw new ConsultationForbiddenError();
        return actor.id;
      }
      if (actor.role === "ADMIN") {
        if (!target) throw new ConsultationForbiddenError();
        return target;
      }
      throw new ConsultationForbiddenError();
    },
  );
  mocks.getAvailability.mockResolvedValue({ rules: [] });
  mocks.setAvailability.mockResolvedValue(undefined);
  mocks.trainerBookings.mockResolvedValue([]);
  mocks.listAdminBookings.mockResolvedValue({ items: [] });
  mocks.confirmBooking.mockResolvedValue(undefined);
  mocks.bookSlot.mockResolvedValue({ kind: "created", booking: { id: "booking-A" } });
  mocks.consultationLookup.mockResolvedValue({ state: "UNKNOWN" });
});

describe("AG1 G1 consultation Hono route boundaries (mock Core)", () => {
  it("requires JWT for trainer booking list before reaching Core", async () => {
    const r = await app().request("/api/v1/consultations/trainer/bookings");
    expect(r.status).toBe(401);
    expect(mocks.trainerBookings).not.toHaveBeenCalled();
  });

  it.each(["USER", "PARTNER"] as const)("%s cannot list trainer bookings", async (role) => {
    mocks.verifyAccessToken.mockResolvedValueOnce(user(role));
    const r = await request("/trainer/bookings");
    expect(r.status).toBe(403);
    expect(mocks.trainerBookings).not.toHaveBeenCalled();
  });

  it.each(["TRAINER", "ADMIN"] as const)("%s role passes to Core list", async (role) => {
    mocks.verifyAccessToken.mockResolvedValueOnce(user(role));
    const r = await request("/trainer/bookings");
    expect(r.status).toBe(200);
    expect(mocks.trainerBookings).toHaveBeenCalledWith(`${role.toLowerCase()}-A`, role);
  });

  it("TRAINER-A may only target own schedule in route adapter", async () => {
    const r = await request("/trainer/availability?trainerUserId=trainer-A");
    expect(r.status).toBe(200);
    expect(mocks.resolveTarget).toHaveBeenCalledWith(
      { id: "trainer-A", role: "TRAINER" },
      "trainer-A",
    );
    expect(mocks.getAvailability).toHaveBeenCalledWith("trainer-A");
  });

  it("TRAINER-B targeting TRAINER-A returns 403 and does not read availability", async () => {
    mocks.verifyAccessToken.mockResolvedValueOnce(user("TRAINER", "trainer-B"));
    const r = await request("/trainer/availability?trainerUserId=trainer-A");
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ success: false, code: "CONSULTATION_FORBIDDEN" });
    expect(mocks.getAvailability).not.toHaveBeenCalled();
  });

  it("TRAINER-B cannot write TRAINER-A schedule", async () => {
    mocks.verifyAccessToken.mockResolvedValueOnce(user("TRAINER", "trainer-B"));
    const r = await request("/trainer/availability?trainerUserId=trainer-A", "PUT", {
      rules: [{ weekday: 1, startTime: "09:00", endTime: "18:00" }],
    });
    expect(r.status).toBe(403);
    expect(mocks.setAvailability).not.toHaveBeenCalled();
  });

  it("rejects invalid schedule Zod body before owner resolver", async () => {
    const r = await request("/trainer/availability", "PUT", {
      rules: [{ weekday: 9, startTime: "18:00", endTime: "09:00" }],
    });
    expect(r.status).toBe(400);
    expect(mocks.resolveTarget).not.toHaveBeenCalled();
    expect(mocks.setAvailability).not.toHaveBeenCalled();
  });

  it("cookie schedule modification from forged Origin is rejected before Core", async () => {
    const r = await request(
      "/trainer/availability",
      "PUT",
      {
        rules: [{ weekday: 1, startTime: "09:00", endTime: "18:00" }],
      },
      { authorization: "", origin: "https://attacker.invalid", cookie: "gafus_access=fake" },
    );
    expect(r.status).toBe(401); // empty Authorization is explicitly malformed; no cookie fallback.
    expect(mocks.setAvailability).not.toHaveBeenCalled();
  });

  it("cookie schedule change requires trusted Origin", async () => {
    const r = await app().request("/api/v1/consultations/trainer/availability", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.invalid",
        cookie: "gafus_access=fake",
      },
      body: JSON.stringify({ rules: [{ weekday: 1, startTime: "09:00", endTime: "18:00" }] }),
    });
    expect(r.status).toBe(403);
    expect(mocks.verifyAccessToken).not.toHaveBeenCalled();
    expect(mocks.setAvailability).not.toHaveBeenCalled();
  });

  it("Core rejects cross-trainer booking confirmation with 403 code", async () => {
    mocks.verifyAccessToken.mockResolvedValueOnce(user("TRAINER", "trainer-B"));
    mocks.confirmBooking.mockRejectedValueOnce(new ConsultationForbiddenError());
    const r = await request("/trainer/bookings/booking-A/confirm", "POST");
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ success: false, code: "CONSULTATION_FORBIDDEN" });
    expect(mocks.confirmBooking).toHaveBeenCalledWith("trainer-B", "TRAINER", "booking-A");
  });

  it("allows TRAINER-A to confirm through Core with stable JSON", async () => {
    const r = await request("/trainer/bookings/booking-A/confirm", "POST");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true, data: { bookingId: "booking-A" } });
    expect(mocks.confirmBooking).toHaveBeenCalledWith("trainer-A", "TRAINER", "booking-A");
  });

  it.each(["USER", "PARTNER", "TRAINER", "MODERATOR"] as const)(
    "%s cannot enumerate admin bookings",
    async (role) => {
      mocks.verifyAccessToken.mockResolvedValueOnce(user(role));
      const r = await request("/admin/bookings");
      expect(r.status).toBe(403);
      expect(mocks.listAdminBookings).not.toHaveBeenCalled();
    },
  );

  it.each(["ADMIN"] as const)("%s can call admin bookings route", async (role) => {
    mocks.verifyAccessToken.mockResolvedValueOnce(user(role));
    const r = await request("/admin/bookings");
    expect(r.status).toBe(200);
    expect(mocks.listAdminBookings).toHaveBeenCalledOnce();
  });

  it("MODERATOR retains ordinary personal booking, without staff privileges", async () => {
    mocks.verifyAccessToken.mockResolvedValueOnce(user("MODERATOR"));
    const r = await request("/book", "POST", validBooking);
    expect(r.status).toBe(201);
    expect(mocks.bookSlot).toHaveBeenCalledWith({
      userId: "moderator-A",
      body: expect.objectContaining({ idempotencyKey: validBooking.idempotencyKey }),
      requestId: undefined,
    });
  });

  it("booking requires valid idempotency UUID before Core", async () => {
    mocks.verifyAccessToken.mockResolvedValueOnce(user("USER"));
    const r = await request("/book", "POST", { ...validBooking, idempotencyKey: "invalid" });
    expect(r.status).toBe(400);
    expect(mocks.bookSlot).not.toHaveBeenCalled();
  });

  it("booking maps optimistic slot conflict to 409 machine code", async () => {
    mocks.verifyAccessToken.mockResolvedValueOnce(user("USER"));
    mocks.bookSlot.mockRejectedValueOnce(new ConsultationSlotTakenError());
    const r = await request("/book", "POST", validBooking);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ success: false, code: "CONSULTATION_SLOT_TAKEN" });
    expect(mocks.bookSlot).toHaveBeenCalledWith({
      userId: "user-A",
      body: expect.objectContaining({ slotId: "slot-A" }),
      requestId: undefined,
    });
  });

  it("created booking returns 201, passes idempotency key and requestId to Core", async () => {
    mocks.verifyAccessToken.mockResolvedValueOnce(user("USER"));
    const r = await request("/book", "POST", validBooking, {
      "X-Request-Id": "tracing-request-id",
    });
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({
      success: true,
      data: { kind: "created", booking: { id: "booking-A" } },
    });
    expect(mocks.bookSlot).toHaveBeenCalledWith({
      userId: "user-A",
      body: expect.objectContaining({ idempotencyKey: validBooking.idempotencyKey }),
      requestId: "tracing-request-id",
    });
  });

  it("idempotent replay retains status 200 rather than creating second booking", async () => {
    mocks.verifyAccessToken.mockResolvedValueOnce(user("USER"));
    mocks.bookSlot.mockResolvedValueOnce({
      kind: "idempotent_replay",
      booking: { id: "booking-A" },
    });
    const r = await request("/book", "POST", validBooking);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ success: true, data: { kind: "idempotent_replay" } });
  });
});

describe("AG4 approved POST /book/lookup owner-scoped lostACK transport", () => {
  const key = "2bc12ef8-8baf-4977-9101-6ac5407957d2";
  const look = (body: object) => request("/book/lookup", "POST", body);
  it("LK01 current owner readback FOUND, minimal booking fields and cache private", async () => {
    mocks.verifyAccessToken.mockResolvedValueOnce(user("USER", "owner-A"));
    mocks.consultationLookup.mockResolvedValueOnce({
      state: "FOUND",
      booking: {
        id: "B1",
        status: "CONFIRMED",
        slotId: "slot1",
        createdAt: "2026-10-17T10:00:00.000Z",
      },
    });
    const r = await look({ idempotencyKey: key });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({
      success: true,
      data: { state: "FOUND", booking: { id: "B1", status: "CONFIRMED" } },
    });
    expect(mocks.consultationLookup).toHaveBeenCalledWith("owner-A", key);
    expect(r.headers.get("Cache-Control")).toContain("no-store");
    expect(r.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
  it("LK02 missing/expired/foreign ledger all return identical 200 UNKNOWN", async () => {
    for (const id of ["ownerA", "ownerB", "adminC"]) {
      mocks.verifyAccessToken.mockResolvedValueOnce(user("USER", id));
      const r = await look({ idempotencyKey: key });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ success: true, data: { state: "UNKNOWN" } });
      expect(r.headers.get("Cache-Control")).toContain("no-store");
    }
    expect(mocks.consultationLookup).toHaveBeenCalledTimes(3);
  });
  it("LK03 body idempotencyKey must be UUID, 400 before Core", async () => {
    const r = await look({ idempotencyKey: "invalid-key" });
    expect(r.status).toBe(400);
    expect(mocks.consultationLookup).not.toHaveBeenCalled();
  });
  it("LK04 cannot supply ownerId or clientId even under admin role", async () => {
    mocks.verifyAccessToken.mockResolvedValueOnce(user("ADMIN", "admin-owner"));
    const r = await look({ idempotencyKey: key, ownerId: "ownerA" });
    expect(r.status).toBe(400);
    expect(mocks.consultationLookup).not.toHaveBeenCalled();
  });
  it("LK05 no auth returns 401 before lookup", async () => {
    const r = await app().request("/api/v1/consultations/book/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: key }),
    });
    expect(r.status).toBe(401);
    expect(mocks.consultationLookup).not.toHaveBeenCalled();
  });
  it("LK06 staff principal can only query its own id; cannot override", async () => {
    mocks.verifyAccessToken.mockResolvedValueOnce(user("TRAINER", "trainer-B"));
    const r = await look({ idempotencyKey: key });
    expect(r.status).toBe(200);
    expect(mocks.consultationLookup).toHaveBeenCalledWith("trainer-B", key);
  });
  it("LK07 database failure redacted as 503 no SQL/PII", async () => {
    mocks.consultationLookup.mockRejectedValueOnce(Error("PRIVATE_SQL_POSTGRES_PII"));
    const r = await look({ idempotencyKey: key });
    expect(r.status).toBe(503);
    const s = JSON.stringify(await r.json());
    expect(s).not.toContain("PRIVATE_SQL_POSTGRES_PII");
    expect(s).toContain("BOOKING_LOOKUP_UNAVAILABLE");
  });
  it("LK08 GET lookup not supported: POST-only transport avoids key in URL", async () => {
    const r = await request(`/book/lookup?idempotencyKey=${key}`);
    expect(r.status).toBe(404);
    expect(mocks.consultationLookup).not.toHaveBeenCalled();
  });
});

describe("AG4 booking lookup cookie-Origin and malformed JSON safety", () => {
  const key = "2bc12ef8-8baf-4977-9101-6ac5407957d2";
  it("LK09 cookie transport without trusted Origin fails 403 before lookup", async () => {
    const r = await app().request("/api/v1/consultations/book/lookup", {
      method: "POST",
      headers: { cookie: "gafus_access=test-jwt", "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: key }),
    });
    expect(r.status).toBe(403);
    expect(mocks.consultationLookup).not.toHaveBeenCalled();
  });
  it("LK10 cookie with exact production trusted Origin passes owner-bound lookup", async () => {
    mocks.verifyAccessToken.mockResolvedValueOnce(user("USER", "cookie-owner-A"));
    const r = await app().request("/api/v1/consultations/book/lookup", {
      method: "POST",
      headers: {
        cookie: "gafus_access=test-jwt",
        origin: "https://gafus.ru",
        "content-type": "application/json",
      },
      body: JSON.stringify({ idempotencyKey: key }),
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true, data: { state: "UNKNOWN" } });
    expect(mocks.consultationLookup).toHaveBeenCalledWith("cookie-owner-A", key);
    expect(r.headers.get("Cache-Control")).toContain("no-store");
  });
  it("LK11 malformed JSON is HTTP400 and never queries an idempotency receipt", async () => {
    const r = await app().request("/api/v1/consultations/book/lookup", {
      method: "POST",
      headers: { authorization: "Bearer test-jwt", "content-type": "application/json" },
      body: "{ this isn't valid JSON",
    });
    expect(r.status).toBe(400);
    expect(mocks.consultationLookup).not.toHaveBeenCalled();
  });
});
