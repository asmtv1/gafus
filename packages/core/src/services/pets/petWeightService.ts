import { prisma } from "@gafus/prisma";

export async function getPetWeightHistory(petId: string, ownerId: string) {
  const pet = await prisma.pet.findFirst({
    where: { id: petId, ownerId },
    select: { id: true, targetWeightKg: true, weightKg: true },
  });
  if (!pet) return null;
  const entries = await prisma.petWeightEntry.findMany({
    where: { petId, ownerId },
    orderBy: [{ measuredAt: "asc" }, { createdAt: "asc" }],
  });

  // Prisma DateTime is a Date at runtime. A corrupt/non-finite stored value
  // otherwise serializes into a successful 200 with null timestamps/weights.
  // Fail closed through the existing generic API 500; never expose row data.
  const validNullableWeight = (value: unknown) =>
    value === null || (typeof value === "number" && Number.isFinite(value));
  const validDate = (value: unknown) =>
    value instanceof Date && Number.isFinite(value.getTime());
  if (
    !validNullableWeight(pet.weightKg) ||
    !validNullableWeight(pet.targetWeightKg) ||
    entries.some(
      (entry) =>
        typeof entry.id !== "string" ||
        !entry.id ||
        entry.petId !== petId ||
        entry.ownerId !== ownerId ||
        !Number.isFinite(entry.weightKg) ||
        !validDate(entry.measuredAt) ||
        !validDate(entry.createdAt),
    )
  ) {
    throw new Error("PET_WEIGHT_HISTORY_INVALID_STORED_DATA");
  }
  return { targetWeightKg: pet.targetWeightKg, currentWeightKg: pet.weightKg, entries };
}

export async function addPetWeightEntry(
  petId: string,
  ownerId: string,
  weightKg: number,
  measuredAt: Date,
) {
  return prisma.$transaction(async (tx) => {
    // Serialize mutations of one pet BEFORE creating/deleting entries and
    // calculating the last surviving measurement. Without an owner-bound
    // row lock, concurrent DELETEs of different entries both return HTTP200
    // but can overwrite Pet.weightKg with a weight from a deleted entry.
    // FOR NO KEY UPDATE conflicts with another weight mutation yet remains
    // compatible with PetWeightEntry's foreign-key KEY SHARE acquisition.
    // Distinct owners/pets never block each other.
    const pet = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Pet"
      WHERE "id" = ${petId} AND "ownerId" = ${ownerId}
      FOR NO KEY UPDATE
    `;
    if (pet.length === 0) return null;
    const entry = await tx.petWeightEntry.create({
      data: { petId, ownerId, weightKg, measuredAt },
    });
    const latest = await tx.petWeightEntry.findFirst({
      where: { petId, ownerId },
      orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
    });
    await tx.pet.update({ where: { id: petId }, data: { weightKg: latest?.weightKg ?? null } });
    return entry;
  });
}

export async function deletePetWeightEntry(petId: string, ownerId: string, entryId: string) {
  return prisma.$transaction(async (tx) => {
    // Serialize mutations of one pet BEFORE creating/deleting entries and
    // calculating the last surviving measurement. Without an owner-bound
    // row lock, concurrent DELETEs of different entries both return HTTP200
    // but can overwrite Pet.weightKg with a weight from a deleted entry.
    // FOR NO KEY UPDATE conflicts with another weight mutation yet remains
    // compatible with PetWeightEntry's foreign-key KEY SHARE acquisition.
    // Distinct owners/pets never block each other.
    const pet = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Pet"
      WHERE "id" = ${petId} AND "ownerId" = ${ownerId}
      FOR NO KEY UPDATE
    `;
    if (pet.length === 0) return null;
    const deleted = await tx.petWeightEntry.deleteMany({ where: { id: entryId, petId, ownerId } });
    if (!deleted.count) return false;
    const latest = await tx.petWeightEntry.findFirst({
      where: { petId, ownerId },
      orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
    });
    await tx.pet.update({ where: { id: petId }, data: { weightKg: latest?.weightKg ?? null } });
    return true;
  });
}

export async function setPetTargetWeight(
  petId: string,
  ownerId: string,
  targetWeightKg: number | null,
) {
  const updated = await prisma.pet.updateMany({
    where: { id: petId, ownerId },
    data: { targetWeightKg },
  });
  return updated.count > 0;
}
