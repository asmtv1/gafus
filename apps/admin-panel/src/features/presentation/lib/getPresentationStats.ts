"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import {
  getPresentationStats as getPresentationStatsFromCore,
  type PresentationStats,
} from "@gafus/core/services/adminPresentation";

export type { PresentationStats };

/**
 * Получить статистику по presentation.html (только для ADMIN/MODERATOR)
 */
export async function getPresentationStats(): Promise<
  | { success: true; data: PresentationStats }
  | { success: false; error: string }
> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return { success: false, error: "Необходимо войти в систему" };
  }

  if (!["ADMIN", "MODERATOR"].includes(session.user.role)) {
    return { success: false, error: "Недостаточно прав доступа" };
  }

  return getPresentationStatsFromCore();
}
