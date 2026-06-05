import { formatCreditsWord } from "./rewardedPaywallCopy";

type RewardedAccessPromptStatus = {
  wallet?: {
    balance: number;
    maxBalance: number;
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
      balanceText: string;
      primaryText: string;
      subscriptionText: string | null;
    }
  | {
      mode: "direct-credit";
      balanceText: string;
      primaryText: string;
      subscriptionText: string | null;
    }
  | {
      mode: "standard-paywall";
      balanceText: string;
      primaryText: string;
      subscriptionText: string | null;
    };

export function getRewardedAccessPrompt(input: {
  isLoading: boolean;
  status: RewardedAccessPromptStatus | null;
}): RewardedAccessPrompt {
  const cost = input.status?.target?.cost ?? 1;
  const balance = input.status?.wallet?.balance ?? 0;
  const maxBalance = input.status?.wallet?.maxBalance ?? 5;
  const balanceText = input.status
    ? `У вас ${balance} ${formatCreditsWord(balance)} из ${maxBalance}.`
    : "Проверяем баланс кредитов.";

  if (input.isLoading) {
    return {
      mode: "loading",
      balanceText,
      primaryText: "Проверяем кредиты...",
      subscriptionText: "Оформить подписку",
    };
  }

  if (input.status?.target?.canUnlockWithCurrentBalance) {
    return {
      mode: "direct-credit",
      balanceText,
      primaryText: `Открыть за ${cost} ${formatCreditsWord(cost)}`,
      subscriptionText: "Оформить подписку",
    };
  }

  if (input.status?.wallet?.balance === 0) {
    return {
      mode: "standard-paywall",
      balanceText,
      primaryText: "Посмотреть рекламу или оформить Premium",
      subscriptionText: null,
    };
  }

  return {
    mode: "standard-paywall",
    balanceText,
    primaryText: "Открыть через Premium или рекламу",
    subscriptionText: "Оформить подписку",
  };
}
