"use server";

import type { AuthRole } from "@gafus/auth";
import { authOptions } from "@gafus/auth";
import { adminSetListedCynologists, ConsultationForbiddenError } from "@gafus/core";
import { createAdminPanelLogger } from "@gafus/logger";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const logger = createAdminPanelLogger("consultations-set-listed");

const schema = z.object({
  cynologistUserIds: z.array(z.string().min(1)),
});

export type SetListedResult = { success: true } | { success: false; error: string };

/**
 * Сохраняет набор тренеров, отображаемых в каталоге консультаций на сайте.
 */
export async function setListedCynologistsAction(
  cynologistUserIds: string[],
): Promise<SetListedResult> {
  try {
    const session = (await getServerSession(authOptions)) as {
      user: { id: string; role: string };
    } | null;

    if (!session?.user?.id) {
      return { success: false, error: "Не авторизован" };
    }
    if (!["ADMIN", "MODERATOR"].includes(session.user.role)) {
      return { success: false, error: "Недостаточно прав" };
    }

    const parsed = schema.safeParse({ cynologistUserIds });
    if (!parsed.success) {
      return { success: false, error: "Некорректные данные" };
    }

    await adminSetListedCynologists(
      session.user.id,
      session.user.role as AuthRole,
      parsed.data.cynologistUserIds,
    );
    revalidatePath("/main-panel/consultations");
    logger.success("setListedCynologists", { count: parsed.data.cynologistUserIds.length });
    return { success: true };
  } catch (error) {
    if (error instanceof ConsultationForbiddenError) {
      return { success: false, error: error.message };
    }
    logger.error(
      "setListedCynologists failed",
      error instanceof Error ? error : new Error(String(error)),
    );
    return { success: false, error: "Не удалось сохранить" };
  }
}
