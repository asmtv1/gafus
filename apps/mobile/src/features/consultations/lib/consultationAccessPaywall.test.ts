import { beforeEach, describe, expect, it, vi } from "vitest";

const { getStatusMock } = vi.hoisted(() => ({
  getStatusMock: vi.fn(),
}));
const { openAppSubscriptionPaywallMock } = vi.hoisted(() => ({
  openAppSubscriptionPaywallMock: vi.fn(),
}));

vi.mock("@/features/rewarded-ads", () => ({
  rewardedAdsApi: {
    getStatus: getStatusMock,
  },
}));

vi.mock("@/features/app-subscription", () => {
  return {
    getRewardedAccessSummary: (status: {
      wallet?: { balance?: number };
      target?: { cost: number; missingCredits?: number };
    }) => ({
      title: "Не хватает кредитов для записи",
      subtitle: `Запись к кинологу стоит ${status.target?.cost ?? 5} кредитов. У вас ${status.wallet?.balance ?? 0}, не хватает ${status.target?.missingCredits ?? 0}.`,
    }),
    openAppSubscriptionPaywall: openAppSubscriptionPaywallMock,
  };
});

import { openConsultationAccessPaywall } from "./consultationAccessPaywall";

describe("openConsultationAccessPaywall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens the paywall with consultation booking cost and missing credits summary", async () => {
    const onRewardedGrant = vi.fn();
    getStatusMock.mockResolvedValueOnce({
      success: true,
      data: {
        wallet: {
          balance: 3,
          pendingRefundCredits: 0,
          maxBalance: 5,
          creditsPerReward: 2,
        },
        today: {
          adsWatchedToday: 0,
          dailyAdLimit: 1,
          limitResetAt: "2026-06-04T00:00:00.000Z",
        },
        settings: {
          platformEnabled: true,
          paywallCtaEnabled: true,
          testMode: true,
        },
        canWatchAd: true,
        canWatchAdReason: "OK",
        nextGrantCredits: 2,
        target: {
          targetType: "CONSULTATION_BOOKING",
          targetId: "slot:slot-1",
          cost: 5,
          unlocked: false,
          canUnlockWithCurrentBalance: false,
          missingCredits: 2,
        },
      },
    });

    await openConsultationAccessPaywall({
      targetId: "slot:slot-1",
      onRewardedGrant,
    });

    expect(getStatusMock).toHaveBeenCalledWith({
      targetType: "CONSULTATION_BOOKING",
      targetId: "slot:slot-1",
    });
    expect(openAppSubscriptionPaywallMock).toHaveBeenCalledWith({
      reason: "required",
      rewardedTarget: {
        targetType: "CONSULTATION_BOOKING",
        targetId: "slot:slot-1",
      },
      accessSummary: {
        title: "Не хватает кредитов для записи",
        subtitle: "Запись к кинологу стоит 5 кредитов. У вас 3, не хватает 2.",
      },
      onRewardedGrant,
    });
  });
});
