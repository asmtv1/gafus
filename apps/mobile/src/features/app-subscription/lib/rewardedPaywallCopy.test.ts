import { describe, expect, it } from "vitest";

import { getRewardedAccessSummary, getRewardedStatusMessage } from "./rewardedPaywallCopy";

describe("rewarded paywall copy", () => {
  it("tells the user that a new ad will be available tomorrow after the daily limit", () => {
    expect(
      getRewardedStatusMessage({
        isLoading: false,
        status: {
          canWatchAdReason: "DAILY_LIMIT_REACHED",
          settings: {
            platformEnabled: true,
            paywallCtaEnabled: true,
          },
        },
      }),
    ).toBe("Лимит рекламы на сегодня исчерпан. Новая реклама будет доступна завтра.");
  });

  it("explains missing credits for a consultation booking target", () => {
    expect(
      getRewardedAccessSummary({
        target: {
          targetType: "CONSULTATION_BOOKING",
          cost: 5,
          unlocked: false,
          missingCredits: 2,
        },
        wallet: {
          balance: 3,
        },
      }),
    ).toEqual({
      title: "Не хватает кредитов для записи",
      subtitle: "Запись к кинологу стоит 5 кредитов. У вас 3, не хватает 2.",
    });
  });
});
