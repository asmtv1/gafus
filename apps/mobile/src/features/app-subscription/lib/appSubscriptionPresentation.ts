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

export function getYookassaPrimaryCta(_params: { offer: TrialPresentationSource }): string {
  return "Оформить подписку";
}

export function getYookassaPricePillText(_params: {
  offer: TrialPresentationSource;
}): string | null {
  return null;
}

export function getYookassaTrialLeadText(params: {
  offer: TrialPresentationSource;
}): string | null {
  if (params.offer?.yookassaTrialAvailable && params.offer.yookassaTrialDays) {
    return `${params.offer.yookassaTrialDays} дня бесплатно, затем`;
  }
  return null;
}

export function getYookassaPaymentCaption(params: { offer: TrialPresentationSource }): string {
  if (params.offer?.yookassaTrialAvailable && params.offer.yookassaTrialDays) {
    return "Списание произойдёт после пробного периода. Способ оплаты сохраняется в ЮKassa для автопродления.";
  }
  return "Списание произойдёт при оформлении подписки. Способ оплаты сохраняется в ЮKassa для автопродления.";
}

export function getYookassaLegalSuffix(params: { offer: TrialPresentationSource }): string {
  if (params.offer?.yookassaTrialAvailable && params.offer.yookassaTrialDays) {
    return `; первые ${params.offer.yookassaTrialDays} дня бесплатно, затем способ оплаты сохраняется в ЮKassa для автопродления.`;
  }
  return "; способ оплаты сохраняется в ЮKassa для автопродления.";
}

export function getYookassaTrialUnavailableText(params: {
  offer: TrialPresentationSource;
}): string | null {
  if (params.offer?.yookassaTrialUnavailableReason === "CARD_FINGERPRINT_REUSED") {
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
