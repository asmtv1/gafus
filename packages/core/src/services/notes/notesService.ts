/**
 * Notes Service - бизнес-логика работы с заметками тренера
 *
 * Этот модуль содержит чистую бизнес-логику без Next.js специфики.
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("notes-service");

export interface StudentNoteEntry {
  id: string;
  content: string;
  order: number;
  isVisibleToStudent: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface StudentNote {
  id: string;
  title?: string | null;
  tags: string[];
  entries: StudentNoteEntry[];
  trainer: {
    id: string;
    username: string;
    profile?: {
      fullName?: string | null;
      avatarUrl?: string | null;
    } | null;
  };
  createdAt: Date | string;
}

/**
 * Получает заметки, видимые для ученика
 * @param studentId - ID ученика
 * @returns Массив заметок с видимыми записями
 */
export async function getStudentNotes(studentId: string): Promise<StudentNote[]> {
  try {
    const notes = await prisma.trainerNote.findMany({
      where: {
        students: {
          some: {
            studentId: studentId,
          },
        },
        entries: {
          some: {
            isVisibleToStudent: true,
          },
        },
      },
      select: {
        id: true,
        title: true,
        tags: true,
        createdAt: true,
        trainer: {
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
        entries: {
          where: {
            isVisibleToStudent: true, // Только видимые записи
          },
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
      },
      orderBy: { createdAt: "desc" },
    });

    return notes as StudentNote[];
  } catch (error) {
    logger.error("Ошибка при получении заметок ученика", error as Error, {
      operation: "get_student_notes_error",
      studentId,
    });
    return [];
  }
}
