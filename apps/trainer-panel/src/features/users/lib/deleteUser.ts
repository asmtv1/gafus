
import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";

export async function deleteUser(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const session = (await getServerSession(authOptions)) as { user: { id: string; username: string; role: string } } | null;

  if (!session?.user?.id) {
    return { success: false, error: "Не авторизован" };
  }

  // Проверяем, что пользователь является админом или модератором
  if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
    return { success: false, error: "Недостаточно прав" };
  }

  try {
    const userId = formData.get("userId") as string;

    if (!userId) {
      return { success: false, error: "ID пользователя обязателен" };
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    return { success: true };
  } catch (error) {
    console.error("Ошибка при удалении пользователя:", error);
    return { success: false, error: "Не удалось удалить пользователя" };
  }
}
