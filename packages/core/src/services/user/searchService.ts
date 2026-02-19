/**
 * Поиск пользователей по username (чистая бизнес-логика, без Next.js).
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("user-search");

const DEFAULT_LIMIT = 10;

export interface UserSearchItem {
  id: string;
  username: string;
}

/**
 * Поиск пользователей по username (все роли).
 */
export async function searchUsersByUsername(
  search: string,
  limit: number = DEFAULT_LIMIT,
): Promise<UserSearchItem[]> {
  try {
    if (!search.trim()) return [];
    const users = await prisma.user.findMany({
      where: {
        username: { contains: search, mode: "insensitive" },
      },
      take: limit,
      select: { id: true, username: true },
    });
    return users;
  } catch (error) {
    logger.error("Ошибка поиска пользователей по username", error as Error, {
      search,
      limit,
    });
    throw error;
  }
}

/**
 * Поиск учеников (роль USER) по username.
 */
export async function searchStudentsByUsername(
  search: string,
  limit: number = DEFAULT_LIMIT,
): Promise<UserSearchItem[]> {
  try {
    if (!search.trim()) return [];
    const users = await prisma.user.findMany({
      where: {
        username: { contains: search, mode: "insensitive" },
        role: "USER",
      },
      take: limit,
      select: { id: true, username: true },
    });
    return users;
  } catch (error) {
    logger.error("Ошибка поиска учеников по username", error as Error, {
      search,
      limit,
    });
    throw error;
  }
}

/**
 * Получение учеников по списку ID (только роль USER).
 */
export async function getStudentsByIds(studentIds: string[]): Promise<UserSearchItem[]> {
  try {
    if (!studentIds?.length) return [];
    const students = await prisma.user.findMany({
      where: {
        id: { in: studentIds },
        role: "USER",
      },
      select: { id: true, username: true },
    });
    return students;
  } catch (error) {
    logger.error("Ошибка получения учеников по ID", error as Error, { studentIds });
    throw error;
  }
}
