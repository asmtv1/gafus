import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));
vi.mock("@gafus/core/errors", () => ({
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));
vi.mock("@gafus/core/services/appSubscription", () => ({
  getDefaultAppSubscriptionSettings: mocks.getSettings,
  updateDefaultAppSubscriptionSettings: mocks.updateSettings,
}));

import {
  getAppSubscriptionSettingsAction,
  updateAppSubscriptionSettingsAction,
} from "./appSubscriptionAdminActions";

const payload = {
  twoWeeksEnabled: true,
  yookassaTwoWeeksPriceRub: 1490,
  twoWeeksIntervalDays: 14,
  monthlyEnabled: true,
  yookassaMonthlyPriceRub: 2490,
  monthlyIntervalDays: 30,
  threeMonthsEnabled: false,
  yookassaThreeMonthsPriceRub: 6490,
  threeMonthsIntervalDays: 90,
  monthlyAppleProductId: " premium.month ",
};

describe("app subscription settings admin action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns all three public YooKassa plans with safe defaults", async () => {
    mocks.getSettings.mockResolvedValue(null);

    await expect(getAppSubscriptionSettingsAction()).resolves.toEqual({
      twoWeeksEnabled: false,
      yookassaTwoWeeksPriceRub: 1185,
      twoWeeksIntervalDays: 30,
      monthlyEnabled: true,
      yookassaMonthlyPriceRub: 1465,
      monthlyIntervalDays: 30,
      threeMonthsEnabled: false,
      yookassaThreeMonthsPriceRub: 2470,
      threeMonthsIntervalDays: 30,
      monthlyAppleProductId: null,
    });
  });

  it.each([
    [null, "Не авторизован"],
    [{ user: { id: "moderator-1", role: "MODERATOR" } }, "Недостаточно прав"],
  ])("keeps non-admin caller read-only", async (session, error) => {
    mocks.getServerSession.mockResolvedValue(session);

    await expect(updateAppSubscriptionSettingsAction(payload)).resolves.toEqual({
      success: false,
      error,
    });
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it("validates all plan values atomically", async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });

    await expect(
      updateAppSubscriptionSettingsAction({ ...payload, threeMonthsIntervalDays: 90.5 }),
    ).resolves.toEqual({ success: false, error: "Невалидные данные" });
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it("saves all public plans together and trims the sole Apple product id", async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.updateSettings.mockResolvedValue({ key: "default" });

    await expect(updateAppSubscriptionSettingsAction(payload)).resolves.toEqual({ success: true });
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      ...payload,
      monthlyAppleProductId: "premium.month",
      actorId: "admin-1",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/main-panel/admin");
  });
});
