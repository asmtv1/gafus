/**
 * Telegram уведомления о критических ошибках
 *
 * Для работы необходимо настроить переменные окружения:
 * - TELEGRAM_ERROR_BOT_TOKEN - токен бота для уведомлений об ошибках
 * - TELEGRAM_ERROR_CHAT_ID - ID чата/группы для уведомлений
 */

import { createErrorDashboardLogger } from "@gafus/logger";

const logger = createErrorDashboardLogger("telegram-notifications");

interface ErrorNotification {
  id: string;
  message: string;
  appName: string;
  environment: string;
  url: string;
  stack?: string | null;
  userId?: string | null;
  tags?: string[];
  createdAt: Date;
}

/**
 * Определяет, является ли ошибка критической
 */
function isCriticalError(error: ErrorNotification): boolean {
  const message = error.message.toLowerCase();
  const tags = error.tags?.map((t) => t.toLowerCase()) || [];

  // Критические ключевые слова
  const criticalKeywords = [
    "critical",
    "fatal",
    "unhandledrejection",
    "uncaughtexception",
    "out of memory",
    "database connection",
    "connection refused",
    "authentication failed",
    "payment failed",
    "security",
  ];

  // Проверяем сообщение на критические ключевые слова
  if (criticalKeywords.some((keyword) => message.includes(keyword))) {
    return true;
  }

  // Проверяем теги на критические ключевые слова
  if (tags.some((tag) => criticalKeywords.some((keyword) => tag.includes(keyword)))) {
    return true;
  }

  // Проверяем уровень из тегов
  if (tags.includes("fatal") || tags.includes("critical") || tags.includes("error")) {
    return true;
  }

  return false;
}

/**
 * Форматирует ошибку для Telegram сообщения
 */
function formatTelegramMessage(error: ErrorNotification, dashboardUrl: string): string {
  const lines: string[] = [];

  lines.push(`🚨 <b>Новая ошибка в ${error.appName}</b>`);
  lines.push("");
  lines.push(`📋 <b>Сообщение:</b>`);
  lines.push(`<code>${escapeHtml(truncate(error.message, 200))}</code>`);
  lines.push("");
  lines.push(`🏷 <b>Приложение:</b> ${error.appName}`);
  lines.push(`🌍 <b>Окружение:</b> ${error.environment}`);
  lines.push(`🕐 <b>Время:</b> ${formatDate(error.createdAt)}`);

  if (error.userId) {
    lines.push(`👤 <b>User ID:</b> <code>${error.userId}</code>`);
  }

  if (error.tags && error.tags.length > 0) {
    lines.push(`🏷 <b>Теги:</b> ${error.tags.slice(0, 5).join(", ")}`);
  }

  if (error.stack) {
    lines.push("");
    lines.push(`📍 <b>Stack (первые 3 строки):</b>`);
    const stackLines = error.stack.split("\n").slice(0, 3).join("\n");
    lines.push(`<pre>${escapeHtml(truncate(stackLines, 300))}</pre>`);
  }

  lines.push("");
  lines.push(`🔗 <a href="${dashboardUrl}/errors/${error.id}">Открыть в Dashboard</a>`);

  return lines.join("\n");
}

/**
 * Экранирует HTML спецсимволы для Telegram
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Обрезает строку до указанной длины
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

/**
 * Форматирует дату
 */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(date);
}

/**
 * Отправляет уведомление в Telegram
 */
async function sendTelegramMessage(message: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_ERROR_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ERROR_CHAT_ID;

  if (!botToken || !chatId) {
    logger.warn("Telegram уведомления не настроены", {
      hasBotToken: !!botToken,
      hasChatId: !!chatId,
    });
    return false;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error("Ошибка отправки Telegram уведомления", new Error(JSON.stringify(errorData)), {
        statusCode: response.status,
      });
      return false;
    }

    logger.info("Telegram уведомление отправлено успешно");
    return true;
  } catch (error) {
    logger.error("Ошибка при отправке Telegram уведомления", error as Error);
    return false;
  }
}

/**
 * Отправляет уведомление о новой ошибке в Telegram (если критическая)
 */
export async function notifyAboutError(error: ErrorNotification): Promise<boolean> {
  // Проверяем, что уведомления включены
  const notificationsEnabled = process.env.ENABLE_TELEGRAM_ERROR_NOTIFICATIONS === "true";

  if (!notificationsEnabled) {
    return false;
  }

  // В production отправляем только критические ошибки
  // В development можно отправлять все (для тестирования)
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && !isCriticalError(error)) {
    return false;
  }

  // Формируем URL для dashboard
  const dashboardUrl = process.env.ERROR_DASHBOARD_URL || "https://monitor.gafus.ru";

  // Форматируем и отправляем сообщение
  const message = formatTelegramMessage(error, dashboardUrl);
  return await sendTelegramMessage(message);
}

/**
 * Отправляет тестовое уведомление (для проверки настройки)
 */
export async function sendTestNotification(): Promise<boolean> {
  const dashboardUrl = process.env.ERROR_DASHBOARD_URL || "https://monitor.gafus.ru";
  const message = `✅ <b>Тест уведомлений</b>\n\nError Dashboard подключен и готов отправлять уведомления о критических ошибках.\n\n🔗 <a href="${dashboardUrl}">Открыть Dashboard</a>`;

  return await sendTelegramMessage(message);
}
