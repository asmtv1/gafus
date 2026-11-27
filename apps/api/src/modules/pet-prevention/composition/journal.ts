import { preventionRows } from "./prevention-rows-instance.js";
import type { PreventionRowsPort } from "@gafus/core/services/petPrevention";
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

export function createPreventionJournalApplicationForRows(rowsPort: PreventionRowsPort) {
 return createPreventionJournalApplication({
  list: (userId, petId) => withCorrelatedUseCase("pets.prevention.entries.read", () => getEntriesByPet(userId, petId, rowsPort)),
  create: (userId, petId, data) => withCorrelatedUseCase("pets.prevention.entry.create", () => createEntry(userId, petId, data, rowsPort)),
  batch: (userId, petId, entries) => withCorrelatedUseCase("pets.prevention.entries.batch_upsert", () => upsertPreventionEntriesBatch(userId, petId, entries, rowsPort)),
  update: (userId, petId, entryId, data) => withCorrelatedUseCase("pets.prevention.entry.update", () => updateEntry(userId, petId, entryId, data, rowsPort)),
  remove: (userId, petId, entryId) => withCorrelatedUseCase("pets.prevention.entry.delete", () => deleteEntry(userId, petId, entryId, rowsPort)),
 });
}
export const preventionJournalApplication = createPreventionJournalApplicationForRows(preventionRows);
