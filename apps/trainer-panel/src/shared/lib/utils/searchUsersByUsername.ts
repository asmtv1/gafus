"use server";

import { prisma } from "@gafus/prisma";
import { createTrainerPanelLogger } from "@gafus/logger";
import { unstable_cache } from "next/cache";

// Создаем логгер для searchUsersByUsername
const logger = createTrainerPanelLogger('trainer-panel-search-users');

export const searchUsersByUsername = unstable_cache(
  async (search: string) => {
    try {
      if (!search.trim()) return [];
      return prisma.user.findMany({
        where: {
          username: {
            contains: search,
            mode: "insensitive",
          },
        },
        take: 10,
        select: { id: true, username: true },
      });
    } catch (error) {
      logger.error("❌ Error in searchUsersByUsername", error as Error, {
        operation: 'search_users_by_username_error',
        search: search
      });

      logger.error(
        error instanceof Error ? error.message : "Unknown error in searchUsersByUsername",
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: "searchUsersByUsername",
          action: "searchUsersByUsername",
          search,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          tags: ["users", "search", "server-action"],
        }
      );

      throw new Error("Что-то пошло не так при поиске пользователей");
    }
  },
  ["trainer-panel:user-search"],
  { revalidate: 60, tags: ["user-search"] },
);
