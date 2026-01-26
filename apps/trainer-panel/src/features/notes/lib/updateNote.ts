"use server";

import { getServerSession } from "next-auth";
import { prisma } from "@gafus/prisma";
import { authOptions } from "@gafus/auth";
import { createTrainerPanelLogger } from "@gafus/logger";
import { revalidatePath, revalidateTag } from "next/cache";
import { handlePrismaError } from "@gafus/core/errors";
import type { ActionResult } from "@gafus/types";
import { updateNoteSchema } from "./schemas";

const logger = createTrainerPanelLogger("trainer-panel-notes-update");

export async function updateNote(
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
    const rawData: Record<string, unknown> = {
      id: formData.get("id")?.toString() || "",
    };

    const title = formData.get("title")?.toString();
    const entriesStr = formData.get("entries")?.toString();
    const studentIdsStr = formData.get("studentIds")?.toString();
    const tagsStr = formData.get("tags")?.toString();

    if (title !== null && title !== undefined) {
      rawData.title = title || null;
    }
    if (entriesStr !== null && entriesStr !== undefined) {
      let entries: { content: string; order: number; isVisibleToStudent?: boolean }[] = [];
      try {
        entries = JSON.parse(entriesStr);
      } catch {
        return { success: false, error: "Некорректный формат записей" };
      }
      rawData.entries = entries;
    }
    if (studentIdsStr !== null && studentIdsStr !== undefined) {
      let studentIds: string[] = [];
      try {
        studentIds = JSON.parse(studentIdsStr);
      } catch {
        // Если не JSON, пробуем как строку через запятую
        studentIds = studentIdsStr.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
      }
      rawData.studentIds = studentIds;
    }
    if (tagsStr !== null && tagsStr !== undefined) {
      let tags: string[] = [];
      try {
        tags = JSON.parse(tagsStr);
      } catch {
        // Если не JSON, пробуем как строку через запятую
        tags = tagsStr.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
      }
      rawData.tags = tags;
    }

    // Валидация через Zod
    const validationResult = updateNoteSchema.safeParse(rawData);
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
      return { success: false, error: "Заметка не найдена" };
    }

    // Проверка прав доступа
    if (!isAdmin && note.trainerId !== trainerId) {
      return { success: false, error: "Недостаточно прав доступа" };
    }

    // Проверка учеников, если они обновляются
    if (data.studentIds !== undefined) {
      const students = await prisma.user.findMany({
        where: {
          id: { in: data.studentIds },
        },
        select: { id: true, role: true },
      });

      if (students.length !== data.studentIds.length) {
        return { success: false, error: "Один или несколько учеников не найдены" };
      }

      const nonUserStudents = students.filter((s) => s.role !== "USER");
      if (nonUserStudents.length > 0) {
        return { success: false, error: "Можно создавать заметки только для учеников" };
      }

      if (data.studentIds.includes(trainerId)) {
        return { success: false, error: "Нельзя создавать заметки самому себе" };
      }
    }

    // Обновление заметки
    try {
      const updateData: {
        title?: string | null;
        tags?: string[];
        students?: {
          deleteMany?: {};
          create?: { studentId: string }[];
        };
        entries?: {
          deleteMany?: {};
          create?: { content: string; order: number; isVisibleToStudent: boolean }[];
        };
      } = {};

      if (data.title !== undefined) {
        updateData.title = data.title || null;
      }
      if (data.tags !== undefined) {
        updateData.tags = data.tags;
      }
      if (data.studentIds !== undefined) {
        // Удаляем всех старых учеников и добавляем новых
        updateData.students = {
          deleteMany: {},
          create: data.studentIds.map((studentId) => ({
            studentId,
          })),
        };
      }
      if (data.entries !== undefined) {
        // Удаляем все старые записи и добавляем новые
        updateData.entries = {
          deleteMany: {},
          create: data.entries.map((entry, index) => ({
            content: entry.content,
            order: entry.order ?? index,
            isVisibleToStudent: entry.isVisibleToStudent ?? false,
          })),
        };
      }

      await prisma.trainerNote.update({
        where: { id: data.id },
        data: updateData,
      });

      logger.success("Заметка обновлена", {
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
      return { success: false, error: "Ошибка при обновлении заметки" };
    }
  } catch (error) {
    logger.error("Ошибка при обновлении заметки", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}
