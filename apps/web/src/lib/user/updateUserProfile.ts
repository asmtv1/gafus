// /lib/actions/userProfileService.ts
"use server";

import { prisma } from "@prisma";
import { getCurrentUserId } from "@/utils/getCurrentUserId";
import type { Prisma } from "@prisma/client";

interface UpdateUserProfileInput {
  fullName: string;
  about: string;
  telegram: string;
  instagram: string;
  website: string;
  birthDate: string;
}

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

    const data: Prisma.UserProfileUpdateInput = {
      fullName: fullName || null,
      about: about || null,
      telegram: telegram || null,
      instagram: instagram || null,
      website: website || null,
    };

    if (birthDate !== undefined) {
      if (birthDate === "") {
        data.birthDate = null;
      } else {
        const parsed = new Date(birthDate);
        if (isNaN(parsed.getTime())) throw new Error("Неверная дата");
        data.birthDate = parsed;
      }
    }

    return await prisma.userProfile.update({
      where: { userId },
      data,
    });
  } catch (error) {
    console.error("Ошибка в updateUserProfile:", error);
    throw new Error(
      "Ошибка при обновлении профиля. Попробуйте перезагрузить страницу."
    );
  }
}
