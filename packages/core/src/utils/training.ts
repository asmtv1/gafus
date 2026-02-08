import type { StepType } from "@gafus/types";
import { TrainingStatus, calculateDayStatusFromStatuses } from "@gafus/types";

export type StepStates = Record<string, { status?: string }>;

/**
 * Подписи статусов тренировки для UI (единственное число: «Не начат», «Завершен» и т.д.).
 * Единый источник для web и mobile.
 */
export const STEP_STATUS_LABELS: Record<TrainingStatus, string> = {
  [TrainingStatus.NOT_STARTED]: "Не начат",
  [TrainingStatus.IN_PROGRESS]: "В процессе",
  [TrainingStatus.COMPLETED]: "Завершен",
  [TrainingStatus.PAUSED]: "На паузе",
  [TrainingStatus.RESET]: "Сброшен",
};

/**
 * Подписи статусов для фильтров (множественное число: «Не начатые», «Сброшенные» и т.д.).
 */
export const STEP_STATUS_FILTER_LABELS: Record<TrainingStatus, string> = {
  [TrainingStatus.NOT_STARTED]: "Не начатые",
  [TrainingStatus.IN_PROGRESS]: "В процессе",
  [TrainingStatus.COMPLETED]: "Завершенные",
  [TrainingStatus.PAUSED]: "На паузе",
  [TrainingStatus.RESET]: "Сброшенные",
};

/**
 * Ключ дня для сторов и кэша. Единый формат для web и mobile.
 */
export function getDayKey(courseId: string, dayOnCourseId: string): string {
  return `${courseId}-${dayOnCourseId}`;
}

/**
 * Ключ шага для сторов и кэша. Единый формат для web и mobile.
 */
export function getStepKey(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
): string {
  return `${courseId}-${dayOnCourseId}-${stepIndex}`;
}

/**
 * Ключ localStorage для времени окончания таймера шага. Единый формат для web и mobile.
 */
export function getStepTimerEndStorageKey(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
): string {
  return `training-${courseId}-${dayOnCourseId}-${stepIndex}-end`;
}

/**
 * Ключ localStorage для флага паузы таймера шага. Единый формат для web и mobile.
 */
export function getStepTimerPauseStorageKey(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
): string {
  return `training-${courseId}-${dayOnCourseId}-${stepIndex}-paused`;
}

/**
 * Префикс ключей шагов дня для фильтрации (key.startsWith(prefix)).
 * Консистентен с getStepKey: шаг i имеет ключ `${courseId}-${dayOnCourseId}-${i}`.
 */
export function getDayStepKeyPrefix(courseId: string, dayOnCourseId: string): string {
  return `${courseId}-${dayOnCourseId}-`;
}

/**
 * Подписи типов шагов для UI. Единый источник для web и mobile.
 */
export const STEP_TYPE_LABELS: Record<StepType, string> = {
  EXAMINATION: "Экзаменационный шаг",
  THEORY: "Теоретический шаг",
  BREAK: "Перерыв",
  PRACTICE: "Упражнение без таймера",
  DIARY: "Дневник успехов",
  TRAINING: "Тренировка",
};

/** Вход для расчёта длительности дня по шагам. */
export interface StepDurationInput {
  type?: string | null;
  durationSec?: number | null;
  estimatedDurationSec?: number | null;
}

/**
 * Оценка длительности дня по шагам: тренировочные минуты и минуты теории/экзамена.
 * TRAINING → durationSec; PRACTICE → estimatedDurationSec в тренировочные;
 * BREAK/DIARY → пропуск; остальное → theory (estimatedDurationSec).
 */
export function estimateDayDurations(
  steps: StepDurationInput[],
): { trainingMinutes: number; theoryMinutes: number } {
  let trainingSeconds = 0;
  let theorySeconds = 0;
  for (const step of steps) {
    const type = step.type ?? "";
    if (type === "TRAINING") {
      trainingSeconds += step.durationSec ?? 0;
    } else if (type === "PRACTICE") {
      trainingSeconds += step.estimatedDurationSec ?? 0;
    } else if (type === "BREAK" || type === "DIARY") {
      continue;
    } else {
      theorySeconds += step.estimatedDurationSec ?? 0;
    }
  }
  return {
    trainingMinutes: Math.ceil(trainingSeconds / 60),
    theoryMinutes: Math.ceil(theorySeconds / 60),
  };
}

/** Шаг с таймером (TRAINING, BREAK). Для undefined type возвращает false. */
export function isStepWithTimer(type: StepType | undefined | null): boolean {
  if (type == null) return false;
  return type === "TRAINING" || type === "BREAK";
}

/** Показывать оценочное время (EXAMINATION, THEORY, PRACTICE). Для undefined type возвращает false. */
export function shouldShowEstimatedDuration(
  type: StepType | undefined | null,
): boolean {
  if (type == null) return false;
  return type === "EXAMINATION" || type === "THEORY" || type === "PRACTICE";
}

