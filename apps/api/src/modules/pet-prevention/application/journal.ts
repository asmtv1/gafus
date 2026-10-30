/** Existing prevention journal CRUD and offline batch, injected Core business ports. */
import type {
  getEntriesByPet,
  createEntry,
  upsertPreventionEntriesBatch,
  updateEntry,
  deleteEntry,
} from "@gafus/core/services/petPrevention";

export function createPreventionJournalApplication(dependencies: {
  list: typeof getEntriesByPet;
  create: typeof createEntry;
  batch: typeof upsertPreventionEntriesBatch;
  update: typeof updateEntry;
  remove: typeof deleteEntry;
}) {
  return {
    list(userId: string, petId: string): ReturnType<typeof getEntriesByPet> {
      return dependencies.list(userId, petId);
    },
    create(
      userId: string,
      petId: string,
      data: Parameters<typeof createEntry>[2],
    ): ReturnType<typeof createEntry> {
      return dependencies.create(userId, petId, data);
    },
    batch(
      userId: string,
      petId: string,
      entries: Parameters<typeof upsertPreventionEntriesBatch>[2],
    ): ReturnType<typeof upsertPreventionEntriesBatch> {
      return dependencies.batch(userId, petId, entries);
    },
    update(
      userId: string,
      petId: string,
      entryId: string,
      data: Parameters<typeof updateEntry>[3],
    ): ReturnType<typeof updateEntry> {
      return dependencies.update(userId, petId, entryId, data);
    },
    remove(userId: string, petId: string, entryId: string): ReturnType<typeof deleteEntry> {
      return dependencies.remove(userId, petId, entryId);
    },
  };
}
