import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsultationBookingNotIncludedError } from "@gafus/core/services/consultation";
import { SubscriptionRequiredError } from "@gafus/core/services/appSubscription";

import { authMiddleware } from "../../middleware/auth";
import { jsonRequest } from "../../test/route-test-utils";
import { consultationsRoutes } from "./consultations";

const { consultationMocks } = vi.hoisted(() => ({
  consultationMocks: {
    getConsultationBookingEligibility: vi.fn(),
    requireConsultationBookingEligibility: vi.fn(),
    getAvailableSlots: vi.fn(),
    getCalendarSlots: vi.fn(),
    getCynologistDayOffDates: vi.fn(),
    requireConsultationSlotsSubscriptionAccess: vi.fn(),
    requireConsultationBookingSubscriptionAccess: vi.fn(),
    verifyConsultationSlotFreeForCynologist: vi.fn(),
    prepareConsultationCall: vi.fn(),
    signConsultationOneTimeKey: vi.fn(),
    createConsultationCallAdmission: vi.fn(),
  },
}));

vi.mock("@gafus/core/services/consultation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@gafus/core/services/consultation")>();
  return {
    ...actual,
    getConsultationBookingEligibility: consultationMocks.getConsultationBookingEligibility,
    requireConsultationBookingEligibility: consultationMocks.requireConsultationBookingEligibility,
    getAvailableSlots: consultationMocks.getAvailableSlots,
    getCalendarSlots: consultationMocks.getCalendarSlots,
    getCynologistDayOffDates: consultationMocks.getCynologistDayOffDates,
    requireConsultationSlotsSubscriptionAccess:
      consultationMocks.requireConsultationSlotsSubscriptionAccess,
    requireConsultationBookingSubscriptionAccess:
      consultationMocks.requireConsultationBookingSubscriptionAccess,
    verifyConsultationSlotFreeForCynologist:
      consultationMocks.verifyConsultationSlotFreeForCynologist,
    prepareConsultationCall: consultationMocks.prepareConsultationCall,
    signConsultationOneTimeKey: consultationMocks.signConsultationOneTimeKey,
    createConsultationCallAdmission: consultationMocks.createConsultationCallAdmission,
  };
});

function createTestApp() {
  const app = new Hono();
  app.use("/api/v1/consultations/*", authMiddleware);
  app.route("/api/v1/consultations", consultationsRoutes);
  return app;
}

function createAuthenticatedTestApp() {
  const app = new Hono();
  app.use("/api/v1/consultations/*", async (c, next) => {
    c.set("user", { id: "user-1", username: "student", role: "USER" });
    await next();
  });
  app.route("/api/v1/consultations", consultationsRoutes);
  return app;
}

