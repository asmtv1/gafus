import { createAdminPanelLogger } from "@gafus/logger";
import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

const logger = createAdminPanelLogger("api-users");

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getServerSession(authOptions)) as {
      user: { id: string; username: string; role: string };
    } | null;

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем, что пользователь является админом или модератором
    if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
      return NextResponse.json({ success: false, error: "Недостаточно прав" }, { status: 403 });
    }

    const params = await context.params;
    const userId = params.id;
    const body = await request.json();

    const { username, phone, role, newPassword } = body;

    const updateData: Record<string, unknown> = {};
    if (username) updateData.username = username;
    if (phone) updateData.phone = phone;
    if (role) updateData.role = role;

    // Обработка нового пароля
    if (newPassword && typeof newPassword === "string" && newPassword.trim()) {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      updateData.password = hashedPassword;
      logger.info("Пароль пользователя будет обновлен", { userId });
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Ошибка при обновлении пользователя:", error as Error);
    return NextResponse.json(
      { success: false, error: "Не удалось обновить пользователя" },
      { status: 500 },
    );
  }
}
