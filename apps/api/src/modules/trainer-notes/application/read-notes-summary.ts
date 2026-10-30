/** AG1-001: exact approved note metadata projection and one snapshot orchestration. */
type NoteSummary = {
  id: string;
  title: string | null;
  tags: string[];
  createdAt: string;
};
type ReadSummary = {
  notes: NoteSummary[];
  total: number;
  page: number;
  pageSize: number;
};

type ReadNotesSnapshot = (
  where: { trainerId?: string }, page: number, pageSize: number,
) => Promise<{ notes: unknown; total: unknown }>;

function invalidResult(): never {
  throw new Error("INVALID_NOTES_SUMMARY_SOURCE");
}
function projectNotes(source: unknown, total: unknown, page: number,
  pageSize: number): ReadSummary {
  if (!Array.isArray(source) || typeof total !== "number" ||
    !Number.isSafeInteger(total) || total < 0) invalidResult();
  const notes: NoteSummary[] = source.map((row: unknown) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return invalidResult();
    const note = row as Record<string, unknown>;
    if (typeof note.id !== "string" || note.id.length === 0 ||
      (note.title !== null && typeof note.title !== "string") ||
      !Array.isArray(note.tags) || !note.tags.every((t: unknown) => typeof t === "string") ||
      !(note.createdAt instanceof Date) || !Number.isFinite(note.createdAt.getTime())
    ) return invalidResult();
    return {
      id: note.id,
      title: note.title,
      tags: [...note.tags],
      createdAt: note.createdAt.toISOString(),
    };
  });
  if (notes.length > pageSize || notes.length > total) invalidResult();
  return { notes, total, page, pageSize };
}

export function createReadTrainerNotesSummaryApplication(dependencies: {
  readSnapshot: ReadNotesSnapshot;
}) {
  return {
    async execute({ actorUserId, isAdmin, page, pageSize }: {
      actorUserId: string;
      isAdmin: boolean;
      page: number;
      pageSize: number;
    }): Promise<ReadSummary> {
      const where = isAdmin ? {} : { trainerId: actorUserId };
      const { notes, total } = await dependencies.readSnapshot(where, page, pageSize);
      return projectNotes(notes, total, page, pageSize);
    },
  };
}
