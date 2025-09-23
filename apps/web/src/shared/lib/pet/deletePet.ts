"use server";

import { prisma } from "@gafus/prisma";
import { unlink } from "fs/promises";
import { revalidatePath } from "next/cache";
import path from "path";
import { createWebLogger } from "@gafus/logger";

import { petIdSchema } from "../validation/petSchemas";

// Создаем логгер для deletePet
const logger = createWebLogger('web-delete-pet');

export async function deletePet(petId: string, pathToRevalidate = "/") {
  const safePetId = petIdSchema.parse(petId);
  try {
    const pet = await prisma.pet.findUnique({
      where: { id: safePetId },
      select: { photoUrl: true },
    });

    if (pet?.photoUrl) {
      const fileName = path.basename(pet.photoUrl);
      const filePath = path.join(process.cwd(), "..", "..", "packages", "public-assets", "public", "uploads", "pets", fileName);
      await unlink(filePath).catch(() => {
        logger.warn("Не удалось удалить аватарку питомца", { fileName, operation: 'warn' });
      });
    }

    await prisma.pet.delete({
      where: { id: safePetId },
    });

    revalidatePath(pathToRevalidate);
  } catch (error) {
    logger.error("Ошибка в deletePet:", error as Error, { operation: 'error' });
    throw new Error("Не удалось удалить питомцев пользователя");
  }
}
