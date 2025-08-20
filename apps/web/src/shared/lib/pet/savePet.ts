// src/lib/actions/savePet.ts
"use server";

import { prisma } from "@gafus/prisma";
import { validatePetForm } from "@shared/lib/validation/serverValidation";

import type { Prisma, PetType } from "@gafus/prisma";
import type { UpdatePetInput } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

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
   

    if (!id && !ownerId) {
      throw new Error("Поле ownerId обязательно при создании");
    }

    // Обработка пустых значений для необязательных числовых полей
    
    const processedHeightCm = heightCm === undefined ? undefined : heightCm;
    const processedWeightKg = weightKg === undefined ? undefined : weightKg;
  

    // Серверная валидация
    const validation = validatePetForm({
      id: id || "",
      name,
      type,
      breed: breed || "",
      birthDate: birthDate || "",
      heightCm: processedHeightCm,
      weightKg: processedWeightKg,
      notes,
    });

    if (!validation.isValid) {
      throw new Error(`Ошибка валидации: ${Object.values(validation.errors).join(", ")}`);
    }

    const parsedDate = birthDate && birthDate !== "" ? new Date(birthDate) : undefined;

    if (!id) {
      const createData: Prisma.PetCreateInput = {
        name: name || "",
        type: type as PetType,
        breed: breed || "",
        heightCm: processedHeightCm !== undefined ? processedHeightCm : undefined,
        weightKg: processedWeightKg !== undefined ? processedWeightKg : undefined,
        notes: notes !== undefined ? notes : undefined,
        birthDate: parsedDate ?? new Date(),
        owner: { connect: { id: ownerId! } },
      };
      return await prisma.pet.create({
        data: createData,
      });
    } else {
      const updateData: Prisma.PetUpdateInput = {
        name: { set: name || "" },
        type: { set: type as PetType },
        breed: breed !== undefined ? { set: breed } : undefined,
        heightCm: processedHeightCm !== undefined ? { set: processedHeightCm } : { set: null },
        weightKg: processedWeightKg !== undefined ? { set: processedWeightKg } : { set: null },
        notes: notes !== undefined ? { set: notes } : undefined,
        birthDate: parsedDate !== undefined ? { set: parsedDate } : undefined,
      };
      return await prisma.pet.update({
        where: { id },
        data: updateData,
      });
    }
  } catch (error) {
    console.error("Ошибка в savePet:", error);
    throw new Error("Ошибка при сохранении питомца. Попробуйте перезагрузить страницу.");
  }
}
