export type AppSubscriptionPlanPresentation = {
  code: "TWO_WEEKS" | "MONTHLY" | "THREE_MONTHS";
  title: string;
  intervalDays: number;
  yookassaPriceRub: number;
  enabled?: boolean | null;
};

function formatRub(value: number): string {
  return `${value.toLocaleString("ru-RU").replace(/\s/g, " ")} ₽`;
}

export function getYookassaPrimaryCta(priceRub?: number | null): string {
  return Number.isFinite(priceRub) && Number(priceRub) > 0
    ? `Оплатить ${formatRub(Number(priceRub))} по СБП`
    : "Оплатить по СБП";
}

export function getYookassaPaymentCaption(): string {
  return "Списание произойдёт при оформлении подписки.";
}

export function getYookassaLegalSuffix(): string {
  return "; способ оплаты сохраняется в ЮKassa для автопродления.";
}

export function selectDefaultAppSubscriptionPlan<T extends AppSubscriptionPlanPresentation>(
  plans: readonly T[] | null | undefined,
): T | null {
  const enabledPlans = (plans ?? []).filter((plan) => plan.enabled !== false);
  return enabledPlans.find((plan) => plan.code === "MONTHLY") ?? enabledPlans[0] ?? null;
}

export function formatAppSubscriptionPlanPrice(
  plan: Partial<AppSubscriptionPlanPresentation> | null | undefined,
): string {
  const price = Number(plan?.yookassaPriceRub);
  if (!Number.isFinite(price) || price <= 0) return "—";
  const suffix = plan?.intervalDays === 30 ? "месяц" : formatPlanPeriod(plan?.intervalDays);
  return `${price.toLocaleString("ru-RU").replace(/\s/g, " ")} ₽/${suffix}`;
}

export function formatPlanPeriod(intervalDays: number | null | undefined): string {
  if (intervalDays === 14) return "14 дней";
  if (intervalDays === 30) return "30 дней";
  if (intervalDays === 90) return "90 дней";
  return `${intervalDays ?? 0} дн.`;
}

export function formatSavingsRub(savingsRub: number | null | undefined): string | null {
  const value = Number(savingsRub);
  return Number.isFinite(value) && value > 0 ? `Экономия ${formatRub(value)}` : null;
}
