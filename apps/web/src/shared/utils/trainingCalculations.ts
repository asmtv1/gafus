import { TrainingStatus } from "@gafus/types";

export type StepStates = Record<string, { status?: string }>;

export function calculateDayStatus(courseId: string, day: number, stepStates: StepStates, totalSteps?: number): TrainingStatus {
  const stepKeys = Object.keys(stepStates).filter((key) => key.startsWith(`${courseId}-${day}-`));
  if (stepKeys.length === 0) return TrainingStatus.NOT_STARTED;

  // Если передан totalSteps, создаем массив статусов для всех шагов дня
  if (totalSteps !== undefined) {
    const stepStatuses: string[] = [];
    for (let i = 0; i < totalSteps; i++) {
      const stepKey = `${courseId}-${day}-${i}`;
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

export function calculateCourseStatus(courseId: string, stepStates: StepStates): TrainingStatus {
  const dayKeys = new Set<string>();
  Object.keys(stepStates).forEach((key) => {
    if (key.startsWith(`${courseId}-`)) {
      const parts = key.split('-');
      if (parts.length >= 3) {
        dayKeys.add(`${courseId}-${parts[1]}`);
      }
    }
  });

  if (dayKeys.size === 0) return TrainingStatus.NOT_STARTED;

  const dayNumbers = Array.from(dayKeys).map((dayKey) => parseInt(dayKey.split('-')[1])).sort((a, b) => a - b);
  const maxDay = Math.max(...dayNumbers);

  const dayStatuses: TrainingStatus[] = [];
  for (let day = 1; day <= maxDay; day++) {
    dayStatuses.push(calculateDayStatus(courseId, day, stepStates));
  }

  if (dayStatuses.every((status) => status === TrainingStatus.COMPLETED)) {
    return TrainingStatus.COMPLETED;
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


