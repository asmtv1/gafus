/** Owner-scoped PetCard/list/detail DB projections. No cross-owner lookup is exposed. */
import { prisma } from "@gafus/prisma";

export async function readOwnedPets(ownerId: string) {
  if (!ownerId) return [];
  return prisma.pet.findMany({
    where: { ownerId },
    include: {
      awards: { orderBy: { date: "desc" } },
      _count: { select: { preventionEntries: true, documents: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function readOwnedPetDetail(petId: string, ownerId: string) {
  if (!petId || !ownerId) return null;
  return prisma.pet.findFirst({
    where: { id: petId, ownerId },
    include: { awards: { orderBy: { date: "desc" } } },
  });
}
