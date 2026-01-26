export interface TrainerNoteEntry {
  id: string;
  noteId: string;
  content: string;
  order: number;
  isVisibleToStudent: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface TrainerNote {
  id: string;
  trainerId: string;
  title?: string | null; // Заголовок заметки (опционально)
  tags: string[]; // Теги заметки
  entries: TrainerNoteEntry[]; // Текстовые записи внутри заметки
  students: {
    id: string;
    username: string;
    profile?: {
      fullName?: string;
      avatarUrl?: string;
    } | null;
  }[]; // Массив учеников
  trainer?: {
    id: string;
    username: string;
  };
  createdAt: Date | string; // Может быть строкой после сериализации
}

export interface GetNotesResult {
  notes: TrainerNote[];
  total: number;
  page: number;
  pageSize: number;
}
