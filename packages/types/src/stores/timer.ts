export interface TimerStore {
  // Хранилище для таймеров
  timers: Map<string, NodeJS.Timeout>;

  // Управление активным шагом
  getActiveStep: () => string | null;
  canStartStep: (courseId: string, day: number, stepIndex: number) => boolean;

  // Управление таймерами
  startTimer: (
    courseId: string,
    day: number,
    stepIndex: number,
    onTimeUpdate: (timeLeft: number) => void,
    onFinish: () => void,
    isRestore?: boolean,
  ) => boolean; // Возвращает true если успешно запущен, false если заблокирован
  stopTimer: (courseId: string, day: number, stepIndex: number) => void;
  stopAllTimers: () => void;
  cleanupTimers: () => void;

  // Серверные действия
  startStepWithServer: (
    courseId: string,
    day: number,
    stepIndex: number,
    durationSec: number,
  ) => Promise<void>;

  finishStepWithServer: (
    courseId: string,
    day: number,
    stepIndex: number,
    stepTitle: string,
    stepOrder: number,
  ) => Promise<void>;
  resetStepWithServer: (
    courseId: string,
    day: number,
    stepIndex: number,
    durationSec: number,
  ) => Promise<void>;
}
