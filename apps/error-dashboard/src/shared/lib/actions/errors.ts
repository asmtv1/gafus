"use server";

// Этот файл больше не используется - все логи теперь в Seq
// Оставлен для обратной совместимости, но функции не работают

export async function reportError() {
  return { success: false, error: "Логи теперь отправляются в Seq через @gafus/logger" };
}

export async function getErrors() {
  return { success: false, error: "Используйте getSeqErrors из seq-errors.ts" };
}

export async function getErrorStats() {
  return { success: false, error: "Статистика теперь из Seq" };
}

export async function deleteError() {
  return { success: false, error: "Логи в Seq, удаление через Seq UI или API" };
}

export async function deleteAllErrors() {
  return { success: false, error: "Логи в Seq, удаление через Seq UI или API" };
}
