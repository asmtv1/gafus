"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { unstable_cache } from "next/cache";
import { searchUsersByUsername as searchUsersByUsernameCore } from "@gafus/core/services/user";

const logger = createTrainerPanelLogger("trainer-panel-search-users");

export const searchUsersByUsername = unstable_cache(
  async (search: string) => {
    try {
      return await searchUsersByUsernameCore(search, 10);
    } catch (error) {
      logger.error("Ошибка поиска пользователей по username", error as Error, {
        operation: "search_users_by_username_error",
        search,
      });
      throw new Error("Что-то пошло не так при поиске пользователей");
    }
  },
  ["trainer-panel:user-search"],
  { revalidate: 60, tags: ["user-search"] },
);
