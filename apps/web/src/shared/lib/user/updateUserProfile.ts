// lib/user/updateUserProfile.ts
"use server";

import { prisma } from "@gafus/prisma";
import { z } from "zod";
import { createWebLogger } from "@gafus/logger";

import type { Prisma } from "@gafus/prisma";
import type { UpdateUserProfileInput } from "@gafus/types";

import { getCurrentUserId } from "@/utils";
import { normalizeTelegramInput, normalizeInstagramInput, normalizeWebsiteUrl } from "@/shared/utils/socialLinks";

const logger = createWebLogger('web');

const updateUserProfileSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
  about: z.string().trim().max(2000).optional(),
  telegram: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((val) => {
      if (!val) return '';
      try {
        return normalizeTelegramInput(val);
      } catch (error) {
        throw new z.ZodError([{
          code: 'custom',
          path: ['telegram'],
          message: error instanceof Error ? error.message : 'Некорректный Telegram username'
        }]);
      }
    }),
  instagram: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((val) => {
      if (!val) return '';
      try {
        return normalizeInstagramInput(val);
      } catch (error) {
        throw new z.ZodError([{
          code: 'custom',
          path: ['instagram'],
          message: error instanceof Error ? error.message : 'Некорректный Instagram username'
        }]);
      }
    }),
  website: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((val) => {
      if (!val) return '';
      try {
        return normalizeWebsiteUrl(val);
      } catch (error) {
        throw new z.ZodError([{
          code: 'custom',
          path: ['website'],
          message: error instanceof Error ? error.message : 'Некорректный URL'
        }]);
      }
    }),
  birthDate: z.string().trim().max(100).optional(),
});

export async function updateUserProfile({
  fullName,
  about,
  telegram,
  instagram,
  website,
  birthDate,
}: UpdateUserProfileInput) {
  const validatedInput = updateUserProfileSchema.parse({
    fullName,
    about,
    telegram,
    instagram,
    website,
    birthDate,
  });
  try {
    const userId = await getCurrentUserId();

    const normalizedFullName = validatedInput.fullName ?? "";
    const normalizedAbout = validatedInput.about ?? "";
    const normalizedTelegram = validatedInput.telegram ?? "";
    const normalizedInstagram = validatedInput.instagram ?? "";
    const normalizedWebsite = validatedInput.website ?? "";
    const normalizedBirthDate = validatedInput.birthDate ?? "";

    const updateData: Prisma.UserProfileUpdateInput = {
      fullName: normalizedFullName || null,
      about: normalizedAbout || null,
      telegram: normalizedTelegram || null,
      instagram: normalizedInstagram || null,
      website: normalizedWebsite || null,
    };

    const createData: Prisma.UserProfileCreateInput = {
      user: { connect: { id: userId } },
      fullName: normalizedFullName || null,
      about: normalizedAbout || null,
      telegram: normalizedTelegram || null,
      instagram: normalizedInstagram || null,
      website: normalizedWebsite || null,
    };

    if (normalizedBirthDate !== undefined) {
      if (normalizedBirthDate === "") {
        updateData.birthDate = null;
        createData.birthDate = null;
      } else {
        const parsed = new Date(normalizedBirthDate);
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
    logger.error("❌ Ошибка в updateUserProfile:", error as Error, { operation: 'error' });
    logger.error("📋 Детали ошибки:", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : "No stack",
    } as Error, { operation: 'error' });
    throw new Error("Ошибка при обновлении профиля. Попробуйте перезагрузить страницу.");
  }
}
