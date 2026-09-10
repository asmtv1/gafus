export type RegistrationPromoUiState = "idle" | "checking" | "applied" | "invalid" | "network-error";

export function shouldBlockRegistrationForPromo(
  promoCode: string,
  state: RegistrationPromoUiState,
): boolean {
  return promoCode.trim().length > 0 && state !== "applied";
}

export function getRegistrationPromoStatusMessage(
  state: RegistrationPromoUiState,
  message: string | null,
): string {
  if (message) return message;
  return state === "checking" ? "Проверяем промокод…" : "Введите код и нажмите «Применить».";
}
