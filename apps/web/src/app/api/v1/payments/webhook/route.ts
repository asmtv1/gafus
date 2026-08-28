/**
 * API: POST /api/v1/payments/webhook — уведомления ЮKassa о статусе платежа
 */
import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import {
  confirmPaymentFromWebhook,
  cancelPaymentFromWebhook,
  refundPaymentFromWebhook,
  getUserIdByYookassaPaymentId,
} from "@gafus/core/services/payments";
import { handleYookassaAppSubscriptionWebhook } from "@gafus/core/services/appSubscription";
import { invalidateUserProgressCache } from "@shared/lib/actions/invalidateCoursesCache";
import { invalidateCoursesCache } from "@shared/server-actions/cache";

const YOOKASSA_IP_PREFIXES = [
  "185.71.76.",
  "185.71.77.",
  "77.75.153.",
  "77.75.156.11",
  "77.75.156.35",
  "77.75.154.",
  "2a02:5180:",
];

function isYooKassaIP(ip: string | null): boolean {
  if (!ip) return false;
  return YOOKASSA_IP_PREFIXES.some((prefix) => ip.startsWith(prefix));
}

function shouldSkipIpCheck(request: NextRequest): boolean {
  void request;
  const skipByEnv = process.env.YOOKASSA_SKIP_IP_CHECK === "1" || process.env.YOOKASSA_SKIP_IP_CHECK === "true";
  return skipByEnv && process.env.NODE_ENV !== "production";
}

/**
 * Проверка HMAC-SHA256 подписи от ЮKassa для защиты от подделки webhook
 */
function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secretKey: string,
): boolean {
  if (!signature) return false;
  const hash = createHmac("sha256", secretKey).update(body).digest("hex");
  const left = Buffer.from(hash, "hex");
  const right = Buffer.from(signature, "hex");
  return left.length === right.length && timingSafeEqual(new Uint8Array(left), new Uint8Array(right));
}

export async function POST(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? null;
  
  if (!shouldSkipIpCheck(request) && !isYooKassaIP(ip)) {
    console.warn("[payments/webhook] IP not in whitelist:", ip);
    return NextResponse.json({}, { status: 403 });
  }

  // Читаем тело как текст для проверки подписи
  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return NextResponse.json({}, { status: 400 });
  }

  // Подпись: при настройке через «Интеграция → HTTP-уведомления» ЮKassa может не присылать
  // X-Yookassa-Signature (заголовок часто только у webhook, созданных через API). Если подпись
  // есть — проверяем; если нет — полагаемся на проверку IP выше.
  const signature = request.headers.get("x-yookassa-signature")?.trim() ?? null;
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();
  if (signature) {
    if (!secretKey || !verifyWebhookSignature(bodyText, signature, secretKey)) {
      console.error("[payments/webhook] Invalid signature");
      return NextResponse.json({}, { status: 403 });
    }
  }

  // Парсим JSON после проверки подписи
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({}, { status: 400 });
  }

  const type = (body as { type?: string }).type;
  const event = (body as { event?: string }).event;
  const obj = (body as {
    object?: {
      id?: string;
      payment_id?: string;
      amount?: { value?: string };
      status?: string;
      saved?: boolean;
      card?: { last4?: string };
      title?: string;
      payment_method?: {
        id?: string;
        title?: string;
        card?: { last4?: string };
      };
      metadata?: Record<string, string | undefined>;
    };
  }).object;
  const refundId = event === "refund.succeeded" ? obj?.id : undefined;
  const yookassaPaymentId = event === "refund.succeeded" ? obj?.payment_id : obj?.id;
  const amount = obj?.amount?.value;
  const isPaymentMethodEvent = typeof event === "string" && event.startsWith("payment_method.");
  const paymentMethodId = isPaymentMethodEvent ? (obj?.id ?? null) : (obj?.payment_method?.id ?? null);
  const paymentMethodLast4 = isPaymentMethodEvent
    ? (obj?.card?.last4 ?? null)
    : (obj?.payment_method?.card?.last4 ?? null);
  const paymentMethodTitle = isPaymentMethodEvent
    ? (obj?.title ?? null)
    : (obj?.payment_method?.title ?? null);
  const metadata = obj?.metadata;
  const isAppSubscriptionWebhook =
    metadata?.kind === "app_subscription" ||
    metadata?.kind === "app_subscription_payment_method" ||
    isPaymentMethodEvent;

  if (type !== "notification" || !yookassaPaymentId) {
    return NextResponse.json({}, { status: 200 });
  }

  try {
    let userIdToInvalidate: string | null = null;
    if (isAppSubscriptionWebhook || event === "refund.succeeded") {
      const result = await handleYookassaAppSubscriptionWebhook({
        event: event ?? "unknown",
        yookassaPaymentId,
        yookassaRefundId: refundId,
        amount,
        paymentMethodId,
        paymentMethodLast4,
        paymentMethodTitle,
        metadata,
        payloadHash: createHash("sha256").update(bodyText).digest("hex"),
        shopId: process.env.YOOKASSA_SHOP_ID,
        secretKey: process.env.YOOKASSA_SECRET_KEY,
      });
      userIdToInvalidate = result.userId;
      // Refund objects do not reliably include payment metadata. The Premium
      // handler has already fetched and checked the canonical refund/payment;
      // only a verified non-Premium payment continues through the legacy path.
      if (event === "refund.succeeded" && !userIdToInvalidate) {
        await refundPaymentFromWebhook(yookassaPaymentId);
        userIdToInvalidate = await getUserIdByYookassaPaymentId(yookassaPaymentId);
      }
    } else {
      // Обработка разных событий платежа
      if (event === "payment.succeeded") {
        await confirmPaymentFromWebhook(yookassaPaymentId, amount);
      } else if (event === "payment.canceled") {
        await cancelPaymentFromWebhook(yookassaPaymentId);
      } else if (event === "refund.succeeded") {
        await refundPaymentFromWebhook(yookassaPaymentId);
      } else {
        // Неизвестное событие — игнорируем
        return NextResponse.json({}, { status: 200 });
      }
      userIdToInvalidate = await getUserIdByYookassaPaymentId(yookassaPaymentId);
    }

    if (userIdToInvalidate) {
      await Promise.all([
        invalidateUserProgressCache(userIdToInvalidate, false),
        invalidateCoursesCache(),
      ]);
    }
  } catch (err) {
    console.error("[payments/webhook] Error:", err);
    return NextResponse.json({}, { status: 500 });
  }

  return NextResponse.json({}, { status: 200 });
}
