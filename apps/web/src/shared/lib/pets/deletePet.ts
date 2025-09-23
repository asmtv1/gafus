"use server";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import { getCurrentUserId } from "@/utils";

import { petIdSchema } from "../validation/petSchemas";

// Создаем логгер для deletePet
const logger = createWebLogger('web-delete-pet');

export async function deletePet(petId: string) {
  const safePetId = petIdSchema.parse(petId);
  try {
    const userId = await getCurrentUserId();

    // Проверяем, что питомец принадлежит пользователю
    const existingPet = await prisma.pet.findFirst({
      where: {
        id: safePetId,
        ownerId: userId,
      },
    });

    if (!existingPet) {
      throw new Error("Питомец не найден");
    }

    await prisma.pet.delete({
      where: { id: safePetId },
    });
  } catch (error) {
    logger.error("Ошибка при удалении питомца:", error as Error, { operation: 'error' });
    throw new Error("Не удалось удалить питомца");
  }
}
