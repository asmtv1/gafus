import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { trackReengagementClick } from "@gafus/core/services/tracking";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-track-reengagement-click");

/**
 * API endpoint для отслеживания кликов по re-engagement уведомлениям
 * Вызывается из Service Worker
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { notificationId } = body;

    if (!notificationId) {
      return NextResponse.json({ error: "ID уведомления не указан" }, { status: 400 });
    }

    const result = await trackReengagementClick(notificationId);

    if (result.success) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: result.error || "Ошибка трекинга" }, { status: 500 });
  } catch (error) {
    logger.error("API: Error tracking reengagement click", error as Error);

    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
