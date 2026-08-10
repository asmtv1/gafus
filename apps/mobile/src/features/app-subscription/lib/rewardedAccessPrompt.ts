type RewardedAccessPromptStatus = {
  settings?: {
    platformEnabled: boolean;
  };
  canWatchAd?: boolean;
};

export type RewardedAccessPrompt =
  | {
      mode: "loading";
      primaryText: string;
      subscriptionText: string | null;
    }
  | {
      mode: "standard-paywall";
      primaryText: string;
      subscriptionText: string | null;
      showRewardedAction: boolean;
    };

export function getRewardedAccessPrompt(input: {
  isLoading: boolean;
  status: RewardedAccessPromptStatus | null;
}): RewardedAccessPrompt {
  if (input.isLoading) {
    return {
      mode: "loading",
      primaryText: "",
      subscriptionText: "Оформить подписку",
    };
  }

  return {
    mode: "standard-paywall",
    primaryText: "Открыть за рекламу",
    subscriptionText: "Оформить подписку",
    showRewardedAction:
      input.status?.settings?.platformEnabled === true && input.status.canWatchAd === true,
  };
}
