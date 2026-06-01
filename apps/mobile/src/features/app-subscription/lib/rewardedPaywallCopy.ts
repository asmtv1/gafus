const DEFAULT_REWARDED_CREDITS_PER_REWARD = 5;

type RewardedCopyStatus = {
  wallet?: {
    creditsPerReward?: number;
    maxBalance?: number;
  };
  nextGrantCredits?: number;
  canWatchAdReason?: string;
  settings?: {
    platformEnabled?: boolean;
    paywallCtaEnabled?: boolean;
  };
  target?: {
    cost: number;
    unlocked: boolean;
  };
};

export function formatCreditsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return "кредитов";
  if (mod10 === 1) return "кредит";
  if (mod10 >= 2 && mod10 <= 4) return "кредита";
  return "кредитов";
}

function getRewardedUnavailableText(reason?: string): string {
  switch (reason) {
    case "DAILY_LIMIT_REACHED":
      return "Лимит рекламы на сегодня исчерпан. Новая реклама будет доступна завтра.";
    case "BALANCE_FULL":
      return "Баланс кредитов уже заполнен.";
    case "PLATFORM_DISABLED":
    case "CTA_DISABLED":
    case "OK":
    default:
      return "";
  }
}

export function getRewardedEarnText(status: RewardedCopyStatus | null): string {
  const creditsPerReward = status?.wallet?.creditsPerReward ?? DEFAULT_REWARDED_CREDITS_PER_REWARD;
  const nextGrantCredits = status?.nextGrantCredits ?? creditsPerReward;
  if (nextGrantCredits > 0 && nextGrantCredits < creditsPerReward) {
    return `За полный просмотр начислим ${nextGrantCredits} ${formatCreditsWord(nextGrantCredits)} — пополним баланс до ${status?.wallet?.maxBalance ?? DEFAULT_REWARDED_CREDITS_PER_REWARD}.`;
  }
  return `За полный просмотр начислим ${creditsPerReward} ${formatCreditsWord(creditsPerReward)}.`;
}

export function getRewardedSpendText(status: RewardedCopyStatus | null): string {
  if (status?.target && !status.target.unlocked) {
    return `Текущее действие стоит ${status.target.cost} ${formatCreditsWord(status.target.cost)}. Кредиты также можно тратить на статьи, шаги курса и консультации.`;
  }
  return "Кредиты можно потратить внутри Gafus: 1 кредит открывает статью или шаг курса, 5 кредитов — запись на консультацию.";
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
  if (!input.status.settings.paywallCtaEnabled) {
    return "Просмотр рекламы сейчас выключен.";
  }
  return getRewardedUnavailableText(input.status.canWatchAdReason);
}
