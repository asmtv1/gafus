"use server";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import type { PetType } from "@gafus/prisma";
import type { CreatePetInput } from "@gafus/types";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

import { createPetSchema } from "../validation/petSchemas";

// Создаем логгер для createPet
const logger = createWebLogger("web-create-pet");

export async function createPet(data: CreatePetInput) {
  const validatedData = createPetSchema.parse(data);
  try {
    const userId = await getCurrentUserId();

    const pet = await prisma.pet.create({
      data: {
        ownerId: userId,
        name: validatedData.name,
        type: validatedData.type as PetType,
        breed: validatedData.breed,
        birthDate: new Date(validatedData.birthDate),
        heightCm: validatedData.heightCm ?? null,
        weightKg: validatedData.weightKg ?? null,
        photoUrl: validatedData.photoUrl ? validatedData.photoUrl : null,
        notes: validatedData.notes ?? null,
      },
      include: {
        awards: true,
      },
    });

    return pet;
  } catch (error) {
    logger.error("Ошибка при создании питомца:", error as Error, { operation: "error" });
    throw new Error("Не удалось создать питомца");
  }
}
