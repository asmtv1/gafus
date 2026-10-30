/** AG1-001: student notes READ is a single injected existing Core port. */
import type { getStudentNotes } from "@gafus/core/services/notes";

type StudentNotesReader = typeof getStudentNotes;

export function createReadStudentNotesApplication(dependencies: {
  readNotes: StudentNotesReader;
}) {
  return {
    execute(studentId: string): ReturnType<StudentNotesReader> {
      return dependencies.readNotes(studentId);
    },
  };
}
