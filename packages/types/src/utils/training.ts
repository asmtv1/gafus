// Типы для утилит тренировок
import type { UserCoursePersonalization } from "../data/training";
import type { TrainingStatus } from "./training-status";

export interface TrainingDayUtil {
  day: number;
  title: string;
  userStatus: TrainingStatus;
  courseId: string;
}

/** Тип шага тренировки с прогрессом пользователя */
export interface TrainingStep {
  id: string;
  videoUrl: string | null;
  pdfUrls?: string[];
  imageUrls?: string[];
  title: string;
  description: string;
  durationSec: number;
  estimatedDurationSec?: number | null;
  status: TrainingStatus;
  order: number;
  // Доп. поля с серверной паузой (не влияют на TrainingStatus)
  isPausedOnServer?: boolean;
  remainingSecOnServer?: number;

  // Новые поля для типов экзамена
  type?: "TRAINING" | "EXAMINATION" | "THEORY" | "BREAK" | "PRACTICE" | "DIARY";
  checklist?: any; // JSON с тестовыми вопросами
  requiresVideoReport?: boolean;
  requiresWrittenFeedback?: boolean;
  hasTestQuestions?: boolean;

  // ID пользовательского шага для экзаменов
  userStepId?: string;
}

/** Результат getTrainingDays — дни курса или гайд (isGuide/guideContent) */
export interface GetTrainingDaysResult {
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
    showCoursePathExport: boolean;
  }[];
  courseDescription: string | null;
  courseId: string | null;
  courseVideoUrl: string | null;
  courseEquipment: string | null;
  courseTrainingLevel: string | null;
  courseIsPersonalized: boolean;
  userCoursePersonalization: UserCoursePersonalization | null;
  isGuide?: boolean;
  guideContent?: string | null;
}

/** Полная информация о тренировочном дне + шаги + статус пользователя */
export interface TrainingDetail {
  trainingDayId: string;
  dayOnCourseId: string;
  displayDayNumber?: number | null; // Опциональное поле только для отображения номера дня
  title: string;
  type: string;
  showCoursePathExport?: boolean;
  courseId: string;
  description: string;
  duration: string;
  userStatus: TrainingStatus;
  steps: TrainingStep[];
}
