// Данные дней тренировок (БЕЗ UI-специфичных полей)

import type { StepData } from "./step";

export interface TrainingDayData {
  id: string;
  title: string;
  description: string;
  equipment: string;
  type: string;
  order: number;
  steps: StepData[];
}

export interface TrainingDayFormData {
  title: string;
  description: string;
  type: string;
  visibleStepIds: string[];
}

// Данные для создания дня
export interface CreateDayClientStep {
  id: string;
  title: string;
  description: string;
  type: string;
}
