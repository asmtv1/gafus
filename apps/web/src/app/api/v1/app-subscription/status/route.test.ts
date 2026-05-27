import { describe, expect, it, vi } from "vitest";

const { getAppSubscriptionAccessMock, getServerSessionMock } = vi.hoisted(() => ({
  getAppSubscriptionAccessMock: vi.fn(),
  getServerSessionMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@gafus/auth", () => ({
  authOptions: {},
}));

vi.mock("@gafus/core/services/appSubscription", () => ({
  getAppSubscriptionAccess: getAppSubscriptionAccessMock,
}));

import { GET } from "./route";

describe("GET /api/v1/app-subscription/status", () => {
  it("requires auth", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("returns app subscription access for the current user", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });
    getAppSubscriptionAccessMock.mockResolvedValueOnce({ hasAccess: true });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { hasAccess: true },
      success: true,
    });
    expect(getAppSubscriptionAccessMock).toHaveBeenCalledWith("user-1");
  });
});
