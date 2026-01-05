import { TrainingStatus } from "@gafus/types";

export type StepStates = Record<string, { status?: string }>;

export function calculateDayStatus(courseId: string, dayOnCourseId: string, stepStates: StepStates, totalSteps?: number): TrainingStatus {
  const stepKeys = Object.keys(stepStates).filter((key) => key.startsWith(`${courseId}-${dayOnCourseId}-`));
  if (stepKeys.length === 0) return TrainingStatus.NOT_STARTED;

  // Если передан totalSteps, создаем массив статусов для всех шагов дня
  if (totalSteps !== undefined) {
    const stepStatuses: string[] = [];
    for (let i = 0; i < totalSteps; i++) {
      const stepKey = `${courseId}-${dayOnCourseId}-${i}`;
      const stepState = stepStates[stepKey];
      const status = stepState?.status || TrainingStatus.NOT_STARTED;
      stepStatuses.push(status);
    }

    if (stepStatuses.every((status) => status === TrainingStatus.COMPLETED)) {
      return TrainingStatus.COMPLETED;
    }

    if (stepStatuses.some((status) => status === TrainingStatus.IN_PROGRESS || status === "PAUSED" || status === TrainingStatus.COMPLETED)) {
      return TrainingStatus.IN_PROGRESS;
    }

    return TrainingStatus.NOT_STARTED;
  }

  // Старая логика для обратной совместимости
  const stepStatuses = stepKeys.map((key) => stepStates[key]?.status || TrainingStatus.NOT_STARTED);

  if (stepStatuses.every((status) => status === TrainingStatus.COMPLETED)) {
    return TrainingStatus.COMPLETED;
  }

  if (stepStatuses.some((status) => status === TrainingStatus.IN_PROGRESS || status === "PAUSED" || status === TrainingStatus.COMPLETED)) {
    return TrainingStatus.IN_PROGRESS;
  }

  return TrainingStatus.NOT_STARTED;
}

export function calculateCourseStatus(courseId: string, stepStates: StepStates, totalDaysInCourse?: number): TrainingStatus {
  const dayKeys = new Set<string>();
  Object.keys(stepStates).forEach((key) => {
    if (key.startsWith(`${courseId}-`)) {
      const parts = key.split('-');
      if (parts.length >= 3) {
        // Формат ключа: ${courseId}-${dayOnCourseId}-${stepIndex}
        // Сохраняем полный ключ дня: ${courseId}-${dayOnCourseId}
        dayKeys.add(`${courseId}-${parts[1]}`);
      }
    }
  });

  // Если знаем реальное количество дней курса, используем его,
  // иначе опираемся на фактически встреченные дни в локальном состоянии
  const effectiveTotalDays = typeof totalDaysInCourse === 'number' && totalDaysInCourse > 0
    ? totalDaysInCourse
    : dayKeys.size;

  if (effectiveTotalDays === 0) return TrainingStatus.NOT_STARTED;

  // Если передан totalDaysInCourse, проверяем все дни курса
  // Для расчета статуса курса используем все найденные dayOnCourseId
  const dayStatuses: TrainingStatus[] = [];
  dayKeys.forEach((dayKey) => {
    const dayOnCourseId = dayKey.split('-').slice(1).join('-'); // Получаем dayOnCourseId из ключа
    dayStatuses.push(calculateDayStatus(courseId, dayOnCourseId, stepStates));
  });

  // Если есть информация о общем количестве дней, проверяем что все дни завершены
  if (totalDaysInCourse && dayStatuses.length === totalDaysInCourse) {
    if (dayStatuses.every((status) => status === TrainingStatus.COMPLETED)) {
      return TrainingStatus.COMPLETED;
    }
  }

  if (dayStatuses.some((status) => status === TrainingStatus.IN_PROGRESS || status === TrainingStatus.COMPLETED)) {
    return TrainingStatus.IN_PROGRESS;
  }

  return TrainingStatus.NOT_STARTED;
}

// Упрощённые помощники для серверного кода
export function calculateDayStatusFromStatuses(statuses: (string | TrainingStatus)[]): TrainingStatus {
  if (statuses.length === 0) return TrainingStatus.NOT_STARTED;
  const normalized = statuses.map((s) => String(s));
  if (normalized.every((s) => s === TrainingStatus.COMPLETED)) return TrainingStatus.COMPLETED;
  if (normalized.some((s) => s === TrainingStatus.IN_PROGRESS || s === "PAUSED" || s === TrainingStatus.COMPLETED)) {
    return TrainingStatus.IN_PROGRESS;
  }
  return TrainingStatus.NOT_STARTED;
}