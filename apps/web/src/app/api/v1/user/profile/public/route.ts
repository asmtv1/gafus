/**
 * API Route: GET /api/v1/user/profile/public
 * 
 * Получает публичный профиль пользователя по username.
 * Публичный endpoint (не требует авторизации).
 */

import { NextRequest, NextResponse } from "next/server";
import { getPublicProfile } from "@gafus/core/services/user";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger('api-public-profile');

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get("username");

    if (!username) {
      return NextResponse.json(
        { success: false, error: "Требуется username" },
        { status: 400 }
      );
    }

    const profile = await getPublicProfile(username);

    if (!profile) {
      return NextResponse.json(
        { success: false, error: "Профиль не найден" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, data: profile },
      {
        headers: {
          "Cache-Control": "public, max-age=300", // 5 минут
        },
      }
    );
  } catch (error) {
    logger.error("Error in public profile API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
