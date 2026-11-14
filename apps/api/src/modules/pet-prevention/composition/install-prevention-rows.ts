/** Owning API composition: prevention Persistence. The Core facade has no
 * SQL imports; this binds the ORIGINAL transactional implementation. */
import { registerPreventionRowsPort, type PreventionRowsPort } from "@gafus/core/services/petPrevention";
import * as sql from "@gafus/pets-server/prevention-rows";

/** Exact SQL rows still carry Prisma delegate/transaction types. The bridge at
 * this application-owned boundary is solely a TypeScript representation
 * conversion; it does not wrap/replace the SQL, lock, CAS, or owner checks.
 * Non-cast methods remain checked structurally by the Port contract. */
const rows: PreventionRowsPort = {
  readOwnedPreventionPet: sql.readOwnedPreventionPet,
  readOwnedPreventionEntryForUpdate: sql.readOwnedPreventionEntryForUpdate as unknown as PreventionRowsPort["readOwnedPreventionEntryForUpdate"],
  readOwnedPreventionEntryId: sql.readOwnedPreventionEntryId,
  createPreventionRow: sql.createPreventionRow as unknown as PreventionRowsPort["createPreventionRow"],
  updateOwnedPreventionRow: sql.updateOwnedPreventionRow as unknown as PreventionRowsPort["updateOwnedPreventionRow"],
  deleteOwnedPreventionRow: sql.deleteOwnedPreventionRow,
  readPreventionRowsByPet: sql.readPreventionRowsByPet as unknown as PreventionRowsPort["readPreventionRowsByPet"],
  readOwnedPreventionPetIds: sql.readOwnedPreventionPetIds,
  readPreventionRowsByPets: sql.readPreventionRowsByPets as unknown as PreventionRowsPort["readPreventionRowsByPets"],
  withPreventionTransaction: sql.withPreventionTransaction,
  readExistingPreventionClientRow: sql.readExistingPreventionClientRow as unknown as PreventionRowsPort["readExistingPreventionClientRow"],
  createPreventionRowTx: sql.createPreventionRowTx as unknown as PreventionRowsPort["createPreventionRowTx"],
  updateOwnedPreventionRowTx: sql.updateOwnedPreventionRowTx as unknown as PreventionRowsPort["updateOwnedPreventionRowTx"],
};
registerPreventionRowsPort(rows);
