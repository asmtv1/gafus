import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getAvailableSlotsMock,
  getCalendarSlotsMock,
  getCynologistDayOffDatesMock,
  getServerSessionMock,
  requireConsultationSlotsPremiumOrRewardedAccessMock,
} = vi.hoisted(() => ({
  getAvailableSlotsMock: vi.fn(),
  getCalendarSlotsMock: vi.fn(),
  getCynologistDayOffDatesMock: vi.fn(),
  getServerSessionMock: vi.fn(),
  requireConsultationSlotsPremiumOrRewardedAccessMock: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ error: vi.fn() }) }));
vi.mock("@/shared/lib/consultation-route-errors", () => ({
  logConsultationRouteError: vi.fn(),
}));
vi.mock("@gafus/core", () => ({
  getAvailableSlots: getAvailableSlotsMock,
  getCalendarSlots: getCalendarSlotsMock,
  getCynologistDayOffDates: getCynologistDayOffDatesMock,
  getSlotsQuerySchema: {
    parse: (input: { from: string; to: string }) => input,
  },
  requireConsultationSlotsPremiumOrRewardedAccess:
    requireConsultationSlotsPremiumOrRewardedAccessMock,
}));
vi.mock("@gafus/core/services/rewardedCredits", () => ({
  SubscriptionOrCreditsRequiredError: class SubscriptionOrCreditsRequiredError extends Error {
    code = "SUBSCRIPTION_OR_CREDITS_REQUIRED" as const;
  },
}));

import { SubscriptionOrCreditsRequiredError } from "@gafus/core/services/rewardedCredits";
import { GET } from "./route";

function request() {
  return new NextRequest(
    "https://gafus.test/api/v1/consultations/cynologists/trainer-1/slots?from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-15T00%3A00%3A00.000Z&includeBusy=1",
  ) as never;
}

describe("GET /api/v1/consultations/cynologists/[cynologistUserId]/slots", () => {
  it("returns 402 before exposing slots when subscription/rewarded access is missing", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });
    requireConsultationSlotsPremiumOrRewardedAccessMock.mockRejectedValueOnce(
      new SubscriptionOrCreditsRequiredError(),
    );

    const response = await GET(request(), {
      params: Promise.resolve({ cynologistUserId: "trainer-1" }),
    });

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
    });
    expect(requireConsultationSlotsPremiumOrRewardedAccessMock).toHaveBeenCalledWith({
      userId: "user-1",
      platform: "WEB_DESKTOP",
    });
    expect(getCalendarSlotsMock).not.toHaveBeenCalled();
    expect(getAvailableSlotsMock).not.toHaveBeenCalled();
  });
});
