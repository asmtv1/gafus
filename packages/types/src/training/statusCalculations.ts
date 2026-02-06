import { TrainingStatus } from "../utils/training-status";

/**
 * Единая логика расчета статуса дня на основе статусов шагов
 * Используется на клиенте и сервере для обеспечения консистентности
 *
 * Правила:
 * - COMPLETED: все шаги COMPLETED
 * - IN_PROGRESS: есть хотя бы один IN_PROGRESS, PAUSED или COMPLETED
 * - NOT_STARTED: все шаги NOT_STARTED или пустой массив
 *
 * ВАЖНО: PAUSED шаги считаются как IN_PROGRESS для расчета статуса дня
 * Это критично для синхронизации клиента и сервера!
 */
export function calculateDayStatusFromStatuses(
  stepStatuses: (string | TrainingStatus)[],
): TrainingStatus {
  if (stepStatuses.length === 0) {
    return TrainingStatus.NOT_STARTED;
  }

  const normalized = stepStatuses.map((s) => String(s));

  // Все шаги завершены
  if (normalized.every((s) => s === TrainingStatus.COMPLETED)) {
    return TrainingStatus.COMPLETED;
  }

  // Есть хотя бы один активный шаг (IN_PROGRESS, PAUSED или COMPLETED)
  // КРИТИЧНО: PAUSED должен проверяться, иначе будет рассинхронизация!
  if (
    normalized.some(
      (s) => s === TrainingStatus.IN_PROGRESS || s === "PAUSED" || s === TrainingStatus.COMPLETED,
    )
  ) {
    return TrainingStatus.IN_PROGRESS;
  }

  // Есть хотя бы один RESET (нет активных) → день RESET
  if (normalized.some((s) => s === TrainingStatus.RESET || s === "RESET")) {
    return TrainingStatus.RESET;
  }

  return TrainingStatus.NOT_STARTED;
}
