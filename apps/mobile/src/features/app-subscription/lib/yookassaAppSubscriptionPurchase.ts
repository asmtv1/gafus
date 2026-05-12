import * as WebBrowser from "expo-web-browser";

import { appSubscriptionApi } from "../api/appSubscriptionApi";

export type YookassaAppSubscriptionPurchaseResult =
  | { ok: true; localPaymentId: string }
  | { ok: false; message: string };

export async function yookassaAppSubscriptionPurchase(): Promise<
  YookassaAppSubscriptionPurchaseResult
> {
  const result = await appSubscriptionApi.startYookassa();
  const confirmationUrl = result.data?.confirmationUrl;
  const localPaymentId = result.data?.localPaymentId;
  if (!result.success || !confirmationUrl || !localPaymentId) {
    return { ok: false, message: result.error ?? "Не удалось начать оплату." };
  }

  await WebBrowser.openBrowserAsync(confirmationUrl, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
  });

  return { ok: true, localPaymentId };
}
