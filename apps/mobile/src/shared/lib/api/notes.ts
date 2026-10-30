import { apiClient, type ApiResponse } from "./client";
import type {
  StudentNoteEntryWire,
  StudentNoteWire,
} from "../../../../../../packages/types/src/data/notes";

/** Existing Mobile text-only subset of the canonical student-notes JSON wire. */
export type StudentNoteEntry = Pick<StudentNoteEntryWire, "id" | "content" | "createdAt">;

export type StudentNote = Pick<StudentNoteWire, "id" | "title" | "createdAt"> & {
  trainer?: {
    profile?: Pick<NonNullable<StudentNoteWire["trainer"]["profile"]>, "fullName"> | null;
  } | null;
  entries: StudentNoteEntry[];
};

export const notesApi = {
  getStudentNotes: async (): Promise<ApiResponse<StudentNote[]>> => {
    return apiClient<StudentNote[]>("/api/v1/notes/student");
  },
};

