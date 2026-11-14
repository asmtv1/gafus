/** Owning API composition: vet Persistence. The Core facade has no
 * SQL imports; this binds the ORIGINAL transactional implementation. */
import { registerVetVisitRowsPort, type VetVisitRowsPort } from "@gafus/core/services/pets";
import * as sql from "@gafus/pets-server/vet-visit-write-rows";

/** Exact SQL rows still carry Prisma delegate/transaction types. The bridge at
 * this application-owned boundary is solely a TypeScript representation
 * conversion; it does not wrap/replace the SQL, lock, CAS, or owner checks.
 * Non-cast methods remain checked structurally by the Port contract. */
const rows: VetVisitRowsPort = {
  ownPetForVet: sql.ownPetForVet,
  lockVetPetRowTx: sql.lockVetPetRowTx as unknown as VetVisitRowsPort["lockVetPetRowTx"],
  listOwnPetVetRows: sql.listOwnPetVetRows,
  upsertOwnPetVetVisit: sql.upsertOwnPetVetVisit,
  removeOwnPetVetVisit: sql.removeOwnPetVetVisit as unknown as VetVisitRowsPort["removeOwnPetVetVisit"],
  requireOwnPetVetVisit: sql.requireOwnPetVetVisit,
  reservePetVetAttachment: sql.reservePetVetAttachment as unknown as VetVisitRowsPort["reservePetVetAttachment"],
  commitPetVetAttachment: sql.commitPetVetAttachment,
  removeOwnPetVetAttachment: sql.removeOwnPetVetAttachment as unknown as VetVisitRowsPort["removeOwnPetVetAttachment"],
  readOwnPetVetAttachment: sql.readOwnPetVetAttachment,
  enqueueOwnPetVetCleanupTx: sql.enqueueOwnPetVetCleanupTx as unknown as VetVisitRowsPort["enqueueOwnPetVetCleanupTx"],
  isVetVisitDbError: (error): error is {readonly kind: sql.VetVisitDbFailure} => error instanceof sql.VetVisitDbError,
};
registerVetVisitRowsPort(rows);
