import { reportClientError } from "@/shared/lib/error-reporting";
import { API_BASE_URL } from "@/shared/config";
import type { ApiResponse } from "./client";
import { getMobileClientHeaders } from "./client-context";

/** Public normalization/validity check only; eligibility stays server-authoritative. */
export async function previewRegistrationPromoCode(
  promoCode: string,
): Promise<ApiResponse<{ code: string }>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/registration-promo-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getMobileClientHeaders() },
      body: JSON.stringify({ promoCode }),
    });
    if (!response.ok) {
      if (response.status >= 500) reportClientError(new Error("REGISTRATION_PROMO_SERVER_FAILURE"), { issueKey: "AuthRegistrationPromo", keys: { operation: "server" } });
      const errorData = await response
        .json()
        .catch(() => {
          // diagnostic: expected Non-JSON HTTP error bodies retain the original status fallback; 5xx is reported above.
          return {} as { error?: string; code?: string };
        });
      return {
        success: false,
        error: errorData.error || "Промокод не удалось проверить",
        code: errorData.code || `HTTP_${response.status}`,
      };
    }
    const result = await response.json();
    return { success: true, data: result.data };
  } catch (error) {
    reportClientError(error, { issueKey: "AuthRegistrationPromo", keys: { operation: "request" }, severity: "warning" });
    return { success: false, error: "Ошибка подключения к серверу", code: "NETWORK_ERROR" };
  }
}
