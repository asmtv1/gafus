/**
 * API Route: GET /api/v1/user/profile/public
 * 
 * Получает публичный профиль пользователя по username.
 * Публичный endpoint (не требует авторизации).
 */

import { NextRequest, NextResponse } from "next/server";
import { getPublicProfile } from "@gafus/core/services/user";
import { createWebLogger } from "@gafus/logger";
import { prisma } from "@gafus/prisma";

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
    const user = await prisma.user.findUnique({
      where: { username: profile.username },
      select: { profile: { select: { city: true } } },
    });
    const publicProfile = {
      ...profile,
      profile: profile.profile
        ? { ...profile.profile, city: user?.profile?.city ?? null }
        : null,
    };

    return NextResponse.json(
      { success: true, data: publicProfile },
      {
        headers: {
          "Cache-Control": "no-store",
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
