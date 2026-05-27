import { describe, expect, it, vi } from "vitest";

const { getAppSubscriptionOfferMock, getServerSessionMock } = vi.hoisted(() => ({
  getAppSubscriptionOfferMock: vi.fn(),
  getServerSessionMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@gafus/auth", () => ({
  authOptions: {},
}));

vi.mock("@gafus/core/services/appSubscription", () => ({
  getAppSubscriptionOffer: getAppSubscriptionOfferMock,
}));

import { GET } from "./route";

describe("GET /api/v1/app-subscription/offer", () => {
  it("requires auth", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("returns the current user offer", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });
    getAppSubscriptionOfferMock.mockResolvedValueOnce({ priceRub: 299 });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { priceRub: 299 },
      success: true,
    });
    expect(getAppSubscriptionOfferMock).toHaveBeenCalledWith("user-1");
  });
});
