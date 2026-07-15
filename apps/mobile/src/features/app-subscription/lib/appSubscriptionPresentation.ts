export type AppSubscriptionPlanPresentation = {
  code: "MONTHLY";
  title: string;
  intervalDays: number;
  yookassaPriceRub: number;
  enabled?: boolean | null;
};

export function getYookassaPrimaryCta(): string {
  return "Оформить подписку";
}

export function getYookassaPaymentCaption(): string {
  return "Списание произойдёт при оформлении подписки. Способ оплаты сохраняется в ЮKassa для автопродления.";
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
  const suffix =
    plan?.intervalDays === 7
      ? "неделю"
      : plan?.intervalDays === 30
        ? "месяц"
        : `${plan?.intervalDays ?? 0} дн.`;
  return `${price.toLocaleString("ru-RU").replace(/\s/g, " ")} ₽/${suffix}`;
}