describe("consultations route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consultationMocks.getConsultationBookingEligibility.mockResolvedValue({ canBook: true, reason: null, nextBookingAt: null, message: null });
    consultationMocks.requireConsultationBookingEligibility.mockResolvedValue(undefined);
    consultationMocks.getAvailableSlots.mockResolvedValue([]);
    consultationMocks.getCalendarSlots.mockResolvedValue([]);
    consultationMocks.getCynologistDayOffDates.mockResolvedValue([]);
    consultationMocks.requireConsultationSlotsSubscriptionAccess.mockResolvedValue(undefined);
    consultationMocks.requireConsultationBookingSubscriptionAccess.mockResolvedValue(undefined);
    consultationMocks.verifyConsultationSlotFreeForCynologist.mockResolvedValue(undefined);
    consultationMocks.prepareConsultationCall.mockResolvedValue({ username: "g_u_x@app.acc.voximplant.com", room: "gafus_x" });
    consultationMocks.signConsultationOneTimeKey.mockResolvedValue("deadbeef");
    consultationMocks.createConsultationCallAdmission.mockResolvedValue({ admission: "1800000090.abc", expires: 1800000090 });
  });

  it("requires auth before booking a slot", async () => {
    const app = createTestApp();

    const response = await app.request(
      jsonRequest("/api/v1/consultations/book", "POST", {
        slotId: "slot-1",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "Токен не предоставлен",
    });
  });

  it("rejects unauthenticated Vox SDK identity requests", async () => {
    const response = await createTestApp().request(
      jsonRequest("/api/v1/consultations/bookings/booking-1/voximplant/prepare", "POST", {}),
    );
    expect(response.status).toBe(401);
    expect(consultationMocks.prepareConsultationCall).not.toHaveBeenCalled();
  });

  it("prepares only an authenticated Vox consultation participant", async () => {
    const response = await createAuthenticatedTestApp().request(
      jsonRequest("/api/v1/consultations/bookings/booking-1/voximplant/prepare", "POST", {}),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true,
      data: { room: "gafus_x", username: "g_u_x@app.acc.voximplant.com" } });
    expect(consultationMocks.prepareConsultationCall).toHaveBeenCalledWith("booking-1", "user-1");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("checks authentication before issuing VoxEngine admission proof", async () => {
    const notLoggedIn = await createTestApp().request(
      jsonRequest("/api/v1/consultations/bookings/booking-1/voximplant/admission", "POST", {}),
    );
    expect(notLoggedIn.status).toBe(401);
    expect(consultationMocks.createConsultationCallAdmission).not.toHaveBeenCalled();
    const loggedIn = await createAuthenticatedTestApp().request(
      jsonRequest("/api/v1/consultations/bookings/booking-1/voximplant/admission", "POST", {}),
    );
    expect(loggedIn.status).toBe(200);
    expect(await loggedIn.json()).toMatchObject({ success: true, data: { expires: 1800000090 } });
    expect(consultationMocks.createConsultationCallAdmission).toHaveBeenCalledWith("booking-1", "user-1");
    expect(loggedIn.headers.get("Cache-Control")).toBe("no-store");
  });

  it("validates Vox challenge before requesting a server-side signature", async () => {
    const response = await createAuthenticatedTestApp().request(
      jsonRequest("/api/v1/consultations/bookings/booking-1/voximplant/sign", "POST", { key: "short" }),
    );
    expect(response.status).toBe(400);
    expect(consultationMocks.signConsultationOneTimeKey).not.toHaveBeenCalled();
  });

  it("signs an authenticated Vox SDK challenge without revealing service secrets", async () => {
    const response = await createAuthenticatedTestApp().request(
      jsonRequest("/api/v1/consultations/bookings/booking-1/voximplant/sign", "POST", { key: "test-challenge-12345" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, token: "deadbeef" });
    expect(consultationMocks.signConsultationOneTimeKey).toHaveBeenCalledWith("booking-1", "user-1", "test-challenge-12345");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects invalid slot range query before calling slot services", async () => {
    const app = createAuthenticatedTestApp();

    const response = await app.request(
      "/api/v1/consultations/cynologists/trainer-1/slots?from=bad-date&to=also-bad",
    );

    expect(response.status).toBe(400);
  });

  it("denies the slot calendar without an active subscription", async () => {
    consultationMocks.requireConsultationSlotsSubscriptionAccess.mockRejectedValueOnce(
      new SubscriptionRequiredError(),
    );
    const app = createAuthenticatedTestApp();

    const response = await app.request(
      "/api/v1/consultations/cynologists/trainer-1/slots?from=2026-06-01T00%3A00%3A00.000Z&to=2026-06-08T00%3A00%3A00.000Z",
    );

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "SUBSCRIPTION_REQUIRED",
    });
    expect(consultationMocks.getAvailableSlots).not.toHaveBeenCalled();
  });

  it("returns the slot calendar when the active slots entitlement permits it", async () => {
    const app = createAuthenticatedTestApp();

    const response = await app.request(
      "/api/v1/consultations/cynologists/trainer-1/slots?from=2026-06-01T00%3A00%3A00.000Z&to=2026-06-08T00%3A00%3A00.000Z&includeBusy=1",
      { headers: { "x-platform": "IOS" } },
    );

    expect(response.status).toBe(200);
    expect(consultationMocks.requireConsultationSlotsSubscriptionAccess).toHaveBeenCalledWith({
      userId: "user-1",
    });
    expect(consultationMocks.getCalendarSlots).toHaveBeenCalled();
  });

  it("requires an active subscription before verifying a slot on mobile API", async () => {
    const app = createAuthenticatedTestApp();

    const response = await app.request(
      "/api/v1/consultations/cynologists/trainer-1/slots/slot-1/verify",
      { headers: { "x-platform": "ANDROID" } },
    );

    expect(response.status).toBe(200);
    expect(consultationMocks.requireConsultationBookingSubscriptionAccess).toHaveBeenCalledWith({
      userId: "user-1",
    });
    expect(consultationMocks.verifyConsultationSlotFreeForCynologist).toHaveBeenCalledWith(
      "slot-1",
      "trainer-1",
    );
  });

  it("returns the booking-not-included code for a 14-day YooKassa subscriber", async () => {
    consultationMocks.requireConsultationBookingSubscriptionAccess.mockRejectedValueOnce(
      new ConsultationBookingNotIncludedError(),
    );
    const app = createAuthenticatedTestApp();

    const response = await app.request(
      "/api/v1/consultations/cynologists/trainer-1/slots/slot-1/verify",
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "CONSULTATION_BOOKING_NOT_INCLUDED",
      error: "Запись к кинологу доступна по действующему тарифу «Полное сопровождение»",
    });
  });
});


describe("consultation booking restriction response", () => {
  it("returns cooldown date and message from slot verification", async () => {
    const { ConsultationBookingRestrictedError } = await import("@gafus/core/services/consultation");
    const eligibility = { canBook: false, reason: "WEEKLY_COOLDOWN" as const,
      nextBookingAt: "2026-10-11T12:30:00.000Z", message: "Следующая запись 11 октября в 15:30 (МСК)" };
    consultationMocks.requireConsultationBookingEligibility.mockRejectedValueOnce(new ConsultationBookingRestrictedError(eligibility));
    const response = await createAuthenticatedTestApp().request(
      "/api/v1/consultations/cynologists/trainer-1/slots/slot-1/verify",
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, code: "CONSULTATION_WEEKLY_COOLDOWN", error: eligibility.message, eligibility });
  });
});
