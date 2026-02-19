"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getPresentationStats as getPresentationStatsFromCore } from "@gafus/core/services/adminPresentation";

/**
 * Получить статистику по presentation.html (только для ADMIN/MODERATOR)
 */
export async function getPresentationStats(): Promise<{
  success: boolean;
  data?: Awaited<
    ReturnType<typeof getPresentationStatsFromCore>
  > extends { success: true; data: infer T }
    ? T
    : never;
  error?: string;
}> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return { success: false, error: "Необходимо войти в систему" };
  }

  if (!["ADMIN", "MODERATOR"].includes(session.user.role)) {
    return { success: false, error: "Недостаточно прав доступа" };
  }

  return getPresentationStatsFromCore();
}
