"use client";

import PageLayout from "@shared/components/PageLayout";
import NotesList from "@/features/notes/components/NotesList";
import type { GetNotesResult } from "@/features/notes/types";

interface NotesClientProps {
  initialNotes: GetNotesResult;
}

export default function NotesClient({ initialNotes }: NotesClientProps) {
  return (
    <PageLayout title="Заметки" subtitle="Управление вашими заметками о учениках">
      <NotesList initialNotes={initialNotes} />
    </PageLayout>
  );
}
