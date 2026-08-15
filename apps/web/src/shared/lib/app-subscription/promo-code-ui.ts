export type AppSubscriptionPromoCodeUiState =
  | "idle"
  | "checking"
  | "applied"
  | "invalid-format"
  | "not-found"
  | "inactive"
  | "changed"
  | "not-eligible"
  | "feature-disabled"
  | "checkout-in-progress"
  | "network-error";

const PROMO_CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const APP_SUBSCRIPTION_PROMO_CODE_MESSAGES: Record<
  Exclude<AppSubscriptionPromoCodeUiState, "applied">,
  string
> = {
  idle: "Введите код и нажмите «Применить». Запрос отправится только после этого.",
  checking: "Проверяем промокод…",
  "invalid-format": "Используйте от 1 до 64 латинских букв, цифр, _ или -.",
  "not-found": "Промокод не найден. Проверьте написание.",
  inactive: "Этот промокод сейчас неактивен.",
  changed: "Условия промокода изменились. Примените его ещё раз.",
  "not-eligible": "Промокод доступен только до первой успешной оплаты Premium через ЮKassa.",
  "feature-disabled": "Промокоды сейчас недоступны для этой версии приложения.",
  "checkout-in-progress":
    "Уже есть незавершённая оплата. Завершите или отмените её перед новой попыткой.",
  "network-error": "Не удалось проверить промокод. Проверьте соединение и попробуйте снова.",
};

export function isAppSubscriptionPromoCodeInputValid(value: string): boolean {
  return PROMO_CODE_PATTERN.test(value.trim());
}

export function getAppSubscriptionPromoCodeErrorState(
  code: string | null,
): AppSubscriptionPromoCodeUiState {
  switch (code) {
    case "PROMO_CODE_INVALID_FORMAT":
      return "invalid-format";
    case "PROMO_CODE_NOT_FOUND":
      return "not-found";
    case "PROMO_CODE_INACTIVE":
      return "inactive";
    case "PROMO_CODE_CHANGED":
      return "changed";
    case "PROMO_CODE_NOT_ELIGIBLE":
      return "not-eligible";
    case "PROMO_CODE_FEATURE_DISABLED":
      return "feature-disabled";
    case "PROMO_CHECKOUT_IN_PROGRESS":
      return "checkout-in-progress";
    default:
      return "network-error";
  }
}

export function shouldBlockAppSubscriptionCheckoutForPromo(
  input: string,
  hasAppliedPreview: boolean,
): boolean {
  return input.trim().length > 0 && !hasAppliedPreview;
}
