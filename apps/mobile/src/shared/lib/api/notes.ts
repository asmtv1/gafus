import { apiClient, type ApiResponse } from "./client";

export interface StudentNoteEntry {
  id: string;
  content: string;
  createdAt: string;
}

export interface StudentNote {
  id: string;
  title: string;
  createdAt: string;
  trainer?: {
    profile?: {
      fullName: string | null;
    } | null;
  } | null;
  entries: StudentNoteEntry[];
}

export const notesApi = {
  getStudentNotes: async (): Promise<ApiResponse<StudentNote[]>> => {
    return apiClient<StudentNote[]>("/api/v1/notes/student");
  },
};

