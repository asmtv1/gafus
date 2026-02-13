import { TrainingStatus } from "@gafus/types";
import type { TrainingDetail, UserCoursePersonalization } from "@gafus/types";
/**
 * Получить дни тренировок курса
 */
export declare function getTrainingDays(
  userId: string,
  courseType?: string,
): Promise<{
  trainingDays: {
    trainingDayId: string;
    dayOnCourseId: string;
    title: string;
    type: string;
    courseId: string;
    userStatus: TrainingStatus;
    estimatedDuration: number;
    theoryMinutes: number;
    equipment: string;
    isLocked: boolean;
  }[];
  courseDescription: string | null;
  courseId: string | null;
  courseVideoUrl: string | null;
  courseEquipment: string | null;
  courseTrainingLevel: string | null;
  courseIsPersonalized: boolean;
  userCoursePersonalization: UserCoursePersonalization | null;
}>;
/**
 * Получить детали дня тренировки с шагами пользователя
 */
export declare function getTrainingDayWithUserSteps(
  userId: string,
  courseType: string,
  dayOnCourseId: string,
  options?: {
    createIfMissing?: boolean;
  },
): Promise<TrainingDetail | null>;
//# sourceMappingURL=trainingService.d.ts.map
