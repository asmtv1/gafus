// src/lib/actions/savePet.ts
"use server";

import { prisma } from "@prisma";
import { getCurrentUserId } from "@/utils/getCurrentUserId";
import type { Prisma, PetType } from "@prisma/client";

interface UpdatePetInput {
  id?: string;
  ownerId?: string;
  name: string;
  type: string;
  breed?: string;
  birthDate?: string;
  heightCm?: number;
  weightKg?: number;
  notes?: string;
}

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

    const parsedDate =
      birthDate && birthDate !== "" ? new Date(birthDate) : undefined;

    if (!id) {
      const createData: Prisma.PetCreateInput = {
        name: name || "",
        type: type as PetType,
        breed: breed || "",
        heightCm: heightCm !== undefined ? heightCm : undefined,
        weightKg: weightKg !== undefined ? weightKg : undefined,
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
        heightCm: heightCm !== undefined ? { set: heightCm } : undefined,
        weightKg: weightKg !== undefined ? { set: weightKg } : undefined,
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
    throw new Error(
      "Ошибка при сохранении питомца. Попробуйте перезагрузить страницу."
    );
  }
}
