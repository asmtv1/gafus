// src/lib/actions/savePet.ts
"use server";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { getCurrentUserId as getCurrentUserIdFromAuth } from "@gafus/auth/server";

import type { Prisma, PetType } from "@gafus/prisma";
import type { UpdatePetInput } from "@gafus/types";

import { createPetSchema, updatePetSchema } from "../validation/petSchemas";

// Создаем логгер для savePet
const logger = createWebLogger('web-save-pet');

export async function savePet({
  id,
  name,
  type,
  breed,
  birthDate,
  heightCm,
  weightKg,
  notes,
}: UpdatePetInput) {
  try {
    // Используем auth напрямую - возвращает null для неавторизованных без выброса ошибки
    const ownerId = await getCurrentUserIdFromAuth();
    if (!ownerId) {
      throw new Error("Необходима авторизация");
    }
    logger.warn("Получен ownerId:", { ownerId, operation: 'warn' });

    const trimmedId = id?.trim();

    if (!trimmedId) {
      const validatedData = createPetSchema.parse({
        name,
        type,
        breed,
        birthDate,
        heightCm,
        weightKg,
        notes,
        photoUrl: undefined,
      });
      const parsedDate = new Date(validatedData.birthDate as string);
      const createData: Prisma.PetCreateInput = {
        name: validatedData.name,
        type: validatedData.type as PetType,
        breed: validatedData.breed,
        heightCm: validatedData.heightCm ?? undefined,
        weightKg: validatedData.weightKg ?? undefined,
        notes: validatedData.notes ?? undefined,
        birthDate: parsedDate,
        owner: { connect: { id: ownerId! } },
      };
      logger.warn("Создание питомца с данными:", { createData, operation: 'warn' });
      const result = await prisma.pet.create({
        data: createData,
      });
      logger.warn("Питомец создан успешно:", { result, operation: 'warn' });
      return result;
    } else {
      const validatedData = updatePetSchema.parse({
        id: trimmedId,
        name,
        type,
        breed,
        birthDate,
        heightCm,
        weightKg,
        notes,
      });
      const parsedDate = validatedData.birthDate ? new Date(validatedData.birthDate as string) : undefined;
      const updateData: Prisma.PetUpdateInput = {
        name: validatedData.name !== undefined ? { set: validatedData.name } : undefined,
        type: validatedData.type !== undefined ? { set: validatedData.type as PetType } : undefined,
        breed: validatedData.breed !== undefined ? { set: validatedData.breed } : undefined,
        heightCm:
          validatedData.heightCm !== undefined
            ? { set: validatedData.heightCm ?? null }
            : undefined,
        weightKg:
          validatedData.weightKg !== undefined
            ? { set: validatedData.weightKg ?? null }
            : undefined,
        notes:
          validatedData.notes !== undefined
            ? { set: validatedData.notes ?? null }
            : undefined,
        birthDate: parsedDate !== undefined ? { set: parsedDate } : undefined,
      };
      return await prisma.pet.update({
        where: { id: validatedData.id },
        data: updateData,
      });
    }
  } catch (error) {
    logger.error("Ошибка в savePet:", error as Error, { operation: 'error' });
    throw new Error("Ошибка при сохранении питомца. Попробуйте перезагрузить страницу.");
  }
}
