/**
 * Сервис платежей ЮKassa для платных курсов
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("payment-service");

const YOOKASSA_API = "https://api.yookassa.ru/v3/payments";

export interface CreatePaymentParams {
  userId: string;
  courseId: string;
  origin: string;
  shopId: string;
  secretKey: string;
}

export interface CreatePaymentResult {
  paymentId: string;
  confirmationUrl: string;
}

function isPrismaUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2002"
  );
}

/**
 * Создаёт платёж: проверяет курс и доступ, при необходимости создаёт запись Payment и платёж в ЮKassa.
 * При ошибке уникального индекса (23505/P2002) возвращает существующий PENDING.
 */
export async function createPayment(params: CreatePaymentParams): Promise<{
  success: true;
  paymentId: string;
  confirmationUrl: string;
} | { success: false; error: string }> {
  const { userId, courseId, origin, shopId, secretKey } = params;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, type: true, isPaid: true, priceRub: true },
  });
  if (!course) return { success: false, error: "Курс не найден" };
  if (!course.isPaid) return { success: false, error: "Курс не является платным" };
  const amountRub = course.priceRub != null ? Number(course.priceRub) : null;
  if (amountRub == null || amountRub < 0.01) return { success: false, error: "У курса не указана цена" };

  const existingAccess = await prisma.courseAccess.findUnique({
    where: { courseId_userId: { courseId, userId } },
  });
  if (existingAccess) return { success: false, error: "Доступ к курсу уже есть" };

  const existingPending = await prisma.payment.findFirst({
    where: { userId, courseId, status: "PENDING" },
    select: { id: true, confirmationUrl: true },
  });
  if (existingPending?.confirmationUrl) {
    return {
      success: true,
      paymentId: existingPending.id,
      confirmationUrl: existingPending.confirmationUrl,
    };
  }

  let paymentId: string;
  try {
    const payment = await prisma.payment.create({
      data: {
        userId,
        courseId,
        amountRub,
        currency: "RUB",
        status: "PENDING",
      },
      select: { id: true },
    });
    paymentId = payment.id;
  } catch (e) {
    if (isPrismaUniqueViolation(e)) {
      const again = await prisma.payment.findFirst({
        where: { userId, courseId, status: "PENDING" },
        select: { id: true, confirmationUrl: true },
      });
      if (again?.confirmationUrl) {
        return {
          success: true,
          paymentId: again.id,
          confirmationUrl: again.confirmationUrl,
        };
      }
    }
    logger.error("Ошибка создания Payment", e as Error);
    return { success: false, error: "Не удалось создать платёж" };
  }

  const returnUrl = `${origin.replace(/\/$/, "")}/trainings/${course.type}?paid=1`;
  const body = {
    amount: { value: amountRub.toFixed(2), currency: "RUB" },
    confirmation: { type: "redirect" as const, return_url: returnUrl },
    description: `Оплата курса`,
  };

  const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(YOOKASSA_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        "Idempotence-Key": paymentId,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    logger.error("Ошибка запроса к ЮKassa", e as Error);
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "CANCELED" },
    }).catch(() => {});
    return { success: false, error: "Ошибка соединения с платёжной системой" };
  }

  if (!res.ok) {
    const text = await res.text();
    logger.error("ЮKassa вернула ошибку", new Error(`${res.status}: ${text}`));
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "CANCELED" },
    }).catch(() => {});
    return { success: false, error: "Платёжная система отклонила запрос" };
  }

  const data = (await res.json()) as {
    id?: string;
    confirmation?: { confirmation_url?: string };
  };
  const yookassaPaymentId = data.id ?? null;
  const confirmationUrl = data.confirmation?.confirmation_url ?? null;

  if (!yookassaPaymentId || !confirmationUrl) {
    logger.error("В ответе ЮKassa нет id или confirmation_url", new Error(JSON.stringify(data)));
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "CANCELED" },
    }).catch(() => {});
    return { success: false, error: "Неверный ответ платёжной системы" };
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: { yookassaPaymentId, confirmationUrl },
  });

  return {
    success: true,
    paymentId,
    confirmationUrl,
  };
}

/**
 * Обработка webhook payment.succeeded: выдача доступа и обновление статуса платежа (идемпотентно).
 */
export async function confirmPaymentFromWebhook(yookassaPaymentId: string): Promise<void> {
  const payment = await prisma.payment.findFirst({
    where: { yookassaPaymentId, status: "PENDING" },
    select: { id: true, userId: true, courseId: true },
  });
  if (!payment) return;

  await prisma.$transaction(async (tx) => {
    await tx.courseAccess.upsert({
      where: { courseId_userId: { courseId: payment.courseId, userId: payment.userId } },
      create: { courseId: payment.courseId, userId: payment.userId },
      update: {},
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "SUCCEEDED" },
    });
  });
  logger.info("Платёж подтверждён, доступ выдан", {
    paymentId: payment.id,
    userId: payment.userId,
    courseId: payment.courseId,
  });
}
