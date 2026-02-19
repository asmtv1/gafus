import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import type { AdminPurchaseRow } from "./types";

const logger = createWebLogger("admin-purchase-service");

export async function getAllPurchases(): Promise<
  { success: true; data: AdminPurchaseRow[] } | { success: false; error: string }
> {
  try {
    const payments = await prisma.payment.findMany({
      select: {
        id: true,
        userId: true,
        courseId: true,
        amountRub: true,
        currency: true,
        status: true,
        yookassaPaymentId: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            username: true,
            phone: true,
            profile: { select: { fullName: true, avatarUrl: true } },
          },
        },
        course: {
          select: { name: true, type: true, priceRub: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const data: AdminPurchaseRow[] = payments.map((p) => ({
      id: p.id,
      userId: p.userId,
      courseId: p.courseId,
      amountRub: Number(p.amountRub),
      currency: p.currency,
      status: p.status,
      yookassaPaymentId: p.yookassaPaymentId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      user: {
        username: p.user.username,
        phone: p.user.phone,
        profile: p.user.profile,
      },
      course: {
        name: p.course.name,
        type: p.course.type,
        priceRub: p.course.priceRub != null ? Number(p.course.priceRub) : null,
      },
    }));

    return { success: true, data };
  } catch (error) {
    logger.error("Ошибка при получении покупок", error as Error);
    return { success: false, error: "Не удалось получить список покупок" };
  }
}
