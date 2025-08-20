"use server";

import { prisma } from "@gafus/prisma";
import { validatePetForm } from "@shared/lib/validation/serverValidation";

import type { PetType } from "@gafus/prisma";
import type { CreatePetInput } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

export async function createPet(data: CreatePetInput) {
  try {
    // Серверная валидация
    const validation = validatePetForm({
      id: "",
      ...data,
    });
    if (!validation.isValid) {
      throw new Error(`Ошибка валидации: ${Object.values(validation.errors).join(", ")}`);
    }

    const userId = await getCurrentUserId();

    const pet = await prisma.pet.create({
      data: {
        ownerId: userId,
        name: data.name,
        type: data.type as PetType,
        breed: data.breed,
        birthDate: new Date(data.birthDate),
        heightCm: data.heightCm || null,
        weightKg: data.weightKg || null,
        photoUrl: data.photoUrl || null,
        notes: data.notes || null,
      },
      include: {
        awards: true,
      },
    });

    return pet;
  } catch (error) {
    console.error("Ошибка при создании питомца:", error);
    throw new Error("Не удалось создать питомца");
  }
}
