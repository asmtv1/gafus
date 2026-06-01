import { describe, expect, it, vi } from "vitest";

const { getServerSessionMock, grantRewardedCreditsMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  grantRewardedCreditsMock: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));
vi.mock("@gafus/csrf/middleware", () => ({
  withCSRFProtection: (handler: unknown) => handler,
}));
vi.mock("@gafus/core/services/rewardedCredits", () => ({
  grantRewardedCredits: grantRewardedCreditsMock,
}));

import { POST } from "./route";

describe("POST /api/v1/rewarded-ads/grant", () => {
  it("does not accept client amount", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });
    grantRewardedCreditsMock.mockResolvedValueOnce({ grantedCredits: 5, balance: 5 });

    const response = await POST(
      new Request("http://localhost/api/v1/rewarded-ads/grant", {
        method: "POST",
        body: JSON.stringify({ sessionId: "s1", requestNonce: "n1", amount: 999 }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(grantRewardedCreditsMock).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "s1",
      requestNonce: "n1",
      providerPayload: undefined,
    });
  });
});
