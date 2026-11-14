/** SQL composition for student and trainer note policy. No DB in Core. */
import {
  getStudentNotes as coreGetStudentNotes,
  createTrainerNote as coreCreateTrainerNote,
  updateTrainerNote as coreUpdateTrainerNote,
  deleteTrainerNote as coreDeleteTrainerNote,
  getTrainerNotes as coreGetTrainerNotes,
  type NotesPersistencePort,
  type TrainerNotePushPort,
  type CreateTrainerNoteInput,
  type UpdateTrainerNoteInput,
  type DeleteTrainerNoteInput,
  type NotesQueryInput,
} from "@gafus/core/services/notes";
import {
  readStudentNoteRows, readTrainerNoteStudentRoles,
  createTrainerNoteRows, readTrainerNoteForUpdate,
  updateTrainerNoteRows, readTrainerNoteForDelete,
  deleteTrainerNoteRows, readTrainerNoteRows,
} from "@gafus/course-progress-server/trainer-note-rows";
import { createImmediatePushNotification } from "@gafus/notifications-server";

export const notesPersistence: NotesPersistencePort = {
  readStudentNoteRows, readTrainerNoteStudentRoles,
  createTrainerNoteRows, readTrainerNoteForUpdate,
  updateTrainerNoteRows, readTrainerNoteForDelete,
  deleteTrainerNoteRows, readTrainerNoteRows,
};
/** Keep the push transport outside Core, including its provider errors. */
export const sendTrainerNotePush: TrainerNotePushPort = (message) =>
  createImmediatePushNotification(message);
export const getStudentNotes = (studentId: string, options?: { throwOnError?: boolean }) =>
  coreGetStudentNotes(notesPersistence, studentId, options);
export const createTrainerNote = (input: CreateTrainerNoteInput, actorId: string) =>
  coreCreateTrainerNote(notesPersistence, input, actorId, sendTrainerNotePush);
export const updateTrainerNote = (
  input: UpdateTrainerNoteInput, actorId: string, isAdmin: boolean,
) => coreUpdateTrainerNote(notesPersistence, input, actorId, isAdmin, sendTrainerNotePush);
export const deleteTrainerNote = (
  input: DeleteTrainerNoteInput, actorId: string, isAdmin: boolean,
) => coreDeleteTrainerNote(notesPersistence, input, actorId, isAdmin);
export const getTrainerNotes = (query: NotesQueryInput) =>
  coreGetTrainerNotes(notesPersistence, query);
