// Store типы для timerStore

export interface TimerStore {
  // Хранилище для таймеров
  timers: Map<string, NodeJS.Timeout>;

  // Управление активным шагом
  getActiveStep: () => string | null;
  canStartStep: (courseId: string, dayOnCourseId: string, stepIndex: number) => boolean;

  // Управление таймерами
  startTimer: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    onTimeUpdate: (timeLeft: number) => void,
    onFinish: () => void,
    isRestore?: boolean,
  ) => boolean;
  stopTimer: (courseId: string, dayOnCourseId: string, stepIndex: number) => void;
  stopAllTimers: () => void;
  cleanupTimers: () => void;

  // Серверные действия
  startStepWithServer: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    durationSec: number,
  ) => Promise<void>;

  finishStepWithServer: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    stepTitle: string,
    stepOrder: number,
  ) => Promise<void>;
  resetStepWithServer: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    durationSec: number,
  ) => Promise<void>;

  // Управление уведомлениями
  pauseNotification: (courseId: string, dayOnCourseId: string, stepIndex: number) => Promise<void>;

  resumeNotification: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    durationSec: number,
  ) => Promise<void>;

  // Пауза и возобновление шага с сервером
  pauseStepWithServer: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
  ) => Promise<void>;
  resumeStepWithServer: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    durationSec: number,
  ) => Promise<void>;

  // Офлайн функции для паузы и возобновления
  pauseStepOffline: (courseId: string, dayOnCourseId: string, stepIndex: number) => void;
  resumeStepOffline: (courseId: string, dayOnCourseId: string, stepIndex: number) => void;
}
