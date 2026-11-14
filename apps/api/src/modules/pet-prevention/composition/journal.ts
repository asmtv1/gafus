import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
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
  list: (userId, petId) => withCorrelatedUseCase("pets.prevention.entries.read", () => getEntriesByPet(userId, petId)),
  create: (userId, petId, data) => withCorrelatedUseCase("pets.prevention.entry.create", () => createEntry(userId, petId, data)),
  batch: (userId, petId, entries) => withCorrelatedUseCase("pets.prevention.entries.batch_upsert", () => upsertPreventionEntriesBatch(userId, petId, entries)),
  update: (userId, petId, entryId, data) => withCorrelatedUseCase("pets.prevention.entry.update", () => updateEntry(userId, petId, entryId, data)),
  remove: (userId, petId, entryId) => withCorrelatedUseCase("pets.prevention.entry.delete", () => deleteEntry(userId, petId, entryId)),
});
