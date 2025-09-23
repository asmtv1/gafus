"use server";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import type { Prisma, PetType } from "@gafus/prisma";
import type { UpdatePetInput } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

import { updatePetSchema } from "../validation/petSchemas";

// Создаем логгер для updatePet
const logger = createWebLogger('web-update-pet');

export async function updatePet(data: UpdatePetInput) {
  const validatedData = updatePetSchema.parse(data);
  try {
    const userId = await getCurrentUserId();

    // Проверяем, что питомец принадлежит пользователю
    const existingPet = await prisma.pet.findFirst({
      where: {
        id: validatedData.id,
        ownerId: userId,
      },
    });

    if (!existingPet) {
      throw new Error("Питомец не найден");
    }

    const updateData: Prisma.PetUpdateInput = {};

    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.type !== undefined) updateData.type = validatedData.type as PetType;
    if (validatedData.breed !== undefined) updateData.breed = validatedData.breed;
    if (validatedData.birthDate !== undefined)
      updateData.birthDate = new Date(validatedData.birthDate as string);
    if (validatedData.heightCm !== undefined)
      updateData.heightCm = validatedData.heightCm ?? null;
    if (validatedData.weightKg !== undefined)
      updateData.weightKg = validatedData.weightKg ?? null;
    if (validatedData.photoUrl !== undefined)
      updateData.photoUrl = validatedData.photoUrl || null;
    if (validatedData.notes !== undefined) updateData.notes = validatedData.notes ?? null;

    const pet = await prisma.pet.update({
      where: { id: validatedData.id },
      data: updateData,
      include: {
        awards: true,
      },
    });

    return pet;
  } catch (error) {
    logger.error("Ошибка при обновлении питомца:", error as Error, { operation: 'error' });
    throw new Error("Не удалось обновить питомца");
  }
}
