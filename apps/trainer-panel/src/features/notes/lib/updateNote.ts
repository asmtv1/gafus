"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createTrainerPanelLogger } from "@gafus/logger";
import { revalidatePath, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@gafus/core/services/cache";
import type { ActionResult } from "@gafus/types";
import { updateTrainerNote } from "@gafus/core/services/notes";
import { updateNoteSchema } from "./schemas";

const logger = createTrainerPanelLogger("trainer-panel-notes-update");

export async function updateNote(
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

    const rawData: Record<string, unknown> = {
      id: formData.get("id")?.toString() || "",
    };
    const title = formData.get("title")?.toString();
    const entriesStr = formData.get("entries")?.toString();
    const studentIdsStr = formData.get("studentIds")?.toString();
    const tagsStr = formData.get("tags")?.toString();

    if (title !== null && title !== undefined) rawData.title = title || null;
    if (entriesStr != null) {
      try {
        rawData.entries = JSON.parse(entriesStr);
      } catch {
        return { success: false, error: "Некорректный формат записей" };
      }
    }
    if (studentIdsStr != null) {
      try {
        rawData.studentIds = JSON.parse(studentIdsStr);
      } catch {
        rawData.studentIds = studentIdsStr
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0);
      }
    }
    if (tagsStr != null) {
      try {
        rawData.tags = JSON.parse(tagsStr);
      } catch {
        rawData.tags = tagsStr.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
      }
    }

    const validationResult = updateNoteSchema.safeParse(rawData);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((e) => e.message).join("; ");
      return { success: false, error: errors };
    }

    const result = await updateTrainerNote(
      validationResult.data,
      trainerId,
      isAdmin,
    );
    if (!result.success) {
      return result;
    }

    logger.success("Заметка обновлена", { noteId: validationResult.data.id, trainerId });
    revalidatePath("/main-panel/notes");
    revalidateTag(CACHE_TAGS.TRAINER_NOTES);
    revalidateTag(CACHE_TAGS.TRAINER_NOTES_BY_TRAINER(trainerId));
    return { success: true };
  } catch (error) {
    logger.error("Ошибка при обновлении заметки", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}
