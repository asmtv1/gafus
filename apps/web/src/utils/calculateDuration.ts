import type { TrainingDetail } from "@gafus/types";
/**
 * Вычисляет общую продолжительность тренировочного дня в минутах.
 * Учитывает все типы шагов: TRAINING (durationSec), PRACTICE (estimatedDurationSec),
 * THEORY/EXAMINATION (estimatedDurationSec). BREAK не учитывается.
 * @param training - Объект TrainingDetail, содержащий шаги тренировки.
 * @returns Продолжительность в минутах.
 */
export function calculateDuration(training: TrainingDetail): number {
  const totalSeconds = training.steps.reduce((sum, step) => {
    if (step.type === "BREAK") {
      // BREAK не учитывается в расчётах времени
      return sum;
    }
    if (step.type === "TRAINING") {
      return sum + (step.durationSec ?? 0);
    }
    if (step.type === "PRACTICE") {
      // PRACTICE учитывается через estimatedDurationSec
      return sum + (step.estimatedDurationSec ?? 0);
    }
    // THEORY, EXAMINATION и другие типы учитываются через estimatedDurationSec
    return sum + (step.estimatedDurationSec ?? 0);
  }, 0);
  return Math.ceil(totalSeconds / 60);
}
