/**
 * SQL-only prevention diary repository. The Core use-case owns Zod validation,
 * medicine reminder calculations, privacy-safe error mapping, and DTO grouping.
 *
 * Owner- and pet-fenced writes additionally protect against a stale actor check.
 * Prisma's database-only DbNull never crosses into Core.
 */
import { prisma, Prisma } from "@gafus/prisma";

export type PreventionTx = Prisma.TransactionClient;
export type PreventionCreate = Omit<
  Prisma.PetPreventionEntryUncheckedCreateInput,
  "sentTimesForRemindAt"
>;
export type PreventionUpdate = Omit<
  Prisma.PetPreventionEntryUncheckedUpdateInput,
  "sentTimesForRemindAt"
>;

const entrySelect = {
  id: true,
  type: true,
  performedAt: true,
  productName: true,
  notes: true,
  clientId: true,
  reminderEnabled: true,
  reminderKind: true,
  reminderDaysAfter: true,
  reminderOnDate: true,
  remindAt: true,
  reminderTimes: true,
  lastNotifiedForRemindAt: true,
  sentTimesForRemindAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function readOwnedPreventionPet(userId: string, petId: string) {
  return prisma.pet.findFirst({
    where: { id: petId, ownerId: userId },
    select: { id: true },
  });
}
export function readOwnedPreventionEntryForUpdate(userId: string, petId: string, entryId: string) {
  return prisma.petPreventionEntry.findFirst({
    where: { id: entryId, ownerId: userId, petId },
    select: {
      id: true,
      type: true,
      performedAt: true,
      productName: true,
      notes: true,
      reminderEnabled: true,
      reminderKind: true,
      reminderDaysAfter: true,
      reminderOnDate: true,
      remindAt: true,
      reminderTimes: true,
      lastNotifiedForRemindAt: true,
    },
  });
}
export function readOwnedPreventionEntryId(userId: string, petId: string, entryId: string) {
  return prisma.petPreventionEntry.findFirst({
    where: { id: entryId, ownerId: userId, petId },
    select: { id: true },
  });
}
export function createPreventionRow(data: PreventionCreate) {
  return prisma.petPreventionEntry.create({
    data: { ...data, sentTimesForRemindAt: Prisma.DbNull },
    select: entrySelect,
  });
}
export function updateOwnedPreventionRow(
  userId: string,
  petId: string,
  entryId: string,
  data: PreventionUpdate,
  resetSentTimes: boolean,
) {
  return prisma.petPreventionEntry.update({
    where: { id: entryId, ownerId: userId, petId },
    data: { ...data, sentTimesForRemindAt: resetSentTimes ? Prisma.DbNull : undefined },
    select: entrySelect,
  });
}
export async function deleteOwnedPreventionRow(
  userId: string,
  petId: string,
  entryId: string,
): Promise<void> {
  await prisma.petPreventionEntry.delete({
    where: { id: entryId, ownerId: userId, petId },
  });
}
export function readPreventionRowsByPet(userId: string, petId: string) {
  return prisma.petPreventionEntry.findMany({
    where: { petId, ownerId: userId },
    orderBy: { performedAt: "desc" },
    take: 100,
    select: entrySelect,
  });
}
export function readOwnedPreventionPetIds(userId: string, petIds: string[]) {
  return prisma.pet.findMany({
    where: { ownerId: userId, id: { in: petIds } },
    select: { id: true },
  });
}
export function readPreventionRowsByPets(userId: string, petIds: string[]) {
  return prisma.petPreventionEntry.findMany({
    where: { ownerId: userId, petId: { in: petIds } },
    orderBy: { performedAt: "desc" },
    take: 500,
    select: { petId: true, ...entrySelect },
  });
}
export function withPreventionTransaction<T>(work: (tx: PreventionTx) => Promise<T>): Promise<T> {
  return prisma.$transaction(work);
}
export function readExistingPreventionClientRow(tx: PreventionTx, petId: string, clientId: string) {
  return tx.petPreventionEntry.findUnique({
    where: { petId_clientId: { petId, clientId } },
    select: { id: true, remindAt: true, lastNotifiedForRemindAt: true },
  });
}
export function createPreventionRowTx(tx: PreventionTx, data: PreventionCreate) {
  return tx.petPreventionEntry.create({
    data: { ...data, sentTimesForRemindAt: Prisma.DbNull },
    select: { id: true },
  });
}
export function updateOwnedPreventionRowTx(
  tx: PreventionTx,
  userId: string,
  petId: string,
  entryId: string,
  data: PreventionUpdate,
  resetSentTimes: boolean,
) {
  return tx.petPreventionEntry.update({
    where: { id: entryId, ownerId: userId, petId },
    data: { ...data, sentTimesForRemindAt: resetSentTimes ? Prisma.DbNull : undefined },
  });
}
