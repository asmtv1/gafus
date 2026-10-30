import {
  ErrorCode,
  fetchProducts,
  finishTransaction,
  initConnection,
  requestPurchase,
} from "expo-iap";
import type { Purchase } from "expo-iap";

import { reportClientError } from "@/shared/lib/tracer";
import { appSubscriptionApi } from "../api/appSubscriptionApi";
import { getApplePurchaseReadiness } from "./applePurchaseReadiness";

export type AppleAppSubscriptionPurchaseResult =
  | { ok: true }
  | { ok: false; message: string; userCancelled?: boolean; uncertain?: boolean };

function isPurchaseUserCancelled(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === ErrorCode.UserCancelled
  );
}

export async function runAppleAppSubscriptionPurchase(
  appleProductId?: string | null,
  options?: { appAccountToken?: string | null; isCurrentAccount?: () => boolean },
): Promise<AppleAppSubscriptionPurchaseResult> {
  const isCurrent = () => {
    try {
      return options?.isCurrentAccount?.() ?? true;
    } catch {
      return false;
    }
  };
  const readiness = getApplePurchaseReadiness(
    appleProductId,
    options?.appAccountToken,
    isCurrent(),
  );
  if (!readiness.ready) {
    return {
      ok: false,
      message:
        readiness.reason === "TOKEN_INITIALIZATION_REQUIRED"
          ? "Apple-покупка пока недоступна: требуется подтверждение аккаунта на сервере."
          : "Подписка через App Store временно недоступна.",
    };
  }

  try {
    await initConnection();
    await fetchProducts({ skus: [readiness.productId], type: "subs" });
    if (!isCurrent()) {
      return { ok: false, message: "Сессия изменилась. Откройте подписку заново." };
    }

    let purchase: Purchase | null = null;
    try {
      const raw = await requestPurchase({
        request: {
          apple: {
            sku: readiness.productId,
            appAccountToken: readiness.stableToken,
          },
        },
        type: "subs",
      });
      purchase = Array.isArray(raw) ? (raw[0] ?? null) : raw;
    } catch (error) {
      if (isPurchaseUserCancelled(error)) {
        return { ok: false, message: "", userCancelled: true };
      }
      // Provider messages may contain signed receipts or account identifiers.
      reportClientError(new Error("APPLE_REQUEST_PURCHASE_UNCERTAIN"), {
        issueKey: "AppleAppSubscription",
        keys: { phase: "request_purchase" },
      });
      return {
        ok: false,
        uncertain: true,
        message:
          "Результат покупки неизвестен. Проверьте подписку позднее, не повторяйте оплату автоматически.",
      };
    }

    if (!isCurrent()) {
      return {
        ok: false,
        uncertain: true,
        message: "Аккаунт изменился во время покупки. Проверьте статус исходной подписки.",
      };
    }
    const jws = purchase?.purchaseToken?.trim();
    if (!purchase || !jws) {
      return {
        ok: false,
        uncertain: true,
        message: "Результат покупки не подтверждён. Проверьте подписку позднее.",
      };
    }

    const verify = await appSubscriptionApi.verifyAppleSubscription({ signedTransactionInfo: jws });
    if (!isCurrent()) {
      return {
        ok: false,
        uncertain: true,
        message: "Аккаунт изменился во время проверки покупки. Проверьте исходную подписку.",
      };
    }
    if (!verify.success) {
      return {
        ok: false,
        uncertain: true,
        message:
          "Проверка покупки временно недоступна. Не оформляйте повторную оплату до проверки статуса.",
      };
    }
    if (verify.data?.success !== true) {
      const serviceError =
        verify.data && "error" in verify.data && typeof verify.data.error === "string"
          ? verify.data.error
          : null;
      return {
        ok: false,
        message: serviceError ?? verify.error ?? "Не удалось подтвердить подписку.",
      };
    }

    try {
      await finishTransaction({ purchase, isConsumable: false });
    } catch {
      reportClientError(new Error("APPLE_FINISH_TRANSACTION_FAILED"), {
        issueKey: "AppleAppSubscription",
        keys: { phase: "finish_transaction" },
      });
    }

    return { ok: true };
  } catch {
    reportClientError(new Error("APPLE_CONNECTION_FAILED"), {
      issueKey: "AppleAppSubscription",
      keys: { phase: "subscription_purchase_flow" },
    });
    return { ok: false, message: "Не удалось связаться с App Store. Попробуйте позже." };
  }
}

export async function appleAppSubscriptionPurchase(params: { signedTransactionInfo: string }) {
  const verify = await appSubscriptionApi.verifyAppleSubscription({
    signedTransactionInfo: params.signedTransactionInfo,
  });
  return verify.success && verify.data?.success === true;
}
