"use server";

/**
 * Server Actions для работы с заметками ученика
 */

import { getStudentNotes as getStudentNotesImpl } from "@shared/lib/notes/getStudentNotes";

export async function getStudentNotes() {
  return getStudentNotesImpl();
}
