import * as WebBrowser from "expo-web-browser";

import { appSubscriptionApi } from "../api/appSubscriptionApi";
import type { AppSubscriptionPlanCode } from "../api/appSubscriptionApi";

const isDev = typeof __DEV__ !== "undefined" && __DEV__;

export type YookassaAppSubscriptionPurchaseResult =
  | { ok: true; localSubscriptionId: string }
  | { ok: false; message: string; code?: string; userCancelled?: boolean; uncertain?: boolean };

export async function yookassaAppSubscriptionPurchase(
  planCode: AppSubscriptionPlanCode,
  promoCode?: { code: string; revision: number },
  isCurrentAccount?: () => boolean,
): Promise<YookassaAppSubscriptionPurchaseResult> {
  const isCurrent = () => {
    try {
      return isCurrentAccount?.() ?? true;
    } catch {
      return false;
    }
  };
  if (!isCurrent()) return { ok: false, message: "Аккаунт изменился. Откройте подписку заново." };
  if (isDev) console.log("[yookassaAppSubscriptionPurchase] start", { planCode });
  let result;
  try {
    result = isCurrentAccount
      ? await appSubscriptionApi.startYookassa(planCode, promoCode, isCurrentAccount)
      : await appSubscriptionApi.startYookassa(planCode, promoCode);
  } catch {
    return {
      ok: false,
      uncertain: true,
      message: "Неизвестно, был ли создан платёж. Проверьте подписку перед повтором.",
    };
  }
  if (!isCurrent()) {
    return {
      ok: false,
      uncertain: true,
      message: "Аккаунт изменился во время создания платежа. Проверьте исходную подписку.",
    };
  }
  const confirmationUrl = result.data?.confirmationUrl;
  const localSubscriptionId = result.data?.localSubscriptionId;
  if (!result.success || !confirmationUrl || !localSubscriptionId) {
    if (isDev) {
      console.log("[yookassaAppSubscriptionPurchase] start failed", {
        success: result.success,
        code: result.code,
        hasConfirmationUrl: Boolean(confirmationUrl),
        hasLocalSubscriptionId: Boolean(localSubscriptionId),
      });
    }
    // Transport errors/invalid success envelopes are not a negative payment receipt.
    const uncertain =
      result.success ||
      result.code === "NETWORK_ERROR" ||
      result.code === "REQUEST_TIMEOUT" ||
      result.code === "AUTH_REFRESH_UNAVAILABLE" ||
      (!result.code && !result.success);
    return {
      ok: false,
      message: uncertain
        ? "Результат создания платежа неизвестен. Проверьте подписку перед повтором."
        : (result.error ?? "Не удалось открыть ЮKassa."),
      code: result.code,
      ...(uncertain ? { uncertain: true } : {}),
    };
  }

  if (isDev) console.log("[yookassaAppSubscriptionPurchase] opening confirmation");
  let browserResult;
  try {
    browserResult = await WebBrowser.openBrowserAsync(confirmationUrl, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });
  } catch {
    return {
      ok: false,
      uncertain: true,
      message: "Результат платежа неизвестен. Проверьте подписку перед повтором.",
    };
  }
  if (!isCurrent()) {
    return {
      ok: false,
      uncertain: true,
      message: "Сессия изменилась во время оплаты. Проверьте исходную подписку.",
    };
  }
  if (isDev) {
    console.log("[yookassaAppSubscriptionPurchase] browser closed", {
      resultType: browserResult.type,
    });
  }
  if (browserResult.type === "cancel" || browserResult.type === "dismiss") {
    return {
      ok: false,
      message: "Операция в ЮKassa не завершена.",
      userCancelled: true,
    };
  }

  return { ok: true, localSubscriptionId };
}
