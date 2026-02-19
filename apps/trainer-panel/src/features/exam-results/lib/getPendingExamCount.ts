"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getPendingExamCount as getPendingExamCountCore } from "@gafus/core/services/exam";

/**
 * Получает количество экзаменов, ожидающих проверки тренером.
 * @returns Количество непроверенных экзаменов (0 если не авторизован или нет прав)
 */
export async function getPendingExamCount(): Promise<number> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return 0;
  }

  if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
    return 0;
  }

  try {
    return getPendingExamCountCore(session.user.id, session.user.role === "ADMIN");
  } catch {
    return 0;
  }
}
