"use server";

/**
 * Server Action для получения заметок ученика
 * Обертка над core service с авторизацией и кэшированием
 */

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { createWebLogger } from "@gafus/logger";
import { unstable_cache } from "next/cache";
import { getStudentNotes as getStudentNotesService } from "@gafus/core/services/notes";
import type { StudentNote } from "./types";

const logger = createWebLogger("web-get-student-notes");

// Кэшированная функция для получения заметок ученика
const getStudentNotesCached = unstable_cache(
  async (studentId: string): Promise<StudentNote[]> => {
    return await getStudentNotesService(studentId);
  },
  ["student-notes"],
  {
    revalidate: 60,
    tags: ["student-notes"],
  }
);

/**
 * Получает заметки, видимые для текущего ученика
 */
export async function getStudentNotes(): Promise<StudentNote[]> {
  try {
    const studentId = await getCurrentUserId();
    return await getStudentNotesCached(studentId);
  } catch (error) {
    logger.error("Ошибка при получении заметок ученика", error as Error, {
      operation: "get_student_notes_error",
    });
    return [];
  }
}

// Re-export types for convenience
export type { StudentNote, StudentNoteEntry } from "@gafus/core/services/notes";
