"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateDayStatusFromStatuses = calculateDayStatusFromStatuses;
const training_status_1 = require("../utils/training-status");
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
function calculateDayStatusFromStatuses(stepStatuses) {
  if (stepStatuses.length === 0) {
    return training_status_1.TrainingStatus.NOT_STARTED;
  }
  const normalized = stepStatuses.map((s) => String(s));
  // Все шаги завершены
  if (normalized.every((s) => s === training_status_1.TrainingStatus.COMPLETED)) {
    return training_status_1.TrainingStatus.COMPLETED;
  }
  // Есть хотя бы один активный шаг (IN_PROGRESS, PAUSED или COMPLETED)
  // КРИТИЧНО: PAUSED должен проверяться, иначе будет рассинхронизация!
  if (
    normalized.some(
      (s) =>
        s === training_status_1.TrainingStatus.IN_PROGRESS ||
        s === "PAUSED" ||
        s === training_status_1.TrainingStatus.COMPLETED,
    )
  ) {
    return training_status_1.TrainingStatus.IN_PROGRESS;
  }
  return training_status_1.TrainingStatus.NOT_STARTED;
}
//# sourceMappingURL=statusCalculations.js.map
