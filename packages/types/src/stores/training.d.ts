export interface StepState {
  timeLeft: number;
  isFinished: boolean;
  isPaused: boolean;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED";
}
export interface TrainingState {
  // Состояние дней (изолированно по курсам)
  openIndexes: Record<string, number | null>;
  runningSteps: Record<string, number | null>;
  courseAssignments: Record<string, boolean>;
  assignErrors: Record<string, string | null>;

  // Утилиты
  getStepKey: (courseId: string, day: number, stepIndex: number) => string;
  getDayKey: (courseId: string, day: number) => string;

  // Геттеры
  getOpenIndex: (courseId: string, day: number) => number | null;
  getRunningIndex: (courseId: string, day: number) => number | null;
  getCourseAssigned: (courseId: string) => boolean;
  getAssignError: (courseId: string) => string | null;

  // Действия для дня
  setOpenIndex: (courseId: string, day: number, index: number | null) => void;
  setRunningIndex: (courseId: string, day: number, index: number | null) => void;
  setCourseAssigned: (courseId: string, assigned: boolean) => void;
  setAssignError: (courseId: string, error: string | null) => void;

  // Поиск активного шага
  findRunningStepIndex: (courseId: string, day: number, totalSteps: number) => number | null;

  // Серверные действия
  togglePauseWithServer: (courseId: string, day: number, stepIndex: number) => Promise<void>;
}
//# sourceMappingURL=training.d.ts.map
