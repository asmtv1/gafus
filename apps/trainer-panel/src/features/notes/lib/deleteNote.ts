"use server";

import { getServerSession } from "next-auth";
import { prisma } from "@gafus/prisma";
import { authOptions } from "@gafus/auth";
import { createTrainerPanelLogger } from "@gafus/logger";
import { revalidatePath, revalidateTag } from "next/cache";
import { handlePrismaError } from "@gafus/core/errors";
import type { ActionResult } from "@gafus/types";
import { deleteNoteSchema } from "./schemas";

const logger = createTrainerPanelLogger("trainer-panel-notes-delete");

export async function deleteNote(
  prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return { success: false, error: "Не авторизован" };
    }

    // Проверка роли
    if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
      return { success: false, error: "Недостаточно прав доступа" };
    }

    const trainerId = session.user.id;
    const isAdmin = session.user.role === "ADMIN";

    // Извлекаем данные из FormData
    const rawData = {
      id: formData.get("id")?.toString() || "",
    };

    // Валидация через Zod
    const validationResult = deleteNoteSchema.safeParse(rawData);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((err) => err.message).join("; ");
      return { success: false, error: errors };
    }

    const data = validationResult.data;

    // Проверка существования заметки
    const note = await prisma.trainerNote.findUnique({
      where: { id: data.id },
      select: { id: true, trainerId: true },
    });

    if (!note) {
      return { success: false, error: "Заметка уже удалена" };
    }

    // Проверка прав доступа
    if (!isAdmin && note.trainerId !== trainerId) {
      return { success: false, error: "Недостаточно прав доступа" };
    }

    // Удаление заметки
    try {
      await prisma.trainerNote.delete({
        where: { id: data.id },
      });

      logger.success("Заметка удалена", {
        noteId: data.id,
        trainerId,
      });

      // Инвалидация кэша
      revalidatePath("/main-panel/notes");
      revalidateTag("trainer-notes");
      revalidateTag(`trainer-notes-${note.trainerId}`);

      return { success: true };
    } catch (error) {
      handlePrismaError(error, "Заметка");
      return { success: false, error: "Ошибка при удалении заметки" };
    }
  } catch (error) {
    logger.error("Ошибка при удалении заметки", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}
