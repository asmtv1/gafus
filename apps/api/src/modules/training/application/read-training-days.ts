/** AG1-001: ordinary training-day list READ; keep the Core order and DTO. */
import type { getTrainingDays } from "@gafus/core/services/training";

type TrainingDaysReader = typeof getTrainingDays;

export function createReadTrainingDaysApplication(dependencies: {
  readDays: TrainingDaysReader;
}) {
  return {
    execute({ actorUserId, courseType }: { actorUserId: string; courseType?: string }) {
      return dependencies.readDays(actorUserId, courseType);
    },
  };
}
