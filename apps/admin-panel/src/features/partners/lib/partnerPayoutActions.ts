"use server";
/* eslint-disable @typescript-eslint/no-explicit-any, max-len */

import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "./getPartnersAdmin";

export async function markPartnerBalancePaid(partnerId: string) {
  await requireAdmin();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { success: false, error: "Не авторизован" };

  try {
    const result = await (prisma as any).$transaction(async (tx: any) => {
      const profile = await tx.partnerProfile.findUnique({
        where: { id: partnerId },
        include: { commissions: { select: { amountKopecks: true } }, payouts: { where: { status: { in: ["PENDING", "PAID"] } }, select: { amountKopecks: true } } },
      });
      if (!profile) return { error: "Партнёр не найден" };
      const earned = profile.commissions.reduce((sum: number, row: any) => sum + row.amountKopecks, 0);
      const reserved = profile.payouts.reduce((sum: number, row: any) => sum + row.amountKopecks, 0);
      const amountKopecks = earned - reserved;
      if (amountKopecks <= 0) return { error: "Доступный баланс уже выплачен или отсутствует" };
      const payout = await tx.partnerPayout.create({ data: { partnerId, amountKopecks, status: "PAID", processedAt: new Date(), note: `Выплата отмечена администратором ${session.user.id}` } });
      return { payoutId: payout.id, amountKopecks };
    });
    if (result.error) return { success: false, error: result.error };
    revalidatePath("/main-panel/partners");
    revalidatePath(`/main-panel/partners/${partnerId}`);
    return { success: true, amountKopecks: result.amountKopecks };
  } catch {
    return { success: false, error: "Не удалось отметить выплату" };
  }
}
