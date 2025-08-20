"use server";

import { prisma } from "@gafus/prisma";

import type { Prisma, PetType } from "@gafus/prisma";
import type { UpdatePetInput } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

export async function updatePet(data: UpdatePetInput) {
  try {
    const userId = await getCurrentUserId();

    // Проверяем, что питомец принадлежит пользователю
    const existingPet = await prisma.pet.findFirst({
      where: {
        id: data.id,
        ownerId: userId,
      },
    });

    if (!existingPet) {
      throw new Error("Питомец не найден");
    }

    const updateData: Prisma.PetUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.type !== undefined) updateData.type = data.type as PetType;
    if (data.breed !== undefined) updateData.breed = data.breed;
    if (data.birthDate !== undefined) updateData.birthDate = new Date(data.birthDate);
    if (data.heightCm !== undefined) updateData.heightCm = data.heightCm;
    if (data.weightKg !== undefined) updateData.weightKg = data.weightKg;
    if (data.photoUrl !== undefined) updateData.photoUrl = data.photoUrl;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const pet = await prisma.pet.update({
      where: { id: data.id },
      data: updateData,
      include: {
        awards: true,
      },
    });

    return pet;
  } catch (error) {
    console.error("Ошибка при обновлении питомца:", error);
    throw new Error("Не удалось обновить питомца");
  }
}
