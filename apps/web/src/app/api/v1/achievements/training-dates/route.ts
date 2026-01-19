/**
 * API Route: GET /api/v1/achievements/training-dates
 * 
 * Получает уникальные даты тренировок пользователя для подсчёта серий.
 * Используется React Native приложением.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getUserTrainingDates } from "@gafus/core/services/achievements";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger('api-achievements');

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Не авторизован" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const dates = await getUserTrainingDates(userId);

    return NextResponse.json(
      { success: true, data: dates },
      {
        headers: {
          // Cache-Control для клиентского кэширования
          "Cache-Control": "private, max-age=300", // 5 минут
        },
      }
    );
  } catch (error) {
    logger.error("Error in training-dates API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
