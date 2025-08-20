"use server";

import { prisma } from "@gafus/prisma";
import { unlink } from "fs/promises";
import { revalidatePath } from "next/cache";
import path from "path";

export async function deletePet(petId: string, pathToRevalidate = "/") {
  try {
    const pet = await prisma.pet.findUnique({
      where: { id: petId },
      select: { photoUrl: true },
    });

    if (pet?.photoUrl) {
      const fileName = path.basename(pet.photoUrl);
      const filePath = path.join(process.cwd(), "public", "uploads", "pets", fileName);
      await unlink(filePath).catch(() => {
        console.warn("Не удалось удалить аватарку питомца:", fileName);
      });
    }

    await prisma.pet.delete({
      where: { id: petId },
    });

    revalidatePath(pathToRevalidate);
  } catch (error) {
    console.error("Ошибка в deletePet:", error);
    throw new Error("Не удалось удалить питомцев пользователя");
  }
}
