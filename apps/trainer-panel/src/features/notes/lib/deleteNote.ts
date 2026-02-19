"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createTrainerPanelLogger } from "@gafus/logger";
import { revalidatePath, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@gafus/core/services/cache";
import type { ActionResult } from "@gafus/types";
import { deleteTrainerNote } from "@gafus/core/services/notes";
import { deleteNoteSchema } from "./schemas";

const logger = createTrainerPanelLogger("trainer-panel-notes-delete");

export async function deleteNote(
  prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return { success: false, error: "Не авторизован" };
    }
    if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
      return { success: false, error: "Недостаточно прав доступа" };
    }

    const trainerId = session.user.id;
    const isAdmin = session.user.role === "ADMIN";
    const rawData = { id: formData.get("id")?.toString() || "" };

    const validationResult = deleteNoteSchema.safeParse(rawData);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((e) => e.message).join("; ");
      return { success: false, error: errors };
    }

    const result = await deleteTrainerNote(
      validationResult.data,
      trainerId,
      isAdmin,
    );
    if (!result.success) {
      return result;
    }

    logger.success("Заметка удалена", { noteId: validationResult.data.id, trainerId });
    revalidatePath("/main-panel/notes");
    revalidateTag(CACHE_TAGS.TRAINER_NOTES);
    revalidateTag(CACHE_TAGS.TRAINER_NOTES_BY_TRAINER(trainerId));
    return { success: true };
  } catch (error) {
    logger.error("Ошибка при удалении заметки", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}
