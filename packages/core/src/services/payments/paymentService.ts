/**
 * Сервис платежей ЮKassa для платных курсов
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import { recordOfertaAcceptance } from "../oferta/ofertaAcceptanceService";

const logger = createWebLogger("payment-service");

const YOOKASSA_API = "https://api.yookassa.ru/v3/payments";
const MAX_AMOUNT_RUB = 100000; // Максимальная сумма платежа: 100 000 рублей

/** Повторно отдаём ту же confirmation_url только пока сессия чекаута ЮMoney обычно жива. Иначе — новый POST в ЮKassa. */
const PENDING_CHECKOUT_TTL_MS = 20 * 60 * 1000;

function isPendingCheckoutFresh(updatedAt: Date): boolean {
  return Date.now() - updatedAt.getTime() < PENDING_CHECKOUT_TTL_MS;
}

export interface CreateArticlePaymentParams {
  userId: string;
  articleId: string;
  origin?: string;
  returnUrl?: string;
  shopId: string;
  secretKey: string;
}

export interface CreatePaymentParams {
  userId: string;
  courseId: string;
  origin?: string;
  returnUrl?: string;
  shopId: string;
  secretKey: string;
  acceptanceContext?: {
    ipAddress?: string | null;
    userAgent?: string | null;
    source: "web" | "mobile";
  };
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
  const { userId, courseId, origin, returnUrl, shopId, secretKey } = params;

  if (!origin && !returnUrl) {
    return { success: false, error: "Не указан returnUrl или origin" };
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, type: true, isPaid: true, priceRub: true },
  });
  if (!course) return { success: false, error: "Курс не найден" };
  if (!course.isPaid) return { success: false, error: "Курс не является платным" };
  const amountRub = course.priceRub != null ? Number(course.priceRub) : null;
  if (amountRub == null || amountRub < 0.01) return { success: false, error: "У курса не указана цена" };
  if (amountRub > MAX_AMOUNT_RUB) return { success: false, error: "Некорректная цена курса" };

  const existingAccess = await prisma.courseAccess.findUnique({
    where: { courseId_userId: { courseId, userId } },
  });
  if (existingAccess) return { success: false, error: "Доступ к курсу уже есть" };

  const existingPending = await prisma.payment.findFirst({
    where: { userId, courseId, status: "PENDING" },
    select: { id: true, confirmationUrl: true, updatedAt: true },
  });
  if (existingPending?.confirmationUrl) {
    if (isPendingCheckoutFresh(existingPending.updatedAt)) {
      return {
        success: true,
        paymentId: existingPending.id,
        confirmationUrl: existingPending.confirmationUrl,
      };
    }
    await prisma.payment
      .update({
        where: { id: existingPending.id },
        data: { status: "CANCELED" },
      })
      .catch(() => undefined);
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
        select: { id: true, confirmationUrl: true, updatedAt: true },
      });
      if (again?.confirmationUrl && isPendingCheckoutFresh(again.updatedAt)) {
        return {
          success: true,
          paymentId: again.id,
          confirmationUrl: again.confirmationUrl,
        };
      }
      if (again?.id && again.confirmationUrl && !isPendingCheckoutFresh(again.updatedAt)) {
        await prisma.payment
          .update({
            where: { id: again.id },
            data: { status: "CANCELED" },
          })
          .catch(() => undefined);
      }
    }
    logger.error("Ошибка создания Payment", e as Error);
    return { success: false, error: "Не удалось создать платёж" };
  }

  let finalReturnUrl: string;
  if (returnUrl) {
    try {
      const parsed = new URL(returnUrl);
      if (parsed.protocol !== "https:") {
        return { success: false, error: "returnUrl должен использовать HTTPS" };
      }
      finalReturnUrl = parsed.toString();
    } catch {
      return { success: false, error: "Некорректный returnUrl" };
    }
  } else {
    finalReturnUrl = `${origin!.replace(/\/$/, "")}/trainings/${course.type}?paid=1`;
  }

  const body = {
    amount: { value: amountRub.toFixed(2), currency: "RUB" },
    capture: true, // списание сразу при оплате, без ручного подтверждения в ЛК
    confirmation: { type: "redirect" as const, return_url: finalReturnUrl },
    description: "Оплата курса",
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
    }).catch(() => undefined);
    return { success: false, error: "Ошибка соединения с платёжной системой" };
  }

  if (!res.ok) {
    const text = await res.text();
    logger.error("ЮKassa вернула ошибку", new Error(`${res.status}: ${text}`));
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "CANCELED" },
    }).catch(() => undefined);
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
    }).catch(() => undefined);
    return { success: false, error: "Неверный ответ платёжной системы" };
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: { yookassaPaymentId, confirmationUrl },
  });

  if (params.acceptanceContext) {
    recordOfertaAcceptance({
      userId,
      courseId,
      paymentId,
      ipAddress: params.acceptanceContext.ipAddress,
      userAgent: params.acceptanceContext.userAgent,
      source: params.acceptanceContext.source,
    }).catch((err: unknown) => {
      logger.error("Ошибка записи согласия с офертой", err as Error, { paymentId });
    });
  }

  return {
    success: true,
    paymentId,
    confirmationUrl,
  };
}

