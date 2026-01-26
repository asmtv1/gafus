"use server";

import { getServerSession } from "next-auth";
import { prisma } from "@gafus/prisma";
import { authOptions } from "@gafus/auth";
import { createTrainerPanelLogger } from "@gafus/logger";
import { unstable_cache } from "next/cache";
import type { GetNotesResult, TrainerNote } from "../types";

const logger = createTrainerPanelLogger("trainer-panel-notes-get");

// Кэшированная функция с параметрами (без доступа к headers/session)
export const getNotesCached = unstable_cache(
  async (
    trainerId: string | null, // null для ADMIN (получает все заметки)
    studentId: string | undefined,
    tags: string[] | undefined,
    page: number,
    pageSize: number
  ): Promise<GetNotesResult> => {
    const skip = page * pageSize;
    const where = {
      ...(trainerId && { trainerId }), // Если trainerId null, получаем все заметки (для ADMIN)
      ...(studentId && {
        students: {
          some: {
            studentId: studentId,
          },
        },
      }),
      ...(tags && tags.length > 0 && {
        tags: {
          hasSome: tags, // Фильтрация по тегам (хотя бы один из указанных)
        },
      }),
    };

    const [notes, total] = await Promise.all([
      prisma.trainerNote.findMany({
        where,
        select: {
          id: true,
          trainerId: true,
          title: true,
          tags: true,
          createdAt: true,
          entries: {
            select: {
              id: true,
              content: true,
              order: true,
              isVisibleToStudent: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { order: "asc" },
          },
          students: {
            select: {
              student: {
                select: {
                  id: true,
                  username: true,
                  profile: {
                    select: {
                      fullName: true,
                      avatarUrl: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.trainerNote.count({ where }),
    ]);

    // Преобразуем структуру для соответствия типу TrainerNote
    const transformedNotes = notes.map((note) => ({
      ...note,
      students: note.students.map((ns) => ns.student),
    }));

    return {
      notes: transformedNotes as TrainerNote[],
      total,
      page,
      pageSize,
    };
  },
  ["trainer-notes"], // Базовый ключ кэша
  {
    revalidate: 60,
    tags: ["trainer-notes"], // Базовый тег для инвалидации
  }
);

// Обертка для удобства использования (проверка сессии ВНЕ кэшированной функции)
export async function getNotes(
  trainerId: string,
  options?: { studentId?: string; tags?: string[]; page?: number; pageSize?: number }
): Promise<GetNotesResult> {
  try {
    // Проверка сессии ВНЕ кэшированной функции
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      throw new Error("Не авторизован");
    }

    const page = options?.page ?? 0;
    const pageSize = options?.pageSize ?? 50;
    const studentId = options?.studentId;
    const tags = options?.tags;

    // Для ADMIN передаем null, чтобы получить все заметки
    const effectiveTrainerId = session.user.role === "ADMIN" ? null : trainerId;

    // Параметры автоматически включаются в ключ кэша Next.js
    // Для инвалидации используем revalidateTag в Server Actions
    return await getNotesCached(effectiveTrainerId, studentId, tags, page, pageSize);
  } catch (error) {
    logger.error("Ошибка при получении заметок", error as Error, {
      trainerId,
      studentId: options?.studentId,
      tags: options?.tags,
      page: options?.page,
    });
    throw error;
  }
}
