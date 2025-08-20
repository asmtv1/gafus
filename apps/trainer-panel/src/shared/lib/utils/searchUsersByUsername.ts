"use server";

import { prisma } from "@gafus/prisma";
import { reportErrorToDashboard } from "@shared/lib/actions/reportError";
import { unstable_cache } from "next/cache";

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
      console.error("❌ Error in searchUsersByUsername:", error);

      await reportErrorToDashboard({
        message: error instanceof Error ? error.message : "Unknown error in searchUsersByUsername",
        stack: error instanceof Error ? error.stack : undefined,
        appName: "trainer-panel",
        environment: process.env.NODE_ENV || "development",
        additionalContext: {
          action: "searchUsersByUsername",
          search,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
        tags: ["users", "search", "server-action"],
      });

      throw new Error("Что-то пошло не так при поиске пользователей");
    }
  },
  ["trainer-panel:user-search"],
  { revalidate: 60, tags: ["user-search"] },
);
