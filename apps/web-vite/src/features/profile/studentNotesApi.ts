import type {
  StudentNoteEntryWire, StudentNoteWire, StudentNotesRead,
} from "@gafus/types";
import { apiRequest, ApiError } from "../../shared/api/client";

// The canonical Hono StudentNotesRead envelope is already handled by apiRequest.
// Fail closed before any untrusted nested wire value can enter the private cache.
export type StudentNoteText = Pick<StudentNoteWire, "id" | "title" | "tags" | "createdAt"> & {
  trainerName: string;
  entries: StudentNoteEntryWire[];
};

function invalid(): never {
  throw new ApiError(200, "Некорректные заметки тренера", "INVALID_RESPONSE");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") invalid();
  return value;
}
function iso(value: unknown): string {
  if (typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) invalid();
  return value;
}
function entry(value: unknown): StudentNoteEntryWire {
  const raw = object(value);
  if (raw.isVisibleToStudent !== true || typeof raw.content !== "string" ||
    !Number.isSafeInteger(raw.order) || (raw.order as number) < 0) invalid();
  return {
    id: identifier(raw.id), content: raw.content, order: raw.order as number,
    isVisibleToStudent: true, createdAt: iso(raw.createdAt), updatedAt: iso(raw.updatedAt),
  };
}
function note(value: unknown): StudentNoteText {
  const raw = object(value);
  if (raw.title !== undefined && raw.title !== null && typeof raw.title !== "string") invalid();
  if (!Array.isArray(raw.tags) || !raw.tags.every(item => typeof item === "string")) invalid();
  if (!Array.isArray(raw.entries)) invalid();
  const trainer = object(raw.trainer);
  identifier(trainer.id);
  const username = identifier(trainer.username);
  const profile = trainer.profile === undefined || trainer.profile === null
    ? null : object(trainer.profile);
  if (profile && profile.fullName !== undefined && profile.fullName !== null &&
    typeof profile.fullName !== "string") invalid();
  return {
    id: identifier(raw.id), title: raw.title === undefined ? undefined : raw.title as string | null,
    tags: raw.tags as string[], createdAt: iso(raw.createdAt),
    // Source Next StudentNotes displays fullName || username as provided.
    // Trimming changed rendered text widths/line breaks for valid server
    // values; strings remain React-escaped and the wire shape is validated.
    trainerName: (typeof profile?.fullName === "string" && profile.fullName) || username,
    // Preserve the server's own order; never materialize entries not returned.
    entries: raw.entries.map(entry),
  };
}

export async function getStudentNotes(): Promise<StudentNoteText[]> {
  const raw = await apiRequest<unknown>("/api/v1/notes/student", {
    method: "GET", browserAuth: true, expectedStatus: 200,
  });
  if (!Array.isArray(raw)) invalid();
  return raw.map(note);
}

// Compile-time alignment: apiRequest unwraps StudentNotesRead['data']; the
// contract is not a separate endpoint, query scheme or writable DTO.
type _CanonicalResult = StudentNotesRead["data"];
const _canonicalProof: _CanonicalResult extends StudentNoteWire[] ? true : false = true;
void _canonicalProof;
