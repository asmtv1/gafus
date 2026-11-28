/** Owning API composition: pets Persistence. The Core facade has no
 * SQL imports; this binds the ORIGINAL transactional implementation. */
import type { PetRowsPort } from "@gafus/core/services/pets";
import * as sql from "@gafus/pets-server/pet-rows";

/** Exact SQL rows still carry Prisma delegate/transaction types. The bridge at
 * this application-owned boundary is solely a TypeScript representation
 * conversion; it does not wrap/replace the SQL, lock, CAS, or owner checks.
 * Non-cast methods remain checked structurally by the Port contract. */
export const petRows: PetRowsPort = {
  withPetSqlTx: sql.withPetSqlTx,
  findCommittedPetReceipt: sql.findCommittedPetReceipt,
  claimPetCreationReceipt: sql.claimPetCreationReceipt as unknown as PetRowsPort["claimPetCreationReceipt"],
  createPetWithAwards: sql.createPetWithAwards as unknown as PetRowsPort["createPetWithAwards"],
  findOwnedPet: sql.findOwnedPet,
  existsOwnedPet: sql.existsOwnedPet as unknown as PetRowsPort["existsOwnedPet"],
  readOwnedPetPhoto: sql.readOwnedPetPhoto as unknown as PetRowsPort["readOwnedPetPhoto"],
  lockPetOwner: sql.lockPetOwner as unknown as PetRowsPort["lockPetOwner"],
  updateOwnedPetWithAwards: sql.updateOwnedPetWithAwards as unknown as PetRowsPort["updateOwnedPetWithAwards"],
  updateOwnedPetPhoto: sql.updateOwnedPetPhoto as unknown as PetRowsPort["updateOwnedPetPhoto"],
  listOwnedPetDocuments: sql.listOwnedPetDocuments,
  readAllUserPetDocumentRows: sql.readAllUserPetDocumentRows,
  findOwnedPetDocument: sql.findOwnedPetDocument as unknown as PetRowsPort["findOwnedPetDocument"],
  findOwnedPetDocumentForDownload: sql.findOwnedPetDocumentForDownload,
  findPetDocumentByUrl: sql.findPetDocumentByUrl,
  countOwnedPetDocuments: sql.countOwnedPetDocuments as unknown as PetRowsPort["countOwnedPetDocuments"],
  createOwnedPetDocument: sql.createOwnedPetDocument as unknown as PetRowsPort["createOwnedPetDocument"],
  deletePetDocumentRow: sql.deletePetDocumentRow as unknown as PetRowsPort["deletePetDocumentRow"],
  renamePetDocumentRow: sql.renamePetDocumentRow,
  readOwnedPetDocumentUrls: sql.readOwnedPetDocumentUrls as unknown as PetRowsPort["readOwnedPetDocumentUrls"],
  deleteOwnedPetRow: sql.deleteOwnedPetRow as unknown as PetRowsPort["deleteOwnedPetRow"],
  enqueuePetMediaDeletionIntent: sql.enqueuePetMediaDeletionIntent as unknown as PetRowsPort["enqueuePetMediaDeletionIntent"],
  consumePetMediaUploadReservation: sql.consumePetMediaUploadReservation as unknown as PetRowsPort["consumePetMediaUploadReservation"],
  petMediaOutboxEnabled: sql.petMediaOutboxEnabled,
};
