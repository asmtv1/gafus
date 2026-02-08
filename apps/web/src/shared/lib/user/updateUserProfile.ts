// lib/user/updateUserProfile.ts
"use server";

import { z } from "zod";
import { createWebLogger } from "@gafus/logger";

import type { UpdateUserProfileInput } from "@gafus/types";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import {
  normalizeTelegramInput,
  normalizeInstagramInput,
  normalizeWebsiteUrl,
} from "@gafus/core/utils/social";
import { updateUserProfile as updateUserProfileCore } from "@gafus/core/services/user";

const logger = createWebLogger("web");

const updateUserProfileSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
  about: z.string().trim().max(2000).optional(),
  telegram: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((val) => {
      if (!val) return "";
      try {
        return normalizeTelegramInput(val);
      } catch (error) {
        throw new z.ZodError([
          {
            code: "custom",
            path: ["telegram"],
            message: error instanceof Error ? error.message : "Некорректный Telegram username",
          },
        ]);
      }
    }),
  instagram: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((val) => {
      if (!val) return "";
      try {
        return normalizeInstagramInput(val);
      } catch (error) {
        throw new z.ZodError([
          {
            code: "custom",
            path: ["instagram"],
            message: error instanceof Error ? error.message : "Некорректный Instagram username",
          },
        ]);
      }
    }),
  website: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((val) => {
      if (!val) return "";
      try {
        return normalizeWebsiteUrl(val);
      } catch (error) {
        throw new z.ZodError([
          {
            code: "custom",
            path: ["website"],
            message: error instanceof Error ? error.message : "Некорректный URL",
          },
        ]);
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
    return await updateUserProfileCore(userId, validatedInput);
  } catch (error) {
    logger.error("Ошибка в updateUserProfile", error as Error, { operation: "error" });
    throw new Error("Ошибка при обновлении профиля. Попробуйте перезагрузить страницу.");
  }
}
