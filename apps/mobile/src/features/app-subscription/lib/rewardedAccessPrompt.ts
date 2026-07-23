import { formatGafusesWord } from "./rewardedPaywallCopy";

type RewardedAccessPromptStatus = {
  settings?: {
    platformEnabled: boolean;
  };
  target?: {
    cost: number;
    unlocked: boolean;
    canUnlockWithCurrentBalance: boolean;
  };
};

export type RewardedAccessPrompt =
  | {
      mode: "loading";
      primaryText: string;
      subscriptionText: string | null;
    }
  | {
      mode: "direct-credit";
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
  const cost = input.status?.target?.cost ?? 1;

  if (input.isLoading) {
    return {
      mode: "loading",
      primaryText: "",
      subscriptionText: "Оформить подписку",
    };
  }

  if (input.status?.target?.canUnlockWithCurrentBalance) {
    return {
      mode: "direct-credit",
      primaryText: `Открыть за ${cost} ${formatGafusesWord(cost)}`,
      subscriptionText: "Оформить подписку",
    };
  }

  return {
    mode: "standard-paywall",
    primaryText: "Открыть за рекламу",
    subscriptionText: "Оформить подписку",
    showRewardedAction: input.status?.settings?.platformEnabled === true,
  };
}
