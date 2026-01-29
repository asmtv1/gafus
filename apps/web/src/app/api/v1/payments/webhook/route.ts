/**
 * API: POST /api/v1/payments/webhook — уведомления ЮKassa о статусе платежа
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@gafus/prisma";
import { confirmPaymentFromWebhook } from "@gafus/core/services/payments";
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

export async function POST(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? null;
  if (!isYooKassaIP(ip)) {
    return NextResponse.json({}, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({}, { status: 400 });
  }

  const type = (body as { type?: string }).type;
  const event = (body as { event?: string }).event;
  const obj = (body as { object?: { id?: string } }).object;
  const yookassaPaymentId = obj?.id;

  if (type !== "notification" || event !== "payment.succeeded" || !yookassaPaymentId) {
    return NextResponse.json({}, { status: 200 });
  }

  // Ответ 200 сразу; тяжёлую обработку — после (fire-and-forget)
  setImmediate(() => {
    confirmPaymentFromWebhook(yookassaPaymentId)
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
