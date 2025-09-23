import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { createTrainerPanelLogger } from "@gafus/logger";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

// Создаем логгер для trainer-panel API
const logger = createTrainerPanelLogger('trainer-panel-api-users');

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let id: string | undefined;
  try {
    const resolvedParams = await params;
    id = resolvedParams.id;
    const session = (await getServerSession(authOptions)) as {
      user: { id: string; username: string; role: string };
    } | null;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем, что пользователь является админом или модератором
    if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const body = await request.json();
    const { username, phone, role } = body;

    if (!id) {
      return NextResponse.json({ error: "ID пользователя обязателен" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (username !== undefined) updateData.username = username;
    if (phone !== undefined) updateData.phone = phone;
    if (role !== undefined) updateData.role = role;

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    logger.error("Ошибка при обновлении пользователя", error as Error, {
      userId: id,
      operation: 'update_user',
      endpoint: '/api/users/[id]'
    });
    return NextResponse.json({ error: "Не удалось обновить пользователя" }, { status: 500 });
  }
}
