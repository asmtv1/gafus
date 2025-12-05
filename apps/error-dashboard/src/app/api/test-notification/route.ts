import { NextResponse } from "next/server";
import { sendTestNotification } from "@shared/lib/telegram-notifications";

/**
 * POST /api/test-notification
 * Отправляет тестовое уведомление в Telegram для проверки настройки
 */
export async function POST() {
  try {
    const success = await sendTestNotification();
    
    if (success) {
      return NextResponse.json({
        success: true,
        message: "Тестовое уведомление отправлено в Telegram",
      });
    } else {
      return NextResponse.json({
        success: false,
        error: "Не удалось отправить уведомление. Проверьте настройки TELEGRAM_ERROR_BOT_TOKEN и TELEGRAM_ERROR_CHAT_ID",
      }, { status: 500 });
    }
  } catch (error) {
    console.error("Error sending test notification:", error);
    return NextResponse.json({
      success: false,
      error: "Ошибка при отправке тестового уведомления",
    }, { status: 500 });
  }
}











