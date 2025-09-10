// Типы для стейт-менеджмента тренировок

export type DayStatus = "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED";

export interface TrainingState {
  // Состояние дней (изолированно по курсам)
  openIndexes: Record<string, number | null>;
  runningSteps: Record<string, number | null>;
  courseAssignments: Record<string, boolean>;
  assignErrors: Record<string, string | null>;
  
  // Кэширование дней тренировок
  cachedTrainingDays: Record<string, {
    data: {
      trainingDays: {
        day: number;
        title: string;
        type: string;
        courseId: string;
        userStatus: string;
      }[];
      courseDescription: string | null;
      courseId: string | null;
      courseVideoUrl: string | null;
    };
    timestamp: number;
  }>;

  // Утилиты
  getStepKey: (courseId: string, day: number, stepIndex: number) => string;
  getDayKey: (courseId: string, day: number) => string;

  // Геттеры
  getOpenIndex: (courseId: string, day: number) => number | null;
  getRunningIndex: (courseId: string, day: number) => number | null;
  getCourseAssigned: (courseId: string) => boolean;
  getAssignError: (courseId: string) => string | null;
  
  // Кэширование дней тренировок
  getCachedTrainingDays: (courseType: string) => {
    data: {
      trainingDays: {
        day: number;
        title: string;
        type: string;
        courseId: string;
        userStatus: string;
      }[];
      courseDescription: string | null;
      courseId: string | null;
      courseVideoUrl: string | null;
    } | null;
    isExpired: boolean;
  };
  setCachedTrainingDays: (courseType: string, data: {
    trainingDays: {
      day: number;
      title: string;
      type: string;
      courseId: string;
      userStatus: string;
    }[];
    courseDescription: string | null;
    courseId: string | null;
    courseVideoUrl: string | null;
  }) => void;
  clearCachedTrainingDays: (courseType?: string) => void;


  // Действия для дня
  setOpenIndex: (courseId: string, day: number, index: number | null) => void;
  setRunningIndex: (courseId: string, day: number, index: number | null) => void;
  setCourseAssigned: (courseId: string, assigned: boolean) => void;
  setAssignError: (courseId: string, error: string | null) => void;

  // Поиск активного шага
  findRunningStepIndex: (courseId: string, day: number, totalSteps: number) => number | null;

  // Серверные действия
  togglePauseWithServer: (courseId: string, day: number, stepIndex: number) => Promise<void>;
  resumeNotificationWithServer: (courseId: string, day: number, stepIndex: number) => Promise<void>;
}