/** Типы дней, которые не нумеруются как «День N». */
export const NON_NUMBERED_DAY_TYPES = [
  "instructions",
  "introduction",
  "diagnostics",
  "summary",
] as const;

/** Подписи типов дней для списка и карточек. */
export const DAY_TYPE_LABELS: Record<string, string> = {
  base: "Базовый день",
  regular: "Тренировочный день",
  introduction: "Вводный блок",
  instructions: "Инструкции",
  diagnostics: "Диагностика",
  summary: "Подведение итогов",
};

/**
 * Заголовок дня по типу и номеру для отображения.
 * Для не-тренировочных типов возвращает подпись, иначе «День N» или «День».
 */
export function getDayTitle(type: string, displayDayNumber?: number | null): string {
  switch (type) {
    case "instructions":
      return "Инструкции";
    case "introduction":
      return "Вводный блок";
    case "diagnostics":
      return "Диагностика";
    case "summary":
      return "Подведение итогов";
    default:
      return displayDayNumber != null ? `День ${displayDayNumber}` : "День";
  }
}

/**
 * Индекс «текущего» дня для подсветки в списке.
 * Логика: первый день со статусом IN_PROGRESS; иначе следующий за последним COMPLETED; иначе 0.
 * Пустой массив → 0. Входящий массив не мутируется.
 */
export function getCurrentDayIndex<T>(
  days: T[],
  getFinalStatus: (day: T) => string,
): number {
  if (days.length === 0) return 0;
  const inProgressIndex = days.findIndex((day) => getFinalStatus(day) === "IN_PROGRESS");
  if (inProgressIndex !== -1) return inProgressIndex;
  let lastCompletedIndex = -1;
  for (let i = 0; i < days.length; i++) {
    if (getFinalStatus(days[i]) === "COMPLETED") lastCompletedIndex = i;
  }
  if (lastCompletedIndex !== -1 && lastCompletedIndex < days.length - 1) {
    return lastCompletedIndex + 1;
  }
  return 0;
}

/**
 * Формат времени таймера для отображения (M:SS).
 * Отрицательные и дробные значения приводятся к неотрицательному целому (0 и выше).
 */
