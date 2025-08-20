"use server";

import { prisma } from "@gafus/prisma";

import { getCurrentUserId } from "@/utils";

export async function deletePet(petId: string) {
  try {
    const userId = await getCurrentUserId();

    // Проверяем, что питомец принадлежит пользователю
    const existingPet = await prisma.pet.findFirst({
      where: {
        id: petId,
        ownerId: userId,
      },
    });

    if (!existingPet) {
      throw new Error("Питомец не найден");
    }

    await prisma.pet.delete({
      where: { id: petId },
    });
  } catch (error) {
    console.error("Ошибка при удалении питомца:", error);
    throw new Error("Не удалось удалить питомца");
  }
}
