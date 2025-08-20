
import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

export async function getAllUsers() {
  const session = (await getServerSession(authOptions)) as { user: { id: string; username: string; role: string } } | null;

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Проверяем, что пользователь является админом или модератором
  if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
    redirect("/main-panel");
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        phone: true,
        role: true,
        isConfirmed: true,
        createdAt: true,
        profile: {
          select: {
            fullName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return users;
  } catch (error) {
    console.error("Ошибка при получении пользователей:", error);
    throw new Error("Не удалось получить список пользователей");
  }
}
