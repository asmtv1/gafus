import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsultationBookingNotIncludedError } from "@gafus/core/services/consultation";
import { SubscriptionRequiredError } from "@gafus/core/services/appSubscription";

import { authMiddleware } from "../../middleware/auth";
import { jsonRequest } from "../../test/route-test-utils";
import { consultationsRoutes } from "./consultations";

const { consultationMocks } = vi.hoisted(() => ({
  consultationMocks: {
    getAvailableSlots: vi.fn(),
    getCalendarSlots: vi.fn(),
    getCynologistDayOffDates: vi.fn(),
    requireConsultationSlotsSubscriptionAccess: vi.fn(),
    requireConsultationBookingSubscriptionAccess: vi.fn(),
    verifyConsultationSlotFreeForCynologist: vi.fn(),
  },
}));

vi.mock("@gafus/core/services/consultation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@gafus/core/services/consultation")>();
  return {
    ...actual,
    getAvailableSlots: consultationMocks.getAvailableSlots,
    getCalendarSlots: consultationMocks.getCalendarSlots,
    getCynologistDayOffDates: consultationMocks.getCynologistDayOffDates,
    requireConsultationSlotsSubscriptionAccess:
      consultationMocks.requireConsultationSlotsSubscriptionAccess,
    requireConsultationBookingSubscriptionAccess:
      consultationMocks.requireConsultationBookingSubscriptionAccess,
    verifyConsultationSlotFreeForCynologist:
      consultationMocks.verifyConsultationSlotFreeForCynologist,
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
    consultationMocks.getAvailableSlots.mockResolvedValue([]);
    consultationMocks.getCalendarSlots.mockResolvedValue([]);
    consultationMocks.getCynologistDayOffDates.mockResolvedValue([]);
    consultationMocks.requireConsultationSlotsSubscriptionAccess.mockResolvedValue(undefined);
    consultationMocks.requireConsultationBookingSubscriptionAccess.mockResolvedValue(undefined);
    consultationMocks.verifyConsultationSlotFreeForCynologist.mockResolvedValue(undefined);
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

  it("returns the booking-included code for a 14-day YooKassa subscriber", async () => {
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
      error: "Запись к кинологу доступна в тарифах от 1 месяца",
    });
  });
});
