import { describe, expect, it } from "vitest";

import { getRewardedAccessPrompt } from "./rewardedAccessPrompt";

describe("getRewardedAccessPrompt", () => {
  it("offers direct credit unlock when the target can be unlocked with current balance", () => {
    expect(
      getRewardedAccessPrompt({
        isLoading: false,
        status: {
          wallet: { balance: 3, maxBalance: 5 },
          target: {
            cost: 1,
            unlocked: false,
            canUnlockWithCurrentBalance: true,
          },
        },
      }),
    ).toEqual({
      mode: "direct-credit",
      balanceText: "У вас 3 кредита из 5.",
      primaryText: "Открыть за 1 кредит",
      subscriptionText: "Оформить подписку",
    });
  });

  it("offers only rewarded ad action when the wallet has no credits", () => {
    expect(
      getRewardedAccessPrompt({
        isLoading: false,
        status: {
          wallet: { balance: 0, maxBalance: 5 },
          target: {
            cost: 1,
            unlocked: false,
            canUnlockWithCurrentBalance: false,
          },
        },
      }),
    ).toEqual({
      mode: "standard-paywall",
      balanceText: "У вас 0 кредитов из 5.",
      primaryText: "Посмотреть рекламу или оформить Premium",
      subscriptionText: null,
    });
  });
});
