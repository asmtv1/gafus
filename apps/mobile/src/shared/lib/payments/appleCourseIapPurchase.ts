import {
  ErrorCode,
  fetchProducts,
  finishTransaction,
  initConnection,
  requestPurchase,
} from "expo-iap";
import type { Purchase } from "expo-iap";

import { paymentsApi } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/tracer";

export type AppleCourseIapPurchaseResult =
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

/**
 * Полный цикл покупки платного курса через App Store (только iOS).
 * Передайте ровно одно: courseId или courseType — как в GET course-metadata.
 */
export async function runAppleCourseIapPurchase(params: {
  courseId?: string;
  courseType?: string;
}): Promise<AppleCourseIapPurchaseResult> {
  const hasId = Boolean(params.courseId);
  const hasType = Boolean(params.courseType);
  if (hasId === hasType) {
    return {
      ok: false,
      message: "Не указан курс для оплаты. Обновите экран.",
    };
  }

  try {
    await initConnection();
    const meta = await paymentsApi.getAppleCourseIapMetadata(
      params.courseId
        ? { courseId: params.courseId }
        : { courseType: params.courseType! },
    );
    if (!meta.success || !meta.data) {
      return {
        ok: false,
        message: meta.error ?? "Не удалось загрузить данные для оплаты",
      };
    }
    const sku = meta.data.appleIapProductId;
    if (!sku) {
      return {
        ok: false,
        message: "Покупка через App Store временно недоступна для этого курса",
      };
    }

    await fetchProducts({ skus: [sku], type: "in-app" });
    let purchase: Purchase | null = null;
    try {
      const raw = await requestPurchase({
        request: { apple: { sku } },
        type: "in-app",
      });
      purchase = Array.isArray(raw) ? (raw[0] ?? null) : raw;
    } catch (error) {
      if (isPurchaseUserCancelled(error)) {
        return { ok: false, message: "", userCancelled: true };
      }
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "AppleIAP",
        keys: { phase: "request_purchase" },
      });
      return {
        ok: false,
        message: "Не удалось оформить покупку. Попробуйте позже.",
      };
    }

    const jws = purchase?.purchaseToken?.trim();
    if (!purchase || !jws) {
      return {
        ok: false,
        message: "Не удалось получить данные покупки от App Store",
      };
    }

    const verify = await paymentsApi.verifyAppleCoursePurchase({ signedTransactionInfo: jws });
    if (!verify.success || !verify.data?.courseId) {
      return {
        ok: false,
        message: verify.error ?? "Не удалось подтвердить покупку",
      };
    }

    try {
      await finishTransaction({ purchase, isConsumable: false });
    } catch (finishErr) {
      reportClientError(finishErr instanceof Error ? finishErr : new Error(String(finishErr)), {
        issueKey: "AppleIAP",
        keys: { phase: "finish_transaction" },
      });
    }

    return { ok: true };
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "AppleIAP",
      keys: { phase: "ios_purchase_flow" },
    });
    return {
      ok: false,
      message: "Не удалось связаться с App Store. Попробуйте позже.",
    };
  }
}
