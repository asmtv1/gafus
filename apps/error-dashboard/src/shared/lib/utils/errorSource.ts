import type { ErrorDashboardReport } from "@gafus/types";

/**
 * Проверяет, пришла ли запись от logger
 * Logger отправляет данные с url === '/logger' или userAgent === 'logger-service'
 */
export function isFromLogger(error: ErrorDashboardReport): boolean {
  return error.url === "/logger" || error.userAgent === "logger-service";
}

/**
 * Извлекает уровень логирования из записи
 * Проверяет additionalContext.level, затем tags[0]
 */
export function getLogLevel(error: ErrorDashboardReport): string | null {
  // Проверяем additionalContext.level
  if (error.additionalContext) {
    try {
      const context =
        typeof error.additionalContext === "string"
          ? JSON.parse(error.additionalContext)
          : error.additionalContext;

      if (context && typeof context === "object" && "level" in context) {
        const level = context.level;
        if (typeof level === "string") {
          return level.toLowerCase();
        }
      }

      // Для push-уведомлений может быть вложенный объект pushSpecific
      if (context && typeof context === "object" && "pushSpecific" in context) {
        const pushSpecific = (
          context as {
            pushSpecific?: { level?: string };
          }
        ).pushSpecific;
        if (pushSpecific?.level) {
          return pushSpecific.level.toLowerCase();
        }
      }
    } catch {
      // Игнорируем ошибки парсинга
    }
  }

  // Проверяем tags[0] (обычно там хранится level для logger)
  if (error.tags && error.tags.length > 0) {
    const firstTag = error.tags[0].toLowerCase();
    const validLevels = ["error", "fatal", "warn", "info", "debug"];
    if (validLevels.includes(firstTag)) {
      return firstTag;
    }
  }

  return null;
}

/**
 * Проверяет, является ли запись ошибкой
 * Ошибки: все от error-handling ИЛИ от logger только error/fatal уровни
 */
export function isError(error: ErrorDashboardReport): boolean {
  // Если запись не от logger, значит она от error-handling - это ошибка
  if (!isFromLogger(error)) {
    return true;
  }

  // Если от logger, проверяем уровень
  const level = getLogLevel(error);
  return level === "error" || level === "fatal";
}

/**
 * Проверяет, является ли запись логом
 * Логи: от logger только warn/info/debug уровни
 */
export function isLog(error: ErrorDashboardReport): boolean {
  // Только записи от logger могут быть логами
  if (!isFromLogger(error)) {
    return false;
  }

  const level = getLogLevel(error);
  return level === "warn" || level === "info" || level === "debug";
}
