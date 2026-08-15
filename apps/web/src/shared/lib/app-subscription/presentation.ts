export type AppSubscriptionPlanPresentation = {
  code: "TWO_WEEKS" | "MONTHLY" | "THREE_MONTHS";
  title: string;
  intervalDays: number;
  yookassaPriceRub: number;
  enabled?: boolean | null;
  badge?: "TRY" | "POPULAR" | "MAX_SAVINGS" | null;
  savingsRub?: number | null;
};

const YOOKASSA_PLAN_ORDER: AppSubscriptionPlanPresentation["code"][] = [
  "TWO_WEEKS",
  "MONTHLY",
  "THREE_MONTHS",
];

export function getYookassaPrimaryCta(amount: string | null = null): string {
  return amount ? `Оплатить ${amount} по СБП` : "Оформить подписку";
}

export function getYookassaPriceNote(): string {
  return "Автопродление по тарифу";
}

export function getYookassaLegalText(
  currentChargeText: string,
  renewalPriceText: string,
): string {
  return `сейчас спишется ${currentChargeText}, затем подписка продлевается автоматически по цене ${renewalPriceText}. Автопродление можно отключить в профиле.`;
}

export function getYookassaReturnSuccessTitle(): string {
  return "Premium подключён";
}

export function selectDefaultAppSubscriptionPlan<T extends AppSubscriptionPlanPresentation>(
  plans: readonly T[] | null | undefined,
): T | null {
  const enabledPlans = (plans ?? []).filter((plan) => plan.enabled !== false);
  return enabledPlans.find((plan) => plan.code === "MONTHLY") ?? enabledPlans[0] ?? null;
}

export function sortYookassaSubscriptionPlans<T extends AppSubscriptionPlanPresentation>(
  plans: readonly T[] | null | undefined,
): T[] {
  return (plans ?? [])
    .filter((plan) => plan.enabled !== false)
    .slice()
    .sort((left, right) => YOOKASSA_PLAN_ORDER.indexOf(left.code) - YOOKASSA_PLAN_ORDER.indexOf(right.code));
}

export function getAppSubscriptionPlanBadgeText(
  badge: AppSubscriptionPlanPresentation["badge"],
): string | null {
  if (badge === "TRY") return "Попробовать";
  if (badge === "POPULAR") return "Популярный";
  if (badge === "MAX_SAVINGS") return "Максимальная экономия";
  return null;
}

export function getAppSubscriptionPlanSavingsText(value: unknown): string | null {
  const savings = Number(value);
  return Number.isFinite(savings) && savings > 0
    ? `Экономия ${formatAppSubscriptionRubAmount(savings)}`
    : null;
}

export function formatAppSubscriptionPlanPrice(
  plan: Partial<AppSubscriptionPlanPresentation> | null | undefined,
): string {
  const price = Number(plan?.yookassaPriceRub);
  if (!Number.isFinite(price) || price <= 0) return "—";
  const suffix = getAppSubscriptionIntervalShortLabel(plan?.intervalDays);
  return `${price.toLocaleString("ru-RU").replace(/\s/g, " ")} ₽/${suffix}`;
}

export function getAppSubscriptionIntervalShortLabel(intervalDays: unknown): string {
  const days = Number(intervalDays);
  if (days === 30) return "месяц";
  if (days === 14) return "14 дней";
  if (days === 90) return "90 дней";
  return `${Number.isFinite(days) && days > 0 ? days : 0} дн.`;
}

export function getAppSubscriptionIntervalRenewalText(intervalDays: unknown): string {
  const days = Number(intervalDays);
  if (!Number.isFinite(days) || days <= 0) return "в следующий период";
  return `через ${days} ${getRussianDayWord(days)}`;
}

function getRussianDayWord(days: number): string {
  const lastTwo = days % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "дней";
  switch (days % 10) {
    case 1:
      return "день";
    case 2:
    case 3:
    case 4:
      return "дня";
    default:
      return "дней";
  }
}

export function formatAppSubscriptionRubAmount(value: unknown): string {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) return "—";
  return `${price.toLocaleString("ru-RU", { maximumFractionDigits: 2 }).replace(/\s/g, " ")} ₽`;
}

export type AppSubscriptionPromoPricePresentation = {
  discountPercent: number;
  originalPriceRub: number;
  discountedPriceRub: number;
  renewalPriceRub: number;
  intervalDays: number;
};

export function getAppSubscriptionPromoPricePresentation(
  preview: AppSubscriptionPromoPricePresentation,
) {
  return {
    currentChargeText: `Сейчас спишется ${formatAppSubscriptionRubAmount(preview.discountedPriceRub)}`,
    discountChipText: `−${preview.discountPercent}%`,
    nextRenewalText: `Следующее списание ${getAppSubscriptionIntervalRenewalText(preview.intervalDays)} — ${formatAppSubscriptionRubAmount(preview.renewalPriceRub)}`,
    ongoingRenewalText: `Далее ${formatAppSubscriptionRubAmount(preview.renewalPriceRub)} каждые ${preview.intervalDays} ${getRussianDayWord(preview.intervalDays)}`,
  };
}

export function getAppSubscriptionPlanPeriodText(
  plan: Partial<AppSubscriptionPlanPresentation> | null | undefined,
): string {
  const days = Number(plan?.intervalDays);
  if (!Number.isFinite(days) || days <= 0) return "Период оплаты уточняется";
  return `Оплата каждые ${days} дней`;
}

export function getAppSubscriptionPlanComparisonText(
  plan: Partial<AppSubscriptionPlanPresentation> | null | undefined,
): string {
  const price = Number(plan?.yookassaPriceRub);
  const days = Number(plan?.intervalDays);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(days) || days <= 0) {
    return "Стоимость уточняется";
  }

  const normalizedPrice = Math.round((price / days) * 7);
  return `≈ ${normalizedPrice.toLocaleString("ru-RU").replace(/\s/g, " ")} ₽ в неделю`;
}
