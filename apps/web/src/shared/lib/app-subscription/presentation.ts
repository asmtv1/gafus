type TrialPresentationSource =
  | {
      yookassaTrialAvailable?: boolean | null;
      yookassaTrialDays?: number | null;
      yookassaTrialUnavailableReason?: string | null;
    }
  | null
  | undefined;

export type AppSubscriptionPlanPresentation = {
  code: "WEEKLY" | "MONTHLY";
  title: string;
  intervalDays: number;
  yookassaPriceRub: number;
  enabled?: boolean | null;
};

export function getYookassaPrimaryCta(_source: TrialPresentationSource): string {
  return "Оформить подписку";
}

export function getYookassaPriceNote(_source: TrialPresentationSource): string {
  return "Автопродление по тарифу";
}

export function getYookassaLegalText(_source: TrialPresentationSource, priceText: string): string {
  return `списание произойдёт при оформлении подписки, затем подписка продлевается автоматически по тарифу ${priceText}. Автопродление можно отключить в профиле.`;
}

export function getYookassaReturnSuccessTitle(_source: TrialPresentationSource): string {
  return "Premium подключён";
}

export function getYookassaTrialUnavailableText(source: TrialPresentationSource): string | null {
  if (source?.yookassaTrialUnavailableReason === "CARD_FINGERPRINT_REUSED") {
    return "С этим способом оплаты пробный период уже использован. Premium можно подключить через обычную оплату.";
  }
  return null;
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

  const normalizedDays = plan?.code === "WEEKLY" ? 30 : 7;
  const normalizedPrice = Math.round((price / days) * normalizedDays);
  const suffix = normalizedDays === 30 ? "за 30 дней" : "в неделю";
  return `≈ ${normalizedPrice.toLocaleString("ru-RU").replace(/\s/g, " ")} ₽ ${suffix}`;
}
