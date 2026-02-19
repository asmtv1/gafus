import { createAdminPanelLogger } from "@gafus/logger";
import { authOptions } from "@gafus/auth";
import {
  getAllPurchases as getAllPurchasesFromCore,
  type AdminPurchaseRow,
} from "@gafus/core/services/adminPurchase";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

const logger = createAdminPanelLogger("get-all-purchases");

export type PurchaseRow = AdminPurchaseRow;

/**
 * Список всех платежей (покупок курсов) для админ-панели.
 * Доступ: ADMIN, MODERATOR.
 */
export async function getAllPurchases(): Promise<AdminPurchaseRow[]> {
  const session = (await getServerSession(authOptions)) as {
    user: { id: string; role: string };
  } | null;

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
    redirect("/");
  }

  const result = await getAllPurchasesFromCore();
  if (!result.success) {
    logger.error("Ошибка при получении покупок", new Error(result.error));
    throw new Error(result.error);
  }
  return result.data;
}
