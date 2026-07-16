import { appSubscriptionApi } from "../api/appSubscriptionApi";
import type { AppSubscriptionPlanCode } from "../api/appSubscriptionApi";
import { yookassaPaymentsNative } from "../native/yookassaPaymentsNative";

const isDev = typeof __DEV__ !== "undefined" && __DEV__;

export type YookassaAppSubscriptionPurchaseResult =
  | { ok: true; localSubscriptionId: string }
  | { ok: false; message: string; userCancelled?: boolean };

function nativeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Не удалось открыть нативную оплату ЮKassa.";
}

export async function yookassaAppSubscriptionPurchase(
  planCode: AppSubscriptionPlanCode,
): Promise<YookassaAppSubscriptionPurchaseResult> {
  if (isDev) console.log("[yookassaAppSubscriptionPurchase] native start", { planCode });

  const configResult = await appSubscriptionApi.getYookassaNativeConfig();
  const config = configResult.data;
  if (!configResult.success || !config) {
    return {
      ok: false,
      message: configResult.error ?? "Нативная оплата ЮKassa сейчас недоступна.",
    };
  }
  if (config.paymentMethod !== "SBP") {
    return { ok: false, message: "Разрешена только оплата через СБП." };
  }

  try {
    const tokenization = await yookassaPaymentsNative.tokenize({
      amount: config.amount,
      currency: config.currency,
      title: config.title,
      subtitle: config.subtitle,
      clientApplicationKey: config.clientApplicationKey,
      shopId: config.shopId,
    });
    if (tokenization.status === "cancelled") {
      return {
        ok: false,
        message: "Оплата отменена.",
        userCancelled: true,
      };
    }
    if (tokenization.paymentMethodType !== "SBP") {
      await yookassaPaymentsNative.close();
      return { ok: false, message: "Разрешена только оплата через СБП." };
    }

    const paymentResult = await appSubscriptionApi.completeYookassaNative({
      planCode,
      paymentToken: tokenization.paymentToken,
    });
    const payment = paymentResult.data;
    if (!paymentResult.success || !payment) {
      await yookassaPaymentsNative.close();
      return {
        ok: false,
        message: paymentResult.error ?? "ЮKassa не смогла создать платёж.",
      };
    }

    if (!payment.confirmationUrl) {
      await yookassaPaymentsNative.close();
      return { ok: true, localSubscriptionId: payment.localSubscriptionId };
    }

    const confirmation = await yookassaPaymentsNative.confirm({
      confirmationUrl: payment.confirmationUrl,
      clientApplicationKey: config.clientApplicationKey,
      shopId: config.shopId,
    });
    if (confirmation.status === "cancelled") {
      return {
        ok: false,
        message: "Подтверждение СБП закрыто. Проверяем статус платежа.",
        userCancelled: true,
      };
    }

    return { ok: true, localSubscriptionId: payment.localSubscriptionId };
  } catch (error) {
    await yookassaPaymentsNative.close().catch(() => undefined);
    if (isDev) {
      console.log("[yookassaAppSubscriptionPurchase] native error", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return { ok: false, message: nativeErrorMessage(error) };
  }
}
