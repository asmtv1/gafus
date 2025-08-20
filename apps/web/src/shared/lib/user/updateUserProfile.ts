// lib/user/updateUserProfile.ts
"use server";

import { prisma } from "@gafus/prisma";

import type { Prisma } from "@gafus/prisma";
import type { UpdateUserProfileInput } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

export async function updateUserProfile({
  fullName,
  about,
  telegram,
  instagram,
  website,
  birthDate,
}: UpdateUserProfileInput) {
  try {
    const userId = await getCurrentUserId();

    const updateData: Prisma.UserProfileUpdateInput = {
      fullName: fullName || null,
      about: about || null,
      telegram: telegram || null,
      instagram: instagram || null,
      website: website || null,
    };

    const createData: Prisma.UserProfileCreateInput = {
      user: { connect: { id: userId } },
      fullName: fullName || null,
      about: about || null,
      telegram: telegram || null,
      instagram: instagram || null,
      website: website || null,
    };

    if (birthDate !== undefined) {
      if (birthDate === "") {
        updateData.birthDate = null;
        createData.birthDate = null;
      } else {
        const parsed = new Date(birthDate);
        if (isNaN(parsed.getTime())) throw new Error("Неверная дата");
        updateData.birthDate = parsed;
        createData.birthDate = parsed;
      }
    }

    const result = await prisma.userProfile.upsert({
      where: { userId },
      update: updateData,
      create: createData,
    });
    return result;
  } catch (error) {
    console.error("❌ Ошибка в updateUserProfile:", error);
    console.error("📋 Детали ошибки:", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : "No stack",
    });
    throw new Error("Ошибка при обновлении профиля. Попробуйте перезагрузить страницу.");
  }
}
