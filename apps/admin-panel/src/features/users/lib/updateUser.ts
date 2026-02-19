"use server";

import { z } from "zod";

import { createAdminPanelLogger } from "@gafus/logger";
import { authOptions } from "@gafus/auth";
import { updateUserAdmin } from "@gafus/core/services/adminUser";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

const logger = createAdminPanelLogger("update-user");

const updateUserSchema = z.object({
  id: z.string().min(1, "ID обязателен"),
  username: z.string().min(1).optional(),
  phone: z.string().optional(),
  role: z.enum(["ADMIN", "MODERATOR", "TRAINER", "USER"]).optional(),
  newPassword: z.string().min(6, "Пароль минимум 6 символов").optional(),
});

export async function updateUser(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = (await getServerSession(authOptions)) as {
      user: { id: string; username: string; role: string };
    } | null;

    if (!session?.user?.id) {
      return { success: false, error: "Не авторизован" };
    }

    if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
      return { success: false, error: "Недостаточно прав" };
    }

    const parsed = updateUserSchema.safeParse({
      id: formData.get("id"),
      username: formData.get("username"),
      phone: formData.get("phone"),
      role: formData.get("role"),
      newPassword: formData.get("newPassword"),
    });

    if (!parsed.success) {
      const firstError = parsed.error.flatten().fieldErrors;
      const msg = Object.values(firstError).flat().join(", ") || "Ошибка валидации";
      return { success: false, error: msg };
    }

    const { id, username, phone, role, newPassword } = parsed.data;

    const result = await updateUserAdmin(id, {
      username,
      phone,
      role,
      newPassword,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    revalidatePath("/main-panel/users");
    return { success: true };
  } catch (error) {
    logger.error("Ошибка при обновлении пользователя", error as Error);

    if (
      error instanceof Error &&
      error.message.includes("headers was called outside a request scope")
    ) {
      return {
        success: false,
        error: "Ошибка аутентификации. Попробуйте перезагрузить страницу.",
      };
    }

    return { success: false, error: "Не удалось обновить пользователя" };
  }
}