/**
 * Создаёт платёж за статью: проверяет статью и доступ, создаёт ArticlePayment и платёж в ЮKassa.
 */
export async function createArticlePayment(params: CreateArticlePaymentParams): Promise<{
  success: true;
  paymentId: string;
  confirmationUrl: string;
} | { success: false; error: string }> {
  const { userId, articleId, origin, returnUrl, shopId, secretKey } = params;

  if (!origin && !returnUrl) {
    return { success: false, error: "Не указан returnUrl или origin" };
  }

  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { id: true, slug: true, visibility: true, priceRub: true },
  });
  if (!article) return { success: false, error: "Статья не найдена" };
  if (article.visibility !== "PAID") return { success: false, error: "Статья не является платной" };
  const amountRub = article.priceRub != null ? Number(article.priceRub) : null;
  if (amountRub == null || amountRub < 0.01) return { success: false, error: "У статьи не указана цена" };
  if (amountRub > MAX_AMOUNT_RUB) return { success: false, error: "Некорректная цена статьи" };

  const existingAccess = await prisma.articleAccess.findUnique({
    where: { articleId_userId: { articleId, userId } },
  });
  if (existingAccess) return { success: false, error: "Доступ к статье уже есть" };

  const existingPending = await prisma.articlePayment.findFirst({
    where: { userId, articleId, status: "PENDING" },
    select: { id: true, confirmationUrl: true, updatedAt: true },
  });
  if (existingPending?.confirmationUrl) {
    if (isPendingCheckoutFresh(existingPending.updatedAt)) {
      return {
        success: true,
        paymentId: existingPending.id,
        confirmationUrl: existingPending.confirmationUrl,
      };
    }
    await prisma.articlePayment
      .update({
        where: { id: existingPending.id },
        data: { status: "CANCELED" },
      })
      .catch(() => undefined);
  }

  let paymentId: string;
  try {
    const payment = await prisma.articlePayment.create({
      data: {
        userId,
        articleId,
        amountRub,
        currency: "RUB",
        status: "PENDING",
      },
      select: { id: true },
    });
    paymentId = payment.id;
  } catch (e) {
    if (isPrismaUniqueViolation(e)) {
      const again = await prisma.articlePayment.findFirst({
        where: { userId, articleId, status: "PENDING" },
        select: { id: true, confirmationUrl: true, updatedAt: true },
      });
      if (again?.confirmationUrl && isPendingCheckoutFresh(again.updatedAt)) {
        return {
          success: true,
          paymentId: again.id,
          confirmationUrl: again.confirmationUrl,
        };
      }
      if (again?.id && again.confirmationUrl && !isPendingCheckoutFresh(again.updatedAt)) {
        await prisma.articlePayment
          .update({
            where: { id: again.id },
            data: { status: "CANCELED" },
          })
          .catch(() => undefined);
      }
    }
    logger.error("Ошибка создания ArticlePayment", e as Error);
    return { success: false, error: "Не удалось создать платёж" };
  }

  let finalReturnUrl: string;
  if (returnUrl) {
    try {
      const parsed = new URL(returnUrl);
      if (parsed.protocol !== "https:") {
        return { success: false, error: "returnUrl должен использовать HTTPS" };
      }
      finalReturnUrl = parsed.toString();
    } catch {
      return { success: false, error: "Некорректный returnUrl" };
    }
  } else {
    finalReturnUrl = `${origin!.replace(/\/$/, "")}/articles/${article.slug}?paid=1`;
  }

  const body = {
    amount: { value: amountRub.toFixed(2), currency: "RUB" },
    capture: true,
    confirmation: { type: "redirect" as const, return_url: finalReturnUrl },
    description: "Оплата статьи",
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
    logger.error("Ошибка запроса к ЮKassa (article)", e as Error);
    await prisma.articlePayment.update({
      where: { id: paymentId },
      data: { status: "CANCELED" },
    }).catch(() => undefined);
    return { success: false, error: "Ошибка соединения с платёжной системой" };
  }

  if (!res.ok) {
    const text = await res.text();
    logger.error("ЮKassa вернула ошибку (article)", new Error(`${res.status}: ${text}`));
    await prisma.articlePayment.update({
      where: { id: paymentId },
      data: { status: "CANCELED" },
    }).catch(() => undefined);
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
    await prisma.articlePayment.update({
      where: { id: paymentId },
      data: { status: "CANCELED" },
    }).catch(() => undefined);
    return { success: false, error: "Неверный ответ платёжной системы" };
  }

  await prisma.articlePayment.update({
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
 * Получает userId по yookassaPaymentId (для инвалидации кэша после webhook).
 */
export async function getUserIdByYookassaPaymentId(
  yookassaPaymentId: string,
): Promise<string | null> {
  const payment = await prisma.payment.findFirst({
    where: { yookassaPaymentId },
    select: { userId: true },
  });
  if (payment) return payment.userId;
  const articlePayment = await prisma.articlePayment.findFirst({
    where: { yookassaPaymentId },
    select: { userId: true },
  });
  return articlePayment?.userId ?? null;
}

/**
 * Обработка webhook payment.succeeded: выдача доступа и обновление статуса платежа (идемпотентно).
 */
export async function confirmPaymentFromWebhook(
  yookassaPaymentId: string,
  amountFromYookassa?: string,
): Promise<void> {
  const payment = await prisma.payment.findFirst({
    where: { yookassaPaymentId, status: "PENDING" },
    select: { id: true, userId: true, courseId: true, amountRub: true },
  });

  if (payment) {
    if (amountFromYookassa) {
      const expectedAmount = Number(payment.amountRub);
      const actualAmount = parseFloat(amountFromYookassa);
      if (Math.abs(expectedAmount - actualAmount) > 0.01) {
        logger.error("Сумма платежа не совпадает", new Error("Amount mismatch"), {
          paymentId: payment.id,
          expected: expectedAmount,
          actual: actualAmount,
        });
        return;
      }
    }
    try {
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
    } catch (error) {
      logger.error("Ошибка транзакции", error as Error, {
        paymentId: payment.id,
        userId: payment.userId,
        courseId: payment.courseId,
      });
      throw error;
    }
    return;
  }

  const articlePayment = await prisma.articlePayment.findFirst({
    where: { yookassaPaymentId, status: "PENDING" },
    select: { id: true, userId: true, articleId: true, amountRub: true },
  });
  if (!articlePayment) return;

  if (amountFromYookassa) {
    const expectedAmount = Number(articlePayment.amountRub);
    const actualAmount = parseFloat(amountFromYookassa);
    if (Math.abs(expectedAmount - actualAmount) > 0.01) {
      logger.error("Сумма платежа статьи не совпадает", new Error("Amount mismatch"), {
        paymentId: articlePayment.id,
        expected: expectedAmount,
        actual: actualAmount,
      });
      return;
    }
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.articleAccess.upsert({
        where: { articleId_userId: { articleId: articlePayment.articleId, userId: articlePayment.userId } },
        create: { articleId: articlePayment.articleId, userId: articlePayment.userId },
        update: {},
      });
      await tx.articlePayment.update({
        where: { id: articlePayment.id },
        data: { status: "SUCCEEDED" },
      });
    });
    logger.info("Платёж статьи подтверждён, доступ выдан", {
      paymentId: articlePayment.id,
      userId: articlePayment.userId,
      articleId: articlePayment.articleId,
    });
  } catch (error) {
    logger.error("Ошибка транзакции (article)", error as Error, {
      paymentId: articlePayment.id,
      userId: articlePayment.userId,
      articleId: articlePayment.articleId,
    });
    throw error;
  }
}

