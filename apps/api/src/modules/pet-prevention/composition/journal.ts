/** Deferred bindings: real Core writes occur only inside existing HTTP requests. */
import {
  getEntriesByPet,
  createEntry,
  upsertPreventionEntriesBatch,
  updateEntry,
  deleteEntry,
} from "@gafus/core/services/petPrevention";
import { createPreventionJournalApplication } from "../application/journal.js";

export const preventionJournalApplication = createPreventionJournalApplication({
  list: (userId, petId) => getEntriesByPet(userId, petId),
  create: (userId, petId, data) => createEntry(userId, petId, data),
  batch: (userId, petId, entries) => upsertPreventionEntriesBatch(userId, petId, entries),
  update: (userId, petId, entryId, data) => updateEntry(userId, petId, entryId, data),
  remove: (userId, petId, entryId) => deleteEntry(userId, petId, entryId),
});
