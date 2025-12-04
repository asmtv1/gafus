"use server";

// Этот файл больше не используется - все логи теперь в Loki
// Оставлен для обратной совместимости, но функции не работают

export async function reportError() {
  return { success: false, error: "Логи теперь отправляются в Loki через @gafus/logger" };
}

export async function getErrors() {
  return { success: false, error: "Используйте getLokiErrors из loki-errors.ts" };
}

export async function getErrorStats() {
  return { success: false, error: "Статистика теперь из Loki" };
}

export async function deleteError() {
  return { success: false, error: "Логи в Loki, удаление через Grafana или Loki API" };
}

export async function deleteAllErrors() {
  return { success: false, error: "Логи в Loki, удаление через Grafana или Loki API" };
}
