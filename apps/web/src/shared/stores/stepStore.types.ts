// Store типы для stepStore

export interface StepState {
  timeLeft: number;
  isFinished: boolean;
  isPaused: boolean;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED";
}

export interface StepStore {
  // Состояние
  stepStates: Record<string, StepState>;

  // Утилиты
  getStepKey: (courseId: string, dayOnCourseId: string, stepIndex: number) => string;

  // Действия для шагов
  initializeStep: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    durationSec: number,
    initialStatus?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED",
    options?: { serverPaused?: boolean; serverRemainingSec?: number },
  ) => void;
  startStep: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    durationSec: number,
  ) => Promise<boolean>;
  pauseStep: (courseId: string, dayOnCourseId: string, stepIndex: number) => Promise<void>;
  resumeStep: (courseId: string, dayOnCourseId: string, stepIndex: number) => void;
  finishStep: (courseId: string, dayOnCourseId: string, stepIndex: number) => void;
  resetStep: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    durationSec: number,
  ) => void;
  updateStepStatus: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED",
  ) => void;

  // Восстановление и синхронизация
  restoreStepFromLS: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
  ) => StepState | null;
  syncTimeWithLocalStorage: (courseId: string, dayOnCourseId: string, stepIndex: number) => void;
  updateTimeLeft: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    timeLeft: number,
  ) => void;

  // Очистка данных
  clearAllSteps: () => void;
  cleanupExpiredData: (courseId: string, dayOnCourseId: string) => void;
  validateStepIntegrity: (courseId: string, dayOnCourseId: string, stepIndex: number) => boolean;
}
