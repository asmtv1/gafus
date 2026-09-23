import { beforeEach, describe, expect, it, vi } from "vitest";

const { getReportMock, getServerSessionMock, redirectMock } = vi.hoisted(() => ({
  getReportMock: vi.fn(),
  getServerSessionMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));
vi.mock("@gafus/core/services/mobileIntro", () => ({ getMobileIntroReport: getReportMock }));
vi.mock("@gafus/logger", () => ({ createAdminPanelLogger: () => ({ error: vi.fn() }) }));

import { getAdminMobileIntroReport } from "./mobileIntroReport";

describe("getAdminMobileIntroReport", () => {
  const range = {
    start: new Date("2026-08-31T20:00:00.000Z"),
    end: new Date("2026-09-17T20:00:00.000Z"),
  };

  beforeEach(() => vi.clearAllMocks());

  it("redirects unauthenticated visitors to login", async () => {
    getServerSessionMock.mockResolvedValue(null);

    await expect(getAdminMobileIntroReport(range)).rejects.toThrow("REDIRECT:/login");
    expect(getReportMock).not.toHaveBeenCalled();
  });

  it("keeps the report admin-only", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "moderator-1", role: "MODERATOR" } });

    await expect(getAdminMobileIntroReport(range)).rejects.toThrow("REDIRECT:/main-panel");
    expect(getReportMock).not.toHaveBeenCalled();
  });

  it("loads the requested Samara-converted interval for an admin", async () => {
    const report = { openings: 12 };
    getServerSessionMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    getReportMock.mockResolvedValue(report);

    await expect(getAdminMobileIntroReport(range)).resolves.toBe(report);
    expect(getReportMock).toHaveBeenCalledWith(range);
  });
});
