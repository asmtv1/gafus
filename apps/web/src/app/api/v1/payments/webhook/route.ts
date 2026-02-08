/**
 * API: POST /api/v1/payments/webhook — уведомления ЮKassa о статусе платежа
 */
import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@gafus/prisma";
import {
  confirmPaymentFromWebhook,
  cancelPaymentFromWebhook,
  refundPaymentFromWebhook,
} from "@gafus/core/services/payments";
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
  return hash === signature;
}

export async function POST(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? null;
  
  if (!isYooKassaIP(ip)) {
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
  const obj = (body as { object?: { id?: string; amount?: { value?: string } } }).object;
  const yookassaPaymentId = obj?.id;
  const amount = obj?.amount?.value;

  if (type !== "notification" || !yookassaPaymentId) {
    return NextResponse.json({}, { status: 200 });
  }

  // Ответ 200 сразу; тяжёлую обработку — после (fire-and-forget)
  setImmediate(() => {
    let promise: Promise<void> | undefined;

    // Обработка разных событий платежа
    if (event === "payment.succeeded") {
      promise = confirmPaymentFromWebhook(yookassaPaymentId, amount);
    } else if (event === "payment.canceled") {
      promise = cancelPaymentFromWebhook(yookassaPaymentId);
    } else if (event === "refund.succeeded") {
      promise = refundPaymentFromWebhook(yookassaPaymentId);
    } else {
      // Неизвестное событие — игнорируем
      return;
    }

    promise
      .then(() =>
        prisma.payment
          .findFirst({
            where: { yookassaPaymentId },
            select: { userId: true },
          })
          .then((p) => {
            if (p?.userId) {
              return Promise.all([
                invalidateUserProgressCache(p.userId),
                invalidateCoursesCache(),
              ]);
            }
          }),
      )
      .catch((err) => {
        console.error("[payments/webhook] Error:", err);
      });
  });

  return NextResponse.json({}, { status: 200 });
}
