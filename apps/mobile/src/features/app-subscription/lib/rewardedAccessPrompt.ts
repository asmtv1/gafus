type RewardedAccessPromptStatus = {
  settings?: {
    platformEnabled: boolean;
  };
  canWatchAd?: boolean;
  canWatchAdReason?:
    | "OK"
    | "PLATFORM_DISABLED"
    | "TARGET_ALREADY_ACTIVE"
    | "DAILY_LIMIT_REACHED";
};

export const REWARDED_DAILY_LIMIT_NOTICE =
  "Достигнут дневной лимит просмотра рекламы. Пожалуйста, возвращайтесь завтра.";

export type RewardedAccessPrompt = {
  mode: "loading" | "standard-paywall";
  primaryText: string;
  subscriptionText: string | null;
  rewardedActionVisible: boolean;
  rewardedActionDisabled: boolean;
  rewardedNotice: string | null;
};

export function getRewardedAccessPrompt(input: {
  isLoading: boolean;
  status: RewardedAccessPromptStatus | null;
  dailyLimitReached?: boolean;
}): RewardedAccessPrompt {
  if (input.isLoading) {
    return {
      mode: "loading",
      primaryText: "",
      subscriptionText: "Оформить подписку",
      rewardedActionVisible: false,
      rewardedActionDisabled: true,
      rewardedNotice: null,
    };
  }

  const dailyLimitReached =
    input.dailyLimitReached === true ||
    input.status?.canWatchAdReason === "DAILY_LIMIT_REACHED";
  const platformEnabled = input.status?.settings?.platformEnabled === true;

  return {
    mode: "standard-paywall",
    primaryText: "Открыть за рекламу",
    subscriptionText: "Оформить подписку",
    rewardedActionVisible:
      platformEnabled && (input.status?.canWatchAd === true || dailyLimitReached),
    rewardedActionDisabled: dailyLimitReached,
    rewardedNotice: dailyLimitReached ? REWARDED_DAILY_LIMIT_NOTICE : null,
  };
}
