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
  return { targetWeightKg: pet.targetWeightKg, currentWeightKg: pet.weightKg, entries };
}

export async function addPetWeightEntry(
  petId: string,
  ownerId: string,
  weightKg: number,
  measuredAt: Date,
) {
  return prisma.$transaction(async (tx) => {
    const pet = await tx.pet.findFirst({ where: { id: petId, ownerId }, select: { id: true } });
    if (!pet) return null;
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
    const pet = await tx.pet.findFirst({ where: { id: petId, ownerId }, select: { id: true } });
    if (!pet) return null;
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
