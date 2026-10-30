/** Original owner-scoped Pet list/detail Core READ, isolated from Vet/CDN/write imports. */
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("core-pets");

/**
 * Получить список питомцев пользователя
 */
export async function getUserPets(userId: string, options: { throwOnError?: boolean } = {}) {
  try {
    const pets = await prisma.pet.findMany({
      where: { ownerId: userId },
      include: {
        awards: {
          orderBy: { date: "desc" },
        },
        // Source Next PetCard displays owner-only counts in its collapsed
        // footer. Prisma relation aggregates avoid N+1 clinical-document GETs.
        _count: { select: { preventionEntries: true, documents: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return pets;
  } catch (error) {
    // No raw Prisma exception, provider data, actor ID, or replacement stack.
    logger.error("PET_LIST_FAILED");
    // Preserve the old fallback for existing Web consumers. Hono opts into
    // strict failure, so outages are not mistaken for users with zero pets.
    if (options.throwOnError) throw error;
    return [];
  }
}

/**
 * Получить питомца по ID
 */
export async function getPetById(petId: string, userId: string) {
  const pet = await prisma.pet.findFirst({
    where: {
      id: petId,
      ownerId: userId,
    },
    include: {
      awards: {
        orderBy: { date: "desc" },
      },
    },
  });

  return pet;
}
