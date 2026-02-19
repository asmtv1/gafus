"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { unstable_cache } from "next/cache";
import { searchStudentsByUsername as searchStudentsByUsernameCore } from "@gafus/core/services/user";

const logger = createTrainerPanelLogger("trainer-panel-search-students");

export const searchStudentsByUsername = unstable_cache(
  async (search: string) => {
    try {
      return await searchStudentsByUsernameCore(search, 10);
    } catch (error) {
      logger.error("Ошибка поиска учеников по username", error as Error, {
        operation: "search_students_by_username_error",
        search,
      });
      throw new Error("Что-то пошло не так при поиске учеников");
    }
  },
  ["trainer-panel:student-search"],
  { revalidate: 60, tags: ["user-search"] },
);
