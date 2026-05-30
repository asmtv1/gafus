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

export type AppleAppSubscriptionPurchaseResult =
  | { ok: true }
  | { ok: false; message: string; userCancelled?: boolean };

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
  options?: { appAccountToken?: string | null },
): Promise<AppleAppSubscriptionPurchaseResult> {
  if (!appleProductId) {
    return {
      ok: false,
      message: "Подписка через App Store временно недоступна.",
    };
  }

  try {
    await initConnection();
    await fetchProducts({ skus: [appleProductId], type: "subs" });

    let purchase: Purchase | null = null;
    try {
      const raw = await requestPurchase({
        request: {
          apple: {
            sku: appleProductId,
            ...(options?.appAccountToken ? { appAccountToken: options.appAccountToken } : {}),
          },
        },
        type: "subs",
      });
      purchase = Array.isArray(raw) ? (raw[0] ?? null) : raw;
    } catch (error) {
      if (isPurchaseUserCancelled(error)) {
        return { ok: false, message: "", userCancelled: true };
      }
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "AppleAppSubscription",
        keys: { phase: "request_purchase" },
      });
      return { ok: false, message: "Не удалось оформить подписку. Попробуйте позже." };
    }

    const jws = purchase?.purchaseToken?.trim();
    if (!purchase || !jws) {
      return { ok: false, message: "Не удалось получить подтверждение покупки от App Store." };
    }

    const verify = await appSubscriptionApi.verifyAppleSubscription({ signedTransactionInfo: jws });
    if (!verify.success || verify.data?.success !== true) {
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
    } catch (finishError) {
      reportClientError(
        finishError instanceof Error ? finishError : new Error(String(finishError)),
        {
          issueKey: "AppleAppSubscription",
          keys: { phase: "finish_transaction" },
        },
      );
    }

    return { ok: true };
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
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
