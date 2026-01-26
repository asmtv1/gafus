"use server";

import { prisma } from "@gafus/prisma";
import { createTrainerPanelLogger } from "@gafus/logger";
import { unstable_cache } from "next/cache";

// Создаем логгер для searchStudentsByUsername
const logger = createTrainerPanelLogger("trainer-panel-search-students");

export const searchStudentsByUsername = unstable_cache(
  async (search: string) => {
    try {
      if (!search.trim()) return [];
      return prisma.user.findMany({
        where: {
          username: {
            contains: search,
            mode: "insensitive",
          },
          role: "USER", // Только ученики
        },
        take: 10,
        select: { id: true, username: true },
      });
    } catch (error) {
      logger.error("❌ Error in searchStudentsByUsername", error as Error, {
        operation: "search_students_by_username_error",
        search: search,
      });

      logger.error(
        error instanceof Error ? error.message : "Unknown error in searchStudentsByUsername",
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: "searchStudentsByUsername",
          action: "searchStudentsByUsername",
          search,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          tags: ["users", "search", "students", "server-action"],
        },
      );

      throw new Error("Что-то пошло не так при поиске учеников");
    }
  },
  ["trainer-panel:student-search"],
  { revalidate: 60, tags: ["user-search"] },
);
