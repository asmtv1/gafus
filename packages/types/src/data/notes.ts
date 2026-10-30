/**
 * Existing GET /api/v1/notes/student JSON wire, separate from Core StudentNote
 * and trainer-notes metadata. Hono c.json serializes nested Date|string as string.
 */
export interface StudentNoteEntryWire {
  id: string;
  content: string;
  order: number;
  isVisibleToStudent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StudentNoteWire {
  id: string;
  /** Core StudentNote permits absence as well as explicit null. */
  title?: string | null;
  tags: string[];
  entries: StudentNoteEntryWire[];
  trainer: {
    id: string;
    username: string;
    profile?: {
      fullName?: string | null;
      avatarUrl?: string | null;
    } | null;
  };
  createdAt: string;
}

export interface StudentNotesRead {
  success: true;
  data: StudentNoteWire[];
}
