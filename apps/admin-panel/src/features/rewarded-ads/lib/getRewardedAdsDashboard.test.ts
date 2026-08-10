import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDashboardMock, getServerSessionMock, redirectMock } = vi.hoisted(() => ({
  getDashboardMock: vi.fn(),
  getServerSessionMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));
vi.mock("@gafus/core/services/adminRewardedAds", () => ({
  getRewardedAdsAdminDashboard: getDashboardMock,
}));
vi.mock("@gafus/logger", () => ({
  createAdminPanelLogger: () => ({ error: vi.fn() }),
}));

import { getAdminRewardedAdsDashboard } from "./getRewardedAdsDashboard";

describe("getAdminRewardedAdsDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users to login", async () => {
    getServerSessionMock.mockResolvedValue(null);

    await expect(getAdminRewardedAdsDashboard(30)).rejects.toThrow("REDIRECT:/login");
    expect(getDashboardMock).not.toHaveBeenCalled();
  });

  it("keeps the advertising dashboard admin-only", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "moderator-1", role: "MODERATOR" } });

    await expect(getAdminRewardedAdsDashboard(30)).rejects.toThrow("REDIRECT:/main-panel");
    expect(getDashboardMock).not.toHaveBeenCalled();
  });

  it("loads the selected period for an admin", async () => {
    const dashboard = { generatedAt: "2026-05-17T12:00:00.000Z" };
    getServerSessionMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    getDashboardMock.mockResolvedValue(dashboard);

    await expect(getAdminRewardedAdsDashboard(90)).resolves.toBe(dashboard);
    expect(getDashboardMock).toHaveBeenCalledWith({ days: 90 });
  });
});
