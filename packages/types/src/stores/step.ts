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
  getStepKey: (courseId: string, day: number, stepIndex: number) => string;

  // Действия для шагов
  initializeStep: (
    courseId: string,
    day: number,
    stepIndex: number,
    durationSec: number,
    initialStatus?: "NOT_STARTED" | "COMPLETED",
  ) => void;
  startStep: (
    courseId: string,
    day: number,
    stepIndex: number,
    durationSec: number,
  ) => Promise<boolean>;
  pauseStep: (courseId: string, day: number, stepIndex: number) => void;
  resumeStep: (courseId: string, day: number, stepIndex: number) => void;
  finishStep: (courseId: string, day: number, stepIndex: number) => void;
  resetStep: (courseId: string, day: number, stepIndex: number, durationSec: number) => void;

  // Восстановление и синхронизация
  restoreStepFromLS: (courseId: string, day: number, stepIndex: number) => StepState | null;
  syncTimeWithLocalStorage: (courseId: string, day: number, stepIndex: number) => void;
  updateTimeLeft: (courseId: string, day: number, stepIndex: number, timeLeft: number) => void;

  // Очистка данных
  cleanupExpiredData: (courseId: string, day: number) => void;
  validateStepIntegrity: (courseId: string, day: number, stepIndex: number) => boolean;
}
