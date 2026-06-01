import { describe, expect, it, vi } from "vitest";

const { getServerSessionMock, getRewardedCreditsStatusMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  getRewardedCreditsStatusMock: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));
vi.mock("@gafus/core/services/rewardedCredits", () => ({
  getRewardedCreditsStatus: getRewardedCreditsStatusMock,
}));

import { GET } from "./route";

describe("GET /api/v1/rewarded-ads/status", () => {
  it("requires auth", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    const response = await GET(new Request("http://localhost/api/v1/rewarded-ads/status?platform=WEB_DESKTOP"));

    expect(response.status).toBe(401);
  });

  it("rejects mobile platforms for web routes", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });

    const response = await GET(new Request("http://localhost/api/v1/rewarded-ads/status?platform=ANDROID"));

    expect(response.status).toBe(400);
    expect(getRewardedCreditsStatusMock).not.toHaveBeenCalled();
  });

  it("returns web status for the current user", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });
    getRewardedCreditsStatusMock.mockResolvedValueOnce({ wallet: { balance: 0 } });

    const response = await GET(new Request("http://localhost/api/v1/rewarded-ads/status?platform=WEB_TOUCH"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getRewardedCreditsStatusMock).toHaveBeenCalledWith({
      userId: "user-1",
      platform: "WEB_TOUCH",
      target: undefined,
    });
  });
});
