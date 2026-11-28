import type { ApiResponse } from "./client";

/** iOS store does not redeem or preview registration promo codes. */
export async function previewRegistrationPromoCode(
  _promoCode: string,
): Promise<ApiResponse<{ code: string }>> {
  return { success: false, code: "PROMO_UNAVAILABLE", error: "Недоступно на iOS" };
}
