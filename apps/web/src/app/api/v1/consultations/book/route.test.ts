import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { bookSlotWithPremiumOrRewardedCreditsMock, getServerSessionMock } = vi.hoisted(() => ({
  bookSlotMock: vi.fn(),
  bookSlotWithPremiumOrRewardedCreditsMock: vi.fn(),
  getServerSessionMock: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));
vi.mock("@gafus/core", () => ({
  bookSlotWithPremiumOrRewardedCredits: bookSlotWithPremiumOrRewardedCreditsMock,
  bookSlotInputSchema: {
    parse: (value: unknown) => {
      const body = value as { slotId?: string };
      if (!body.slotId) throw new Error("slotId required");
      return body;
    },
  },
}));
vi.mock("@gafus/core/services/rewardedCredits", () => ({
  RewardedCreditsRequiredError: class RewardedCreditsRequiredError extends Error {},
  SubscriptionOrCreditsRequiredError: class SubscriptionOrCreditsRequiredError extends Error {},
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/shared/lib/consultation-cache-tags", () => ({
  consultationTrainerBookingsTag: (id: string) => `trainer:${id}`,
  consultationUserBookingsTag: (id: string) => `user:${id}`,
}));
vi.mock("@/shared/lib/consultation-route-errors", () => ({
  logConsultationRouteError: vi.fn(),
  mapConsultationError: () => null,
  mapZodError: () => null,
}));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ error: vi.fn() }) }));

import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("https://gafus.test/api/v1/consultations/book", {
    body: JSON.stringify(body),
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/v1/consultations/book", () => {
  it("requires auth", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    const response = await POST(request({ slotId: "slot-1" }));

    expect(response.status).toBe(401);
  });

  it("books a slot for an authenticated subscribed user", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });
    bookSlotWithPremiumOrRewardedCreditsMock.mockResolvedValueOnce({
      booking: { cynologistUserId: "trainer-1" },
      kind: "created",
    });

    const response = await POST(request({ slotId: "slot-1" }));

    expect(response.status).toBe(201);
    expect(bookSlotWithPremiumOrRewardedCreditsMock).toHaveBeenCalledWith({
      userId: "user-1",
      platform: "WEB_DESKTOP",
      body: { slotId: "slot-1" },
      requestId: undefined,
    });
  });
});