export function formatTimeLeft(seconds: number): string {
  const totalSecs = Math.max(0, Math.floor(Number(seconds)));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Определяет статус шага для отображения в UI.
 * stepState (из stepStore) — единственный источник истины после инициализации.
 * serverStep используется только при отсутствии stepState (до initializeStep).
 *
 * @param stepState - Локальное состояние из stepStore (приоритет)
 * @param serverStep - Серверные данные (fallback при первом рендере)
 * @returns Статус для отображения в UI
 */
export function getStepDisplayStatus(
  stepState: { status?: string } | null | undefined,
  serverStep?: { status?: string; isPausedOnServer?: boolean },
): TrainingStatus {
  // RESET с сервера всегда показываем сразу, чтобы не было вспышки «На паузе» до initializeStep
  if (serverStep?.status === TrainingStatus.RESET) return TrainingStatus.RESET;

  const localStatus = stepState?.status?.trim();
  if (localStatus) return localStatus as TrainingStatus;

  if (serverStep?.isPausedOnServer) return TrainingStatus.PAUSED;
  return (serverStep?.status as TrainingStatus) || TrainingStatus.NOT_STARTED;
}

/** Ранг статуса для сравнения при слиянии local/server. Экспортируется для использования в stepStore (web). */
export function statusRank(s?: string): number {
  if (s === "COMPLETED") return 2;
  if (s === "IN_PROGRESS" || s === "PAUSED" || s === "RESET") return 1;
  return 0;
}

/**
 * Определяет статус дня для отображения при слиянии локального (stepStore) и серверного.
 * RESET имеет приоритет над серверным COMPLETED (пользователь явно сбросил).
 *
 * @param localStatus - Рассчитан из stepStore (calculateDayStatus)
 * @param serverStatus - day.userStatus с сервера
 */
export function getDayDisplayStatus(
  localStatus: TrainingStatus,
  serverStatus?: string,
): TrainingStatus {
  if (localStatus === TrainingStatus.RESET) return TrainingStatus.RESET;
  const server = (serverStatus as TrainingStatus) || TrainingStatus.NOT_STARTED;
  return statusRank(localStatus) >= statusRank(serverStatus) ? localStatus : server;
}

/**
 * Вычисляет статус дня тренировки на основе статусов шагов
 * @param courseId - ID курса
 * @param dayOnCourseId - ID дня в курсе
 * @param stepStates - Состояния всех шагов
 * @param totalSteps - Общее количество шагов в дне (опционально)
 * @returns Статус дня
 */
export function calculateDayStatus(
  courseId: string,
  dayOnCourseId: string,
  stepStates: StepStates,
  totalSteps?: number,
): TrainingStatus {
  const stepKeys = Object.keys(stepStates).filter((key) =>
    key.startsWith(`${courseId}-${dayOnCourseId}-`),
  );
  if (stepKeys.length === 0) return TrainingStatus.NOT_STARTED;

  // Если передан totalSteps, создаем массив статусов для всех шагов дня
  // Это гарантирует правильный расчет даже если некоторые шаги еще не инициализированы в stepStore
  if (totalSteps !== undefined) {
    const stepStatuses: string[] = [];
    for (let i = 0; i < totalSteps; i++) {
      const stepKey = getStepKey(courseId, dayOnCourseId, i);
      const stepState = stepStates[stepKey];
      const status = stepState?.status || TrainingStatus.NOT_STARTED;
      stepStatuses.push(status);
    }

    return calculateDayStatusFromStatuses(stepStatuses);
  }

  // Если totalSteps не передан, используем только те шаги, которые уже есть в stepStates
  // ВНИМАНИЕ: это может дать неточный результат, если не все шаги дня инициализированы
  // Рекомендуется всегда передавать totalSteps для корректного расчета
  const stepStatuses = stepKeys.map((key) => stepStates[key]?.status || TrainingStatus.NOT_STARTED);
  return calculateDayStatusFromStatuses(stepStatuses);
}

/**
 * Вычисляет статус курса на основе статусов шагов.
 * Если передан dayOnCourseIds — использует его (корректно при id с дефисами).
 * Иначе парсит ключи stepStates (ограничение: courseId и dayOnCourseId не должны содержать "-").
 *
 * @param courseId - ID курса
 * @param stepStates - Состояния всех шагов
 * @param totalDaysInCourse - Общее количество дней в курсе (опционально)
 * @param dayOnCourseIds - Список ID дней курса (из course.dayLinks; при наличии — приоритет над разбором ключей)
 * @returns Статус курса
 */
export function calculateCourseStatus(
  courseId: string,
  stepStates: StepStates,
  totalDaysInCourse?: number,
  dayOnCourseIds?: string[],
): TrainingStatus {
  let dayStatuses: TrainingStatus[];

  if (dayOnCourseIds && dayOnCourseIds.length > 0) {
    dayStatuses = dayOnCourseIds.map((dayOnCourseId) =>
      calculateDayStatus(courseId, dayOnCourseId, stepStates),
    );
  } else {
    // Fallback: разбор ключей (некорректен при дефисах в courseId/dayOnCourseId)
    const dayKeys = new Set<string>();
    Object.keys(stepStates).forEach((key) => {
      if (key.startsWith(`${courseId}-`)) {
        const parts = key.split("-");
        if (parts.length >= 3) {
          dayKeys.add(`${courseId}-${parts[1]}`);
        }
      }
    });
    dayStatuses = [];
    dayKeys.forEach((dayKey) => {
      const dayOnCourseId = dayKey.split("-").slice(1).join("-");
      dayStatuses.push(calculateDayStatus(courseId, dayOnCourseId, stepStates));
    });
  }

  const effectiveTotalDays =
    typeof totalDaysInCourse === "number" && totalDaysInCourse > 0
      ? totalDaysInCourse
      : dayStatuses.length;

  if (effectiveTotalDays === 0) return TrainingStatus.NOT_STARTED;

  // Если есть информация о общем количестве дней, проверяем что все дни завершены
  if (totalDaysInCourse && dayStatuses.length === totalDaysInCourse) {
    if (dayStatuses.every((status) => status === TrainingStatus.COMPLETED)) {
      return TrainingStatus.COMPLETED;
    }
  }

  if (
    dayStatuses.some(
      (status) => status === TrainingStatus.IN_PROGRESS || status === TrainingStatus.COMPLETED,
    )
  ) {
    return TrainingStatus.IN_PROGRESS;
  }

  if (dayStatuses.some((status) => status === TrainingStatus.RESET)) {
    return TrainingStatus.RESET;
  }

  return TrainingStatus.NOT_STARTED;
}

/**
 * Вычисляет статус курса по массиву статусов дней (для использования на сервере).
 */
export function calculateCourseStatusFromDayStatuses(
  dayStatuses: (string | TrainingStatus)[],
  totalDaysInCourse?: number,
): TrainingStatus {
  if (dayStatuses.length === 0) return TrainingStatus.NOT_STARTED;
  const normalized = dayStatuses.map((s) => String(s)) as TrainingStatus[];
  if (
    typeof totalDaysInCourse === "number" &&
    totalDaysInCourse > 0 &&
    normalized.length === totalDaysInCourse &&
    normalized.every((s) => s === TrainingStatus.COMPLETED)
  ) {
    return TrainingStatus.COMPLETED;
  }
  if (
    normalized.some(
      (s) => s === TrainingStatus.IN_PROGRESS || s === TrainingStatus.COMPLETED,
    )
  ) {
    return TrainingStatus.IN_PROGRESS;
  }
  if (normalized.some((s) => s === TrainingStatus.RESET)) {
    return TrainingStatus.RESET;
  }
  return TrainingStatus.NOT_STARTED;
}
