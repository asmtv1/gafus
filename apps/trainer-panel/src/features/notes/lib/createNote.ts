"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createTrainerPanelLogger } from "@gafus/logger";
import { revalidatePath, revalidateTag } from "next/cache";
import type { ActionResult } from "@gafus/types";
import { CACHE_TAGS } from "@gafus/core/services/cache";
import { createTrainerNote } from "@gafus/core/services/notes";
import { createNoteSchema } from "./schemas";

const logger = createTrainerPanelLogger("trainer-panel-notes-create");

export async function createNote(
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
    const tagsStr = formData.get("tags")?.toString() || "[]";
    const tags = parseJsonArray(tagsStr, (arr) =>
      arr.map((s) => s.trim()).filter((s) => s.length > 0),
    );
    const studentIdsStr = formData.get("studentIds")?.toString() || "[]";
    const studentIds = parseJsonArray(studentIdsStr, (arr) =>
      arr.map((s) => s.trim()).filter((s) => s.length > 0),
    );
    const entriesStr = formData.get("entries")?.toString() || "[]";
    let entries: { content: string; order: number; isVisibleToStudent?: boolean }[] = [];
    try {
      entries = JSON.parse(entriesStr);
    } catch {
      return { success: false, error: "Некорректный формат записей" };
    }

    const rawData = {
      title: formData.get("title")?.toString() || undefined,
      entries,
      studentIds,
      tags,
    };
    const validationResult = createNoteSchema.safeParse(rawData);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((e) => e.message).join("; ");
      return { success: false, error: errors };
    }

    const result = await createTrainerNote(validationResult.data, trainerId);
    if (!result.success) {
      return result;
    }

    logger.success("Заметка создана", { trainerId, studentIds: validationResult.data.studentIds });
    revalidatePath("/main-panel/notes");
    revalidateTag(CACHE_TAGS.TRAINER_NOTES);
    revalidateTag(CACHE_TAGS.TRAINER_NOTES_BY_TRAINER(trainerId));
    return { success: true };
  } catch (error) {
    logger.error("Ошибка при создании заметки", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

function parseJsonArray(str: string, map: (arr: string[]) => string[]): string[] {
  try {
    const arr = JSON.parse(str);
    return Array.isArray(arr) ? map(arr.map(String).filter(Boolean)) : [];
  } catch {
    return map(str.split(",").map((s) => s.trim()).filter(Boolean));
  }
}
