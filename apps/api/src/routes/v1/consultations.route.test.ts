import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authMiddleware } from "../../middleware/auth";
import { jsonRequest } from "../../test/route-test-utils";
import { consultationsRoutes } from "./consultations";

const { consultationMocks } = vi.hoisted(() => ({
  consultationMocks: {
    getAvailableSlots: vi.fn(),
    getCalendarSlots: vi.fn(),
    getCynologistDayOffDates: vi.fn(),
    requireConsultationSlotsPremiumOrRewardedAccess: vi.fn(),
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
    requireConsultationSlotsPremiumOrRewardedAccess:
      consultationMocks.requireConsultationSlotsPremiumOrRewardedAccess,
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
    consultationMocks.requireConsultationSlotsPremiumOrRewardedAccess.mockResolvedValue(undefined);
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

  it("requires premium or rewarded credits before returning slot calendar on mobile API", async () => {
    const app = createAuthenticatedTestApp();

    const response = await app.request(
      "/api/v1/consultations/cynologists/trainer-1/slots?from=2026-06-01T00%3A00%3A00.000Z&to=2026-06-08T00%3A00%3A00.000Z&includeBusy=1",
      { headers: { "x-platform": "IOS" } },
    );

    expect(response.status).toBe(200);
    expect(consultationMocks.requireConsultationSlotsPremiumOrRewardedAccess).toHaveBeenCalledWith({
      userId: "user-1",
      platform: "IOS",
    });
    expect(consultationMocks.getCalendarSlots).toHaveBeenCalled();
  });

  it("requires premium or rewarded credits before verifying a slot on mobile API", async () => {
    const app = createAuthenticatedTestApp();

    const response = await app.request(
      "/api/v1/consultations/cynologists/trainer-1/slots/slot-1/verify",
      { headers: { "x-platform": "ANDROID" } },
    );

    expect(response.status).toBe(200);
    expect(consultationMocks.requireConsultationSlotsPremiumOrRewardedAccess).toHaveBeenCalledWith({
      userId: "user-1",
      platform: "ANDROID",
    });
    expect(consultationMocks.verifyConsultationSlotFreeForCynologist).toHaveBeenCalledWith(
      "slot-1",
      "trainer-1",
    );
  });
});
