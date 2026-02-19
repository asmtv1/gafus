/**
 * Схемы заметок — реэкспорт из @gafus/core (единый источник истины).
 */

export {
  createTrainerNoteSchema as createNoteSchema,
  updateTrainerNoteSchema as updateNoteSchema,
  deleteTrainerNoteSchema as deleteNoteSchema,
  noteEntrySchema,
} from "@gafus/core/services/notes";
export type {
  CreateTrainerNoteInput as CreateNoteInput,
  UpdateTrainerNoteInput as UpdateNoteInput,
  DeleteTrainerNoteInput as DeleteNoteInput,
} from "@gafus/core/services/notes";
