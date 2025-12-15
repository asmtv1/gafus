import type { TrainingDetail } from "@gafus/types";
/**
 * Вычисляет общую продолжительность тренировочного дня в минутах.
 * @param training - Объект TrainingDetail, содержащий шаги тренировки.
 * @returns Продолжительность в минутах.
 */
export function calculateDuration(training: TrainingDetail): number {
  const totalSeconds = training.steps
    .filter(step => step.type !== "BREAK")
    .reduce((sum, step) => sum + step.durationSec, 0);
  return Math.ceil(totalSeconds / 60);
}
