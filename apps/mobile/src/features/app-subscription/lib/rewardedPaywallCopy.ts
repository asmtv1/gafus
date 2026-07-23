const DEFAULT_REWARDED_CREDITS_PER_REWARD = 5;

type RewardedCopyStatus = {
  wallet?: {
    balance?: number;
    creditsPerReward?: number;
    maxBalance?: number;
  };
  nextGrantCredits?: number;
  canWatchAdReason?: string;
  settings?: {
    platformEnabled?: boolean;
  };
  target?: {
    targetType?: string;
    cost: number;
    unlocked: boolean;
    missingCredits?: number;
  };
};

export function formatGafusesWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return "гафусов";
  if (mod10 === 1) return "гафус";
  if (mod10 >= 2 && mod10 <= 4) return "гафуса";
  return "гафусов";
}

function getRewardedUnavailableText(reason?: string): string {
  switch (reason) {
    case "DAILY_LIMIT_REACHED":
      return "Лимит рекламы на сегодня исчерпан. Новая реклама будет доступна завтра.";
    case "BALANCE_FULL":
      return "Баланс гафусов уже заполнен.";
    case "PLATFORM_DISABLED":
    case "OK":
    default:
      return "";
  }
}

export function getRewardedEarnText(status: RewardedCopyStatus | null): string {
  const creditsPerReward = status?.wallet?.creditsPerReward ?? DEFAULT_REWARDED_CREDITS_PER_REWARD;
  const nextGrantCredits = status?.nextGrantCredits ?? creditsPerReward;
  if (nextGrantCredits > 0 && nextGrantCredits < creditsPerReward) {
    return `За полный просмотр начислим ${nextGrantCredits} ${formatGafusesWord(nextGrantCredits)} — пополним баланс до ${status?.wallet?.maxBalance ?? DEFAULT_REWARDED_CREDITS_PER_REWARD}.`;
  }
  return `За полный просмотр начислим ${creditsPerReward} ${formatGafusesWord(creditsPerReward)}.`;
}

export function getRewardedSpendText(status: RewardedCopyStatus | null): string {
  if (status?.target && !status.target.unlocked) {
    return `Текущее действие стоит ${status.target.cost} ${formatGafusesWord(status.target.cost)}.`;
  }
  return "1 гафус открывает шаг курса или статью.";
}

export function getRewardedStatusMessage(input: {
  isLoading: boolean;
  error?: string | null;
  status: RewardedCopyStatus | null;
}): string {
  if (input.isLoading) return "Проверяем, доступна ли реклама на этом устройстве.";
  if (input.error) {
    return input.error === "Endpoint не найден"
      ? "Сервис рекламы пока недоступен в текущей версии API."
      : input.error;
  }
  if (!input.status) return "Не удалось загрузить статус рекламы.";
  if (!input.status.settings?.platformEnabled) {
    return "Реклама для этой платформы пока не включена.";
  }
  return getRewardedUnavailableText(input.status.canWatchAdReason);
}

function getTargetName(targetType?: string): string {
  if (targetType === "CONSULTATION_BOOKING") return "Запись к кинологу";
  if (targetType === "ARTICLE") return "Статья";
  if (targetType === "COURSE_STEP" || targetType === "DAILY_COURSE_STEP") return "Шаг курса";
  return "Действие";
}

export function getRewardedAccessSummary(status: RewardedCopyStatus | null): {
  title: string;
  subtitle: string;
} | null {
  if (!status?.target || status.target.unlocked) return null;

  const targetName = getTargetName(status.target.targetType);
  const cost = status.target.cost;
  const balance = status.wallet?.balance ?? 0;
  const missingCredits = status.target.missingCredits ?? Math.max(0, cost - balance);

  if (missingCredits > 0) {
    return {
      title:
        status.target.targetType === "CONSULTATION_BOOKING"
          ? "Не хватает гафусов для записи"
          : "Не хватает гафусов",
      subtitle: `${targetName} стоит ${cost} ${formatGafusesWord(cost)}. У вас ${balance}, не хватает ${missingCredits}.`,
    };
  }

  return {
    title: `${targetName} доступна за гафусы`,
    subtitle: `Можно списать ${cost} ${formatGafusesWord(cost)} с вашего баланса.`,
  };
}
