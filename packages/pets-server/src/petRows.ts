/**
 * PostgreSQL persistence for Pet profiles, create receipts, photo and documents.
 * Core owns S3 orchestration, validation, outbox scheduling and user-facing errors.
 * Each transaction remains caller-owned so owner locks and outbox intents commit
 * atomically with the profile/document update, exactly as before extraction.
 */
import { prisma, Prisma, type PetType } from "@gafus/prisma";

export type { PetType } from "@gafus/prisma";
export type PetSqlTx = Prisma.TransactionClient;
export type PetCreateFields = Prisma.PetUncheckedCreateInput;
export type PetProfilePatch = Prisma.PetUpdateInput;
export type PetWithAwards = Prisma.PetGetPayload<{ include: { awards: true } }>;
export type PetCreateReceiptRow = {
  payloadHash: string;
  petId: string;
  responseJson: unknown;
};

export function withPetSqlTx<T>(
  callback: (tx: PetSqlTx) => Promise<T>,
  options?: { maxWait?: number; timeout?: number },
): Promise<T> {
  return prisma.$transaction(callback, options);
}

export function findCommittedPetReceipt(ownerId: string, clientRequestId: string) {
  return prisma.$queryRawUnsafe<PetCreateReceiptRow[]>(
    'SELECT "payloadHash", "petId", "responseJson" FROM "PetCreateReceipt" WHERE "ownerId"=$1 AND "clientRequestId"=$2::uuid LIMIT 1',
    ownerId,
    clientRequestId,
  );
}

export function claimPetCreationReceipt(
  tx: PetSqlTx,
  input: {
    ownerId: string;
    clientRequestId: string;
    payloadHash: string;
    petId: string;
    responseJson: string;
  },
) {
  return tx.$queryRawUnsafe<{ petId: string }[]>(
    'INSERT INTO "PetCreateReceipt" ("ownerId","clientRequestId","payloadHash","petId","responseStatus","responseJson") VALUES ($1,$2::uuid,$3,$4,201,$5::jsonb) ON CONFLICT ("ownerId","clientRequestId") DO NOTHING RETURNING "petId"',
    input.ownerId,
    input.clientRequestId,
    input.payloadHash,
    input.petId,
    input.responseJson,
  );
}

export function createPetWithAwards(fields: PetCreateFields, tx?: PetSqlTx) {
  return (tx ?? prisma).pet.create({ data: fields, include: { awards: true } });
}
export function findOwnedPet(ownerId: string, petId: string) {
  return prisma.pet.findFirst({ where: { id: petId, ownerId } });
}
export function existsOwnedPet(ownerId: string, petId: string, tx?: PetSqlTx) {
  return (tx ?? prisma).pet.findFirst({
    where: { id: petId, ownerId },
    select: { id: true },
  });
}
export function readOwnedPetPhoto(ownerId: string, petId: string, tx?: PetSqlTx) {
  return (tx ?? prisma).pet.findFirst({
    where: { id: petId, ownerId },
    select: { photoUrl: true },
  });
}
export function lockPetOwner(tx: PetSqlTx, ownerId: string) {
  return tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${ownerId} FOR UPDATE`;
}
export function updateOwnedPetWithAwards(
  tx: PetSqlTx,
  ownerId: string,
  petId: string,
  patch: PetProfilePatch,
) {
  return tx.pet.update({
    where: { id: petId, ownerId },
    data: patch,
    include: { awards: true },
  });
}
export function updateOwnedPetPhoto(
  tx: PetSqlTx,
  ownerId: string,
  petId: string,
  photoUrl: string,
) {
  return tx.pet.update({
    where: { id: petId, ownerId },
    data: { photoUrl },
  });
}

export function listOwnedPetDocuments(ownerId: string, petId: string) {
  return prisma.petDocument.findMany({
    where: { petId, ownerId },
    orderBy: [{ createdAt: "desc" }],
  });
}
export function readAllUserPetDocumentRows(ownerId: string) {
  return prisma.petDocument.findMany({
    where: { ownerId },
    orderBy: [{ createdAt: "desc" }],
  });
}
export function findOwnedPetDocument(
  ownerId: string,
  documentId: string,
  petId?: string,
  tx?: PetSqlTx,
) {
  return (tx ?? prisma).petDocument.findFirst({
    where: { id: documentId, ownerId, ...(petId ? { petId } : {}) },
  });
}
export function findOwnedPetDocumentForDownload(
  ownerId: string,
  documentId: string,
  petId?: string,
) {
  return prisma.petDocument.findFirst({
    where: { id: documentId, ownerId, ...(petId ? { petId } : {}) },
    select: { id: true, name: true, mimeType: true, sizeBytes: true, url: true },
  });
}
export function findPetDocumentByUrl(ownerId: string, petId: string, url: string) {
  return prisma.petDocument.findFirst({
    where: { ownerId, petId, url },
    select: { id: true },
  });
}
export function countOwnedPetDocuments(tx: PetSqlTx, ownerId: string, petId: string) {
  return tx.petDocument.count({ where: { petId, ownerId } });
}
export function createOwnedPetDocument(
  tx: PetSqlTx,
  input: {
    petId: string;
    ownerId: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
  },
) {
  return tx.petDocument.create({ data: input });
}
export function deletePetDocumentRow(documentId: string, tx?: PetSqlTx) {
  return (tx ?? prisma).petDocument.delete({ where: { id: documentId } });
}
export function renamePetDocumentRow(documentId: string, name: string) {
  return prisma.petDocument.update({
    where: { id: documentId },
    data: { name },
  });
}
export function readOwnedPetDocumentUrls(tx: PetSqlTx, ownerId: string, petId: string) {
  return tx.petDocument.findMany({
    where: { petId, ownerId },
    select: { url: true },
  });
}
export function deleteOwnedPetRow(tx: PetSqlTx, ownerId: string, petId: string) {
  return tx.pet.delete({ where: { id: petId, ownerId } });
}

/** Same owner-locked Pet CRUD transaction; media outbox is SQL-owned here. */
export { enqueuePetMediaDeletionIntent, consumePetMediaUploadReservation, petMediaOutboxEnabled } from "./petMediaDeletionSql.js";
