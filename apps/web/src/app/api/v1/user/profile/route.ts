/**
 * API Route: /api/v1/user/profile
 *
 * GET - Получает профиль текущего пользователя
 * PATCH - Обновляет профиль текущего пользователя
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { getUserProfile, updateUserProfile } from "@gafus/core/services/user";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

const logger = createWebLogger("api-user-profile");

// GET - Получить профиль
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const profile = await getUserProfile(userId);

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    logger.error("Error in profile GET API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}

// PATCH - Обновить профиль
const updateSchema = z.object({
  fullName: z.string().optional(),
  about: z.string().optional(),
  telegram: z.string().optional(),
  instagram: z.string().optional(),
  website: z.string().optional(),
  birthDate: z.string().optional(),
});

export const PATCH = withCSRFProtection(async (request: NextRequest) => {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const data = updateSchema.parse(body);

    const profile = await updateUserProfile(userId, data);

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Неверные данные запроса", details: error.errors },
        { status: 400 },
      );
    }

    logger.error("Error in profile PATCH API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
});
