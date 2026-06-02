import * as WebBrowser from "expo-web-browser";

import { appSubscriptionApi } from "../api/appSubscriptionApi";

const isDev = typeof __DEV__ !== "undefined" && __DEV__;

export type YookassaAppSubscriptionPurchaseResult =
  | { ok: true; localSubscriptionId: string }
  | { ok: false; message: string; userCancelled?: boolean };

export async function yookassaAppSubscriptionPurchase(): Promise<
  YookassaAppSubscriptionPurchaseResult
> {
  if (isDev) console.log("[yookassaAppSubscriptionPurchase] start");
  const result = await appSubscriptionApi.startYookassa();
  const confirmationUrl = result.data?.confirmationUrl;
  const localSubscriptionId = result.data?.localSubscriptionId;
  if (!result.success || !confirmationUrl || !localSubscriptionId) {
    if (isDev) {
      console.log("[yookassaAppSubscriptionPurchase] start failed", {
        success: result.success,
        error: result.error,
        code: result.code,
        hasConfirmationUrl: Boolean(confirmationUrl),
        localSubscriptionId: localSubscriptionId ?? null,
      });
    }
    return { ok: false, message: result.error ?? "Не удалось начать привязку карты." };
  }

  if (isDev) {
    console.log("[yookassaAppSubscriptionPurchase] opening confirmation", {
      localSubscriptionId,
      confirmationUrl,
    });
  }
  const browserResult = await WebBrowser.openBrowserAsync(confirmationUrl, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
  });
  if (isDev) {
    console.log("[yookassaAppSubscriptionPurchase] browser closed", {
      localSubscriptionId,
      browserResult,
    });
  }
  if (browserResult.type === "cancel" || browserResult.type === "dismiss") {
    return {
      ok: false,
      message: "Привязка карты не завершена.",
      userCancelled: true,
    };
  }

  return { ok: true, localSubscriptionId };
}
