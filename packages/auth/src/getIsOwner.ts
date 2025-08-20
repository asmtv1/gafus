import type { NextApiRequest } from "next";

/**
 * Проверяет, является ли текущий пользователь владельцем профиля.
 * Совместимо с Edge Runtime.
 */
export async function getIsOwner(profileUsername: string, req?: NextApiRequest): Promise<boolean> {
  try {
    if (!profileUsername) {
      return false;
    }

    let username: string | undefined;

    // Если передан req, пытаемся получить username из query
    if (req?.query?.username) {
      username = Array.isArray(req.query.username) ? req.query.username[0] : req.query.username;
    }

    // Если username не найден в query, получаем из сессии
    if (!username) {
      const { getServerSession } = await import("next-auth");
      const { authOptions } = await import("./auth");
      const session = await getServerSession(authOptions);
      username = session?.user?.username;
    }

    return username?.toLowerCase() === profileUsername.toLowerCase();
  } catch (error) {
    console.error("Error in getIsOwner:", error);
    return false;
  }
}
