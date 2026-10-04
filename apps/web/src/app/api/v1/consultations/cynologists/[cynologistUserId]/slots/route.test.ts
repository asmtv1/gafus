import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  bookingEligibilityMock,
  getAvailableSlotsMock,
  getCalendarSlotsMock,
  getCynologistDayOffDatesMock,
  getServerSessionMock,
  requireConsultationSlotsSubscriptionAccessMock,
} = vi.hoisted(() => ({
  bookingEligibilityMock: vi.fn().mockResolvedValue({ canBook: true, reason: null, nextBookingAt: null, message: null }),
  getAvailableSlotsMock: vi.fn(),
  getCalendarSlotsMock: vi.fn(),
  getCynologistDayOffDatesMock: vi.fn(),
  getServerSessionMock: vi.fn(),
  requireConsultationSlotsSubscriptionAccessMock: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ error: vi.fn() }) }));
vi.mock("@/shared/lib/consultation-route-errors", () => ({
  logConsultationRouteError: vi.fn(),
}));
vi.mock("@gafus/core", () => ({
  getConsultationBookingEligibility: bookingEligibilityMock,
  getAvailableSlots: getAvailableSlotsMock,
  getCalendarSlots: getCalendarSlotsMock,
  getCynologistDayOffDates: getCynologistDayOffDatesMock,
  getSlotsQuerySchema: {
    parse: (input: { from: string; to: string }) => input,
  },
  requireConsultationSlotsSubscriptionAccess: requireConsultationSlotsSubscriptionAccessMock,
}));
vi.mock("@gafus/core/services/appSubscription", () => ({
  SubscriptionRequiredError: class SubscriptionRequiredError extends Error {
    code = "SUBSCRIPTION_REQUIRED" as const;
  },
}));

import { SubscriptionRequiredError } from "@gafus/core/services/appSubscription";
import { GET } from "./route";

function request() {
  return new NextRequest(
    "https://gafus.test/api/v1/consultations/cynologists/trainer-1/slots?from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-15T00%3A00%3A00.000Z&includeBusy=1",
  ) as never;
}

describe("GET /api/v1/consultations/cynologists/[cynologistUserId]/slots", () => {
  it("returns 402 before exposing slots when subscription access is missing", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });
    requireConsultationSlotsSubscriptionAccessMock.mockRejectedValueOnce(
      new SubscriptionRequiredError(),
    );

    const response = await GET(request(), {
      params: Promise.resolve({ cynologistUserId: "trainer-1" }),
    });

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "SUBSCRIPTION_REQUIRED",
    });
    expect(requireConsultationSlotsSubscriptionAccessMock).toHaveBeenCalledWith({
      userId: "user-1",
    });
    expect(getCalendarSlotsMock).not.toHaveBeenCalled();
    expect(getAvailableSlotsMock).not.toHaveBeenCalled();
  });
});


it("returns booking restriction alongside calendar without caching it", async () => {
  getServerSessionMock.mockResolvedValue({ user: { id: "user-1" } });
  requireConsultationSlotsSubscriptionAccessMock.mockResolvedValue(undefined);
  getCalendarSlotsMock.mockResolvedValue([]);
  getCynologistDayOffDatesMock.mockResolvedValue([]);
  const bookingEligibility = { canBook: false, reason: "WEEKLY_COOLDOWN", nextBookingAt: "2026-10-11T12:30:00.000Z", message: "Подождите до 11 октября" };
  bookingEligibilityMock.mockResolvedValueOnce(bookingEligibility);
  const response = await GET(request(), { params: Promise.resolve({ cynologistUserId: "trainer-1" }) });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toMatchObject({ success: true, bookingEligibility });
});
