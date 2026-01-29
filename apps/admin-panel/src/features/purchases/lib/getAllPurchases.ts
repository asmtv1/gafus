import { createAdminPanelLogger } from "@gafus/logger";
import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

const logger = createAdminPanelLogger("get-all-purchases");

export type PurchaseRow = {
  id: string;
  userId: string;
  courseId: string;
  amountRub: number;
  currency: string;
  status: string;
  yookassaPaymentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    username: string;
    phone: string;
    profile: { fullName: string | null; avatarUrl: string | null } | null;
  };
  course: {
    name: string;
    type: string;
    priceRub: number | null;
  };
};

/**
 * Список всех платежей (покупок курсов) для админ-панели.
 * Доступ: ADMIN, MODERATOR.
 */
export async function getAllPurchases(): Promise<PurchaseRow[]> {
  const session = (await getServerSession(authOptions)) as {
    user: { id: string; role: string };
  } | null;

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
    redirect("/");
  }

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

    return payments.map((p) => ({
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
  } catch (error) {
    logger.error("Ошибка при получении покупок", error as Error);
    throw new Error("Не удалось получить список покупок");
  }
}
