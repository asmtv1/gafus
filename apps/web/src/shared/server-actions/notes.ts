"use server";

/**
 * Server Actions для работы с заметками ученика
 */

import { createWebLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";

import { getStudentNotes as getStudentNotesImpl } from "@shared/lib/notes/getStudentNotes";

const logger = createWebLogger("web-student-notes-server-action");

export async function getStudentNotes() {
  try {
    return await getStudentNotesImpl();
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "Ошибка server action getStudentNotes",
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }
}
