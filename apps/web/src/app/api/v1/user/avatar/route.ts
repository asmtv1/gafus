/**
 * API Route: POST /api/v1/user/avatar
 *
 * Обновляет аватар пользователя.
 * Принимает FormData с файлом.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { updateAvatar } from "@gafus/core/services/user";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-user-avatar");

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const POST = withCSRFProtection(async (request: NextRequest) => {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "Файл не найден" }, { status: 400 });
    }

    // Валидация типа файла
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "Неподдерживаемый тип файла. Разрешены: JPEG, PNG, WebP, GIF" },
        { status: 400 },
      );
    }

    // Валидация размера файла
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "Файл слишком большой. Максимум 5MB" },
        { status: 400 },
      );
    }

    const avatarUrl = await updateAvatar(userId, file);

    return NextResponse.json({ success: true, data: { avatarUrl } });
  } catch (error) {
    logger.error("Error in avatar upload API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
});
