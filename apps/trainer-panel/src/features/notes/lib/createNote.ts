"use server";

import { getServerSession } from "next-auth";
import { prisma } from "@gafus/prisma";
import { authOptions } from "@gafus/auth";
import { createTrainerPanelLogger } from "@gafus/logger";
import { revalidatePath, revalidateTag } from "next/cache";
import { handlePrismaError } from "@gafus/core/errors";
import type { ActionResult } from "@gafus/types";
import { createNoteSchema } from "./schemas";

const logger = createTrainerPanelLogger("trainer-panel-notes-create");

export async function createNote(
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

    // Извлекаем данные из FormData
    const tagsStr = formData.get("tags")?.toString() || "[]";
    let tags: string[] = [];
    try {
      tags = JSON.parse(tagsStr);
    } catch {
      // Если не JSON, пробуем как строку через запятую
      tags = tagsStr.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
    }

    const studentIdsStr = formData.get("studentIds")?.toString() || "[]";
    let studentIds: string[] = [];
    try {
      studentIds = JSON.parse(studentIdsStr);
    } catch {
      // Если не JSON, пробуем как строку через запятую
      studentIds = studentIdsStr.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
    }

    // Извлекаем entries из FormData
    const entriesStr = formData.get("entries")?.toString() || "[]";
    let entries: { content: string; order: number; isVisibleToStudent?: boolean }[] = [];
    try {
      entries = JSON.parse(entriesStr);
    } catch {
      return { success: false, error: "Некорректный формат записей" };
    }

    const rawData = {
      title: formData.get("title")?.toString() || undefined,
      entries: entries,
      studentIds: studentIds,
      tags: tags,
    };

    // Валидация через Zod
    const validationResult = createNoteSchema.safeParse(rawData);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((err) => err.message).join("; ");
      return { success: false, error: errors };
    }

    const data = validationResult.data;

    // Проверка существования всех учеников
    const students = await prisma.user.findMany({
      where: {
        id: { in: data.studentIds },
      },
      select: { id: true, role: true },
    });

    if (students.length !== data.studentIds.length) {
      return { success: false, error: "Один или несколько учеников не найдены" };
    }

    // Проверка роли учеников (только USER)
    const nonUserStudents = students.filter((s) => s.role !== "USER");
    if (nonUserStudents.length > 0) {
      return { success: false, error: "Можно создавать заметки только для учеников" };
    }

    // Проверка самосоздания
    if (data.studentIds.includes(trainerId)) {
      return { success: false, error: "Нельзя создавать заметки самому себе" };
    }

    // Создание заметки с учениками и записями
    try {
      await prisma.trainerNote.create({
        data: {
          trainerId,
          title: data.title || null,
          tags: data.tags || [],
          students: {
            create: data.studentIds.map((studentId) => ({
              studentId,
            })),
          },
          entries: {
            create: data.entries.map((entry, index) => ({
              content: entry.content,
              order: entry.order ?? index,
              isVisibleToStudent: entry.isVisibleToStudent ?? false,
            })),
          },
        },
      });

      logger.success("Заметка создана", {
        trainerId,
        studentIds: data.studentIds,
      });

      // Инвалидация кэша
      revalidatePath("/main-panel/notes");
      revalidateTag("trainer-notes");
      revalidateTag(`trainer-notes-${trainerId}`);

      return { success: true };
    } catch (error) {
      handlePrismaError(error, "Заметка");
      return { success: false, error: "Ошибка при создании заметки" };
    }
  } catch (error) {
    logger.error("Ошибка при создании заметки", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}
