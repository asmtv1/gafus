import { NextRequest, NextResponse } from "next/server";
import { trackReengagementClick } from "@shared/lib/actions/trackReengagementClick";

/**
 * API endpoint для отслеживания кликов по re-engagement уведомлениям
 * Вызывается из Service Worker
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { notificationId } = body;

    if (!notificationId) {
      return NextResponse.json(
        { error: "ID уведомления не указан" },
        { status: 400 }
      );
    }

    const result = await trackReengagementClick(notificationId);

    if (result.success) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: result.error || "Ошибка трекинга" },
      { status: 500 }
    );
  } catch (error) {
    console.error("API: Error tracking reengagement click:", error);
    
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

