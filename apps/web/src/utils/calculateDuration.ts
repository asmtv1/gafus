import type { TrainingDetail } from "@/types/training";
export function calculateDuration(training: TrainingDetail): number {
  const totalSeconds = training.steps.reduce(
    (sum, step) => sum + step.durationSec,
    0
  );
  return Math.ceil(totalSeconds / 60);
}
