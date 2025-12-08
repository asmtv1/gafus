import type { ErrorDashboardReport } from "@gafus/types";
import { format } from "date-fns";

interface ContainerLogAdditionalContext {
  container?: {
    name: string;
    id: string;
    timestamp: string;
    raw: string;
    caller?: string;
    originalMsg?: string;
  };
  parsed?: {
    level: string;
    timestamp?: string;
    caller?: string;
    msg?: string;
  };
  pino?: {
    level: number | string;
    time: string;
    pid: number;
    hostname: string;
    context?: string;
    err?: unknown;
  };
  [key: string]: unknown;
}

/**
 * Извлекает имя контейнера из additionalContext
 */
export function parseContainerName(context: ContainerLogAdditionalContext): string {
  if (context?.container?.name) {
    const name = context.container.name;
    // Если это ID контейнера (12 символов hex), оставляем как есть
    // (имя уже должно быть получено через Docker API в loki-client)
    return name;
  }
  return "unknown";
}

/**
 * Извлекает уровень лога из additionalContext
 */
export function parseLogLevel(context: ContainerLogAdditionalContext, tags?: string[]): string {
  // Сначала проверяем parsed.level
  if (context?.parsed?.level) {
    return context.parsed.level;
  }

  // Затем проверяем pino.level
  if (context?.pino?.level) {
    const pinoLevel = context.pino.level;
    const levelMap: Record<string, string> = {
      "10": "debug",
      "20": "info",
      "30": "warn",
      "40": "error",
      "50": "fatal",
    };
    if (typeof pinoLevel === "number") {
      return levelMap[String(pinoLevel)] || String(pinoLevel);
    }
    if (typeof pinoLevel === "string") {
      return levelMap[pinoLevel] || pinoLevel;
    }
  }

  // Проверяем теги
  if (tags) {
    const levelTag = tags.find((tag) =>
      ["debug", "info", "warn", "error", "fatal"].includes(tag)
    );
    if (levelTag) return levelTag;
  }

  return "info";
}

/**
 * Возвращает цвет для уровня лога
 */
export function getLogLevelColor(level: string): string {
  const levelMap: Record<string, string> = {
    debug: "#90a4ae",
    info: "#7986cb",
    warn: "#ffb74d",
    warning: "#ffb74d",
    error: "#f48fb1",
    fatal: "#e91e63",
    "10": "#90a4ae",
    "20": "#7986cb",
    "30": "#ffb74d",
    "40": "#f48fb1",
    "50": "#e91e63",
  };
  return levelMap[level.toLowerCase()] || "#90a4ae";
}

/**
 * Форматирует одну строку лога для отображения в консоли
 */
export function formatLogLine(log: ErrorDashboardReport): string {
  const context = log.additionalContext as ContainerLogAdditionalContext;
  const containerName = parseContainerName(context);
  const level = parseLogLevel(context, log.tags);
  const timestamp = format(new Date(log.createdAt), "HH:mm:ss.SSS");

  // Извлекаем сообщение
  let message = log.message;
  if (context?.parsed?.msg) {
    message = context.parsed.msg;
  } else if (context?.container?.originalMsg) {
    message = context.container.originalMsg;
  }

  return `[${timestamp}] [${level.toUpperCase().padEnd(5)}] [${containerName.padEnd(20)}] ${message}`;
}

/**
 * Извлекает текст сообщения из лога
 */
export function getLogMessage(log: ErrorDashboardReport): string {
  const context = log.additionalContext as ContainerLogAdditionalContext;
  if (context?.parsed?.msg) {
    return context.parsed.msg;
  }
  if (context?.container?.originalMsg) {
    return context.container.originalMsg;
  }
  return log.message;
}

