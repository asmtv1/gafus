import * as WebBrowser from "expo-web-browser";

import { appSubscriptionApi } from "../api/appSubscriptionApi";

export type YookassaAppSubscriptionPurchaseResult =
  | { ok: true; localSubscriptionId: string }
  | { ok: false; message: string };

export async function yookassaAppSubscriptionPurchase(): Promise<
  YookassaAppSubscriptionPurchaseResult
> {
  const result = await appSubscriptionApi.startYookassa();
  const confirmationUrl = result.data?.confirmationUrl;
  const localSubscriptionId = result.data?.localSubscriptionId;
  if (!result.success || !confirmationUrl || !localSubscriptionId) {
    return { ok: false, message: result.error ?? "Не удалось начать привязку карты." };
  }

  await WebBrowser.openBrowserAsync(confirmationUrl, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
  });

  return { ok: true, localSubscriptionId };
}
