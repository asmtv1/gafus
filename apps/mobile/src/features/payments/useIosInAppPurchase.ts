import { useCallback, useState } from "react";
import { Platform } from "react-native";
import {
  ErrorCode,
  getAvailablePurchases,
  restorePurchases,
  useIAP,
  type Purchase,
} from "expo-iap";

import { paymentsApi } from "@/shared/lib/api/payments";
import { reportClientError } from "@/shared/lib/tracer";

export interface IosIapPurchaseResult {
  success: boolean;
  /** Пользователь закрыл оплату без покупки */
  cancelled?: boolean;
  /** Сообщение для Snackbar при ошибке */
  message?: string;
}

/**
 * Покупка non-consumable на iOS: StoreKit → JWS в purchaseToken → verify на API.
 * На Android не используется (возврат { success: false }).
 */
export function useIosInAppPurchase() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { connected, fetchProducts, requestPurchase, finishTransaction } = useIAP({
    onPurchaseError: (purchaseError) => {
      if (purchaseError.code === ErrorCode.UserCancelled) {
        return;
      }
      reportClientError(
        new Error(purchaseError.message || "IAP error"),
        { issueKey: "iap-purchase", keys: { code: String(purchaseError.code) } },
      );
    },
  });

  const verifyAndFinish = useCallback(
    async (purchase: Purchase, options?: { silent?: boolean }): Promise<IosIapPurchaseResult> => {
      const jws = purchase.purchaseToken;
      if (!jws) {
        const m = "Нет подписи транзакции (JWS). Обновите приложение.";
        if (!options?.silent) {
          setError(m);
        }
        return { success: false, message: m };
      }
      const verify = await paymentsApi.verifyApplePurchase(jws);
      if (!verify.success) {
        const msg = verify.error ?? "Не удалось подтвердить покупку";
        if (!options?.silent) {
          setError(msg);
        }
        reportClientError(new Error(verify.error ?? "verify failed"), {
          issueKey: "iap-purchase",
          keys: { code: verify.code ?? "" },
        });
        return { success: false, message: msg };
      }
      try {
        await finishTransaction({ purchase, isConsumable: false });
      } catch (finishErr) {
        reportClientError(finishErr, { issueKey: "iap-purchase", keys: { phase: "finishTransaction" } });
      }
      return { success: true as const };
    },
    [finishTransaction],
  );

  const purchaseProduct = useCallback(
    async (productId: string): Promise<IosIapPurchaseResult> => {
      if (Platform.OS !== "ios") {
        return { success: false };
      }
      setError(null);
      setIsLoading(true);
      try {
        if (!connected) {
          const m = "Магазин приложений недоступен. Повторите позже.";
          setError(m);
          return { success: false, message: m };
        }
        await fetchProducts({ skus: [productId], type: "in-app" });
        const raw = await requestPurchase({
          type: "in-app",
          request: { apple: { sku: productId } },
        });
        const purchase = Array.isArray(raw) ? raw[0] : raw;
        if (!purchase) {
          const m = "Покупка не завершена";
          setError(m);
          return { success: false, message: m };
        }
        return verifyAndFinish(purchase);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.toLowerCase().includes("cancel") || msg.includes("user-cancelled")) {
          return { success: false, cancelled: true };
        }
        reportClientError(e, { issueKey: "iap-purchase" });
        const m = "Не удалось оформить покупку";
        setError(m);
        return { success: false, message: m };
      } finally {
        setIsLoading(false);
      }
    },
    [connected, fetchProducts, requestPurchase, verifyAndFinish],
  );

  /** Восстановление: каждая транзакция уходит на сервер (идемпотентность). */
  const restoreAndVerifyAll = useCallback(async (): Promise<IosIapPurchaseResult> => {
    if (Platform.OS !== "ios") {
      return { success: false };
    }
    setError(null);
    setIsLoading(true);
    try {
      await restorePurchases();
      const purchases = await getAvailablePurchases();
      let anySuccess = false;
      for (const purchase of purchases) {
        const r = await verifyAndFinish(purchase, { silent: true });
        if (r.success) {
          anySuccess = true;
        }
      }
      return { success: anySuccess || purchases.length === 0 };
    } catch (e) {
      reportClientError(e, { issueKey: "iap-purchase", keys: { phase: "restore" } });
      setError("Не удалось восстановить покупки");
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  }, [verifyAndFinish]);

  return {
    purchaseProduct,
    restoreAndVerifyAll,
    isLoading,
    error,
    setError,
    connected,
  };
}
