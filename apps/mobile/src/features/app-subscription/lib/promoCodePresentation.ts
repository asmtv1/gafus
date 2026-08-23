import type { AppSubscriptionPromoCodePreviewDto } from "../api/appSubscriptionApi";

export type PromoCodeUiState =
  | "idle"
  | "checking"
  | "applied"
  | "needs_apply"
  | "invalid_format"
  | "not_found"
  | "inactive"
  | "changed"
  | "not_eligible"
  | "feature_disabled"
  | "checkout_in_progress"
  | "network_error";

export function shouldShowSubscriptionPromoCode(input: {
  canUseYookassa: boolean;
  entryEnabled: boolean;
  eligible: boolean;
}): boolean {
  return input.canUseYookassa && input.entryEnabled && input.eligible;
}

export function shouldBlockYookassaStartForPromo(input: {
  hasPromoText: boolean;
  hasAppliedPreview: boolean;
}): boolean {
  return input.hasPromoText && !input.hasAppliedPreview;
}

export function promoCodeStateFromErrorCode(code: string | undefined): PromoCodeUiState {
  switch (code) {
    case "PROMO_CODE_INVALID_FORMAT":
      return "invalid_format";
    case "PROMO_CODE_NOT_FOUND":
      return "not_found";
    case "PROMO_CODE_INACTIVE":
      return "inactive";
    case "PROMO_CODE_CHANGED":
      return "changed";
    case "PROMO_CODE_NOT_ELIGIBLE":
      return "not_eligible";
    case "PROMO_CODE_FEATURE_DISABLED":
      return "feature_disabled";
    case "PROMO_CHECKOUT_IN_PROGRESS":
      return "checkout_in_progress";
    default:
      return "network_error";
  }
}

export function getPromoCodeStateMessage(state: PromoCodeUiState): string | null {
  switch (state) {
    case "checking":
      return "Проверяем промокод…";
    case "applied":
      return "Промокод применён.";
    case "needs_apply":
      return "Примените промокод или очистите поле перед оплатой.";
    case "invalid_format":
      return "Используйте до 64 латинских букв, цифр, _ или -.";
    case "not_found":
      return "Промокод не найден.";
    case "inactive":
      return "Этот промокод сейчас неактивен.";
    case "changed":
      return "Условия промокода изменились. Примените его ещё раз.";
    case "not_eligible":
      return "Промокод доступен только до первой успешной оплаты Premium через ЮKassa.";
    case "feature_disabled":
      return "Промокоды сейчас недоступны для этой версии приложения.";
    case "checkout_in_progress":
      return "Уже есть незавершённая оплата. Завершите или отмените её перед новой попыткой.";
    case "network_error":
      return "Не удалось проверить промокод. Проверьте интернет и попробуйте снова.";
    default:
      return null;
  }
}

function formatRub(value: number): string {
  return `${value.toLocaleString("ru-RU").replace(/\s/g, " ")} ₽`;
}

export function getPromoCodePricePresentation(preview: AppSubscriptionPromoCodePreviewDto) {
  const period =
    preview.intervalDays === 30
      ? "30 дней"
      : preview.intervalDays === 90
        ? "90 дней"
        : `${preview.intervalDays} дней`;
  return {
    discounted: formatRub(preview.discountedPriceRub),
    originalPrice: formatRub(preview.originalPriceRub),
    renewalPrice: formatRub(preview.renewalPriceRub),
    discount: `−${preview.discountPercent}%`,
    firstCharge: `Сейчас спишется ${formatRub(preview.discountedPriceRub)}`,
    nextCharge: `Следующее списание произойдёт автоматически через ${period} — ${formatRub(preview.renewalPriceRub)}`,
    legal: "Скидка действует только на первый платёж.",
  };
}
