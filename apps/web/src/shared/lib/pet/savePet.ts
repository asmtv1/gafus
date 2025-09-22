// src/lib/actions/savePet.ts
"use server";

import { prisma } from "@gafus/prisma";

import type { Prisma, PetType } from "@gafus/prisma";
import type { UpdatePetInput } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

import { createPetSchema, updatePetSchema } from "../validation/petSchemas";

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
    const ownerId = await getCurrentUserId();
    console.warn("Получен ownerId:", ownerId);

    const trimmedId = id?.trim();

    if (!trimmedId && !ownerId) {
      throw new Error("Поле ownerId обязательно при создании");
    }

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
      const parsedDate = new Date(validatedData.birthDate);
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
      console.warn("Создание питомца с данными:", createData);
      const result = await prisma.pet.create({
        data: createData,
      });
      console.warn("Питомец создан успешно:", result);
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
      const parsedDate = validatedData.birthDate ? new Date(validatedData.birthDate) : undefined;
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
    console.error("Ошибка в savePet:", error);
    throw new Error("Ошибка при сохранении питомца. Попробуйте перезагрузить страницу.");
  }
}
