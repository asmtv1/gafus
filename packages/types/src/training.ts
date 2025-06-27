// src/types/training.ts

import type { TrainingStatus } from "@prisma/client";

/** Тип шага тренировки с прогрессом пользователя */
export type TrainingStep = {
  id: string;
  title: string;
  description: string;
  durationSec: number;
  status: TrainingStatus;
};

/** Полная информация о тренировочном дне + шаги + статус пользователя */
export type TrainingDetail = {
  id: number;
  day: number;
  title: string;
  type: string;
  courseId: number;
  description: string;
  duration: string;
  userStatus: TrainingStatus;
  steps: TrainingStep[];
};
