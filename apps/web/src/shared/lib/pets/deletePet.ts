"use server";

import { deleteFileFromCDN, getRelativePathFromCDNUrl } from "@gafus/cdn-upload";
import { prisma } from "@gafus/prisma";
import { revalidatePath } from "next/cache";
import { createWebLogger } from "@gafus/logger";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { petIdSchema } from "../validation/petSchemas";

const logger = createWebLogger("web-delete-pet");

export async function deletePet(petId: string, pathToRevalidate?: string) {
  const safePetId = petIdSchema.parse(petId);
  try {
    const userId = await getCurrentUserId();

    // Проверяем, что питомец принадлежит пользователю
    const existingPet = await prisma.pet.findFirst({
      where: {
        id: safePetId,
        ownerId: userId,
      },
      select: { photoUrl: true },
    });

    if (!existingPet) {
      throw new Error("Питомец не найден");
    }

    // Удаляем фото из CDN, если есть
    if (existingPet.photoUrl) {
      try {
        const relativePath = getRelativePathFromCDNUrl(existingPet.photoUrl);
        await deleteFileFromCDN(relativePath);
        logger.info(`Photo deleted from CDN: ${relativePath}`);
      } catch (error) {
        logger.error(`Failed to delete photo from CDN: ${error}`, error as Error);
      }
    }

    await prisma.pet.delete({
      where: { id: safePetId },
    });

    // Опциональная инвалидация HTML страницы
    if (pathToRevalidate) {
      revalidatePath(pathToRevalidate);
    }
  } catch (error) {
    logger.error("Ошибка при удалении питомца:", error as Error, { operation: "error" });
    throw new Error("Не удалось удалить питомца");
  }
}