/**
 * Обработка webhook payment.canceled: обновление статуса платежа на CANCELED (идемпотентно).
 */
export async function cancelPaymentFromWebhook(yookassaPaymentId: string): Promise<void> {
  const payment = await prisma.payment.findFirst({
    where: { yookassaPaymentId, status: "PENDING" },
    select: { id: true },
  });
  if (payment) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "CANCELED" },
    });
    logger.info("Платёж отменён", { paymentId: payment.id });
    return;
  }
  const articlePayment = await prisma.articlePayment.findFirst({
    where: { yookassaPaymentId, status: "PENDING" },
    select: { id: true },
  });
  if (articlePayment) {
    await prisma.articlePayment.update({
      where: { id: articlePayment.id },
      data: { status: "CANCELED" },
    });
    logger.info("Платёж статьи отменён", { paymentId: articlePayment.id });
  }
}

/**
 * Обработка webhook refund.succeeded: удаление доступа и обновление статуса платежа на REFUNDED (идемпотентно).
 */
export async function refundPaymentFromWebhook(yookassaPaymentId: string): Promise<void> {
  const payment = await prisma.payment.findFirst({
    where: { yookassaPaymentId, status: "SUCCEEDED" },
    select: { id: true, userId: true, courseId: true },
  });
  if (payment) {
    await prisma.$transaction(async (tx) => {
      await tx.courseAccess
        .delete({
          where: { courseId_userId: { courseId: payment.courseId, userId: payment.userId } },
        })
        .catch(() => undefined);
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "REFUNDED" },
      });
    });
    logger.info("Платёж возвращён, доступ удалён", {
      paymentId: payment.id,
      userId: payment.userId,
      courseId: payment.courseId,
    });
    return;
  }
  const articlePayment = await prisma.articlePayment.findFirst({
    where: { yookassaPaymentId, status: "SUCCEEDED" },
    select: { id: true, userId: true, articleId: true },
  });
  if (!articlePayment) return;
  await prisma.$transaction(async (tx) => {
    await tx.articleAccess
      .delete({
        where: { articleId_userId: { articleId: articlePayment.articleId, userId: articlePayment.userId } },
      })
      .catch(() => undefined);
    await tx.articlePayment.update({
      where: { id: articlePayment.id },
      data: { status: "REFUNDED" },
    });
  });
  logger.info("Платёж статьи возвращён, доступ удалён", {
    paymentId: articlePayment.id,
    userId: articlePayment.userId,
    articleId: articlePayment.articleId,
  });
}
