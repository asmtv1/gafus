import { describe, expect, it } from "vitest";

import { getRewardedStatusMessage } from "./rewardedPaywallCopy";

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
});
