/** SQL-free trainer/student notes persistence port.
 * Core owns role, student visibility and notification policy.
 * SQL owns owner-fenced UPDATE/DELETE and transactional child writes.
 */
import type {
  CreateTrainerNoteInput, NotesQueryInput,
} from "./schemas";
import type {
  StudentNote, TrainerNoteEntryDto,
} from "./notesService";

export type NoteRowsUpdateData = {
  title?: string | null;
  tags?: string[];
  students?: { deleteMany: object; create: { studentId: string }[] };
  entries?: {
    deleteMany: object;
    create: { content: string; order: number; isVisibleToStudent: boolean }[];
  };
};
export interface TrainerNoteListRow {
  id: string;
  trainerId: string;
  title: string | null;
  tags: string[];
  createdAt: Date | string;
  entries: TrainerNoteEntryDto[];
  students: {
    student: {
      id: string;
      username: string;
      profile: { fullName: string | null; avatarUrl: string | null } | null;
    };
  }[];
}
export interface NotesPersistencePort {
  readStudentNoteRows(studentId: string): Promise<StudentNote[]>;
  readTrainerNoteStudentRoles(ids: string[]): Promise<{ id: string; role: string }[]>;
  createTrainerNoteRows(input: CreateTrainerNoteInput, trainerId: string): Promise<unknown>;
  readTrainerNoteForUpdate(id: string): Promise<{
    trainerId: string;
    students: { studentId: string }[];
    entries: { content: string; isVisibleToStudent: boolean }[];
  } | null>;
  updateTrainerNoteRows(
    id: string, data: NoteRowsUpdateData, actorId: string, isAdmin: boolean,
  ): Promise<unknown>;
  readTrainerNoteForDelete(id: string): Promise<{ trainerId: string } | null>;
  deleteTrainerNoteRows(id: string, actorId: string, isAdmin: boolean): Promise<unknown>;
  readTrainerNoteRows(query: NotesQueryInput): Promise<{
    notes: TrainerNoteListRow[];
    total: number;
  }>;
}
