import { createAdminPanelLogger } from "@gafus/logger";
import { authOptions } from "@gafus/auth";
import { getAllUsers as getAllUsersFromCore } from "@gafus/core/services/adminUser";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

const logger = createAdminPanelLogger("get-all-users");

export async function getAllUsers() {
  const session = (await getServerSession(authOptions)) as {
    user: { id: string; username: string; role: string };
  } | null;

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
    redirect("/");
  }

  const result = await getAllUsersFromCore();
  if (!result.success) {
    logger.error("Ошибка при получении пользователей", new Error(result.error));
    throw new Error(result.error);
  }
  return result.data;
}
