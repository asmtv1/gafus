import { TrainingStatus, calculateDayStatusFromStatuses } from "@gafus/types";

export type StepStates = Record<string, { status?: string }>;

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
      const stepKey = `${courseId}-${dayOnCourseId}-${i}`;
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
