/** AG1-001: only composition binds the original student Core READ lazily. */
import { getStudentNotes } from "@gafus/core/services/notes";
import { createReadStudentNotesApplication } from "../application/read-student-notes.js";

export const readStudentNotesApplication = createReadStudentNotesApplication({
  readNotes: (studentId) => getStudentNotes(studentId, { throwOnError: true }),
});
