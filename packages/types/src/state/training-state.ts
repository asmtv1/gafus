// State shape для тренировок (БЕЗ методов)

import type { UserCoursePersonalization } from "../data/training";
import type { TrainingStatus } from "../utils/training-status";

export type DayStatus = "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED";

export interface TrainingStateData {
  // Состояние дней (изолированно по курсам)
  openIndexes: Record<string, number | null>;
  runningSteps: Record<string, number | null>;
  courseAssignments: Record<string, boolean>;
  assignErrors: Record<string, string | null>;

  // Кэширование дней тренировок
  cachedTrainingDays: Record<
    string,
    {
      data: {
        trainingDays: {
          dayOnCourseId: string;
          title: string;
          type: string;
          courseId: string;
          userStatus: TrainingStatus | string; // Поддержка обоих типов для совместимости
        }[];
        courseDescription: string | null;
        courseId: string | null;
        courseVideoUrl: string | null;
        courseIsPersonalized?: boolean;
        userCoursePersonalization?: UserCoursePersonalization | null;
      };
      timestamp: number;
    }
  >;
}
