import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth/auth";

/**
 * Проверяет, является ли текущий пользователь владельцем профиля.
 */
export async function getIsOwner(profileUsername: string): Promise<boolean> {
  try {
    const session: Session | null = await getServerSession(authOptions);
    const currentUsername = session?.user?.username;
    return currentUsername === profileUsername;
  } catch (error) {
    console.error("Ошибка в getIsOwner:", error);
    throw new Error("Не удалось проверить владельца профиля");
  }
}
