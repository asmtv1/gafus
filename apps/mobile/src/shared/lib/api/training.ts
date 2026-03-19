import { apiClient, type ApiResponse } from "./client";
import type { UserCoursePersonalization } from "@gafus/types";

// Типы для тренировок
export interface TrainingDay {
  id: string;
  dayOnCourseId: string;
  title: string;
  type: string;
  estimatedDuration: number | null;
  theoryMinutes?: number | null;
  equipment?: string | null;
  order: number;
  userStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "RESET" | null;
  completedAt: string | null;
  /** Для summary: true, если не все остальные дни завершены (как на web) */
  isLocked?: boolean;
  /** Показывать кнопку экспорта «Ваш путь» (только для типа summary) */
  showCoursePathExport?: boolean;
}

export interface TrainingDaysResponse {
  trainingDays: TrainingDay[];
  courseDescription: string;
  courseId: string;
  courseVideoUrl: string;
  courseEquipment: string;
  courseTrainingLevel: string;
  courseIsPersonalized?: boolean;
  userCoursePersonalization?: UserCoursePersonalization | null;
}

/** Данные шага из курса (вложенный объект в UserStep или плоский шаг из офлайна). */
export type StepContent = {
  id: string;
  title: string;
  description: string;
  /** THEORY | PRACTICE | EXAM из API; на офлайне также TRAINING, BREAK, EXAMINATION. */
  type: string;
  durationSec: number | null;
  videoUrl: string | null;
  pdfUrl: string | null;
  order: number;
  estimatedDurationSec?: number | null;
};

export interface UserStep {
  id: string;
  stepId: string;
  stepIndex: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "RESET";
  remainingSec: number | null;
  completedAt: string | null;
  step: StepContent;
}

/** Возвращает контент шага (вложенный step или сам шаг, если он плоский). */
export function getStepContent(step: UserStep | StepContent): StepContent {
  if ("step" in step && step.step) return step.step;
  return step as StepContent;
}

export interface TrainingDayResponse {
  courseId: string;
  trainingDayId: string;
  dayOnCourseId: string;
  displayDayNumber?: number;
  title: string;
  type: string;
  description?: string;
  steps: UserStep[];
  showCoursePathExport?: boolean;
}

export interface StepActionParams {
  courseId: string;
  dayOnCourseId: string;
  stepIndex: number;
}

export interface StartStepParams extends StepActionParams {
  status: "IN_PROGRESS";
  durationSec: number;
}

export interface PauseStepParams extends StepActionParams {
  timeLeftSec: number;
}

export interface ResetStepParams extends StepActionParams {
  durationSec?: number;
}

export interface CompleteStepParams extends StepActionParams {
  stepTitle?: string;
  stepOrder?: number;
}

export interface DiaryEntry {
  id: string;
  content: string;
  dayOnCourseId: string;
  createdAt: string;
}

/**
 * API модуль для работы с тренировками
 */
export const trainingApi = {
  /**
   * Получить список дней тренировок курса
   */
  getDays: async (courseType: string): Promise<ApiResponse<TrainingDaysResponse>> => {
    return apiClient<TrainingDaysResponse>(`/api/v1/training/days?type=${courseType}`);
  },

  /**
   * Получить день с шагами пользователя
   */
  getDay: async (
    courseType: string,
    dayOnCourseId: string,
    createIfMissing = true,
  ): Promise<ApiResponse<TrainingDayResponse>> => {
    const params = new URLSearchParams({
      courseType,
      dayOnCourseId,
      createIfMissing: String(createIfMissing),
    });
    return apiClient<TrainingDayResponse>(`/api/v1/training/day?${params}`);
  },

  /**
   * Начать выполнение шага
   */
  startStep: async (params: StartStepParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/training/step/start", {
      method: "POST",
      body: params,
    });
  },

  /**
   * Обновить статус шага
   */
  updateStepStatus: async (
    params: StepActionParams & { status: string; stepTitle?: string; stepOrder?: number },
  ): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/training/step/status", {
      method: "POST",
      body: params,
    });
  },

  /**
   * Поставить шаг на паузу
   */
  pauseStep: async (params: PauseStepParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/training/step/pause", {
      method: "POST",
      body: params,
    });
  },

  /**
   * Возобновить шаг после паузы
   */
  resumeStep: async (params: StepActionParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/training/step/resume", {
      method: "POST",
      body: params,
    });
  },

  /**
   * Сбросить шаг (таймер) в NOT_STARTED
   */
  resetStep: async (params: ResetStepParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/training/step/reset", {
      method: "POST",
      body: params,
    });
  },

  /**
   * Завершить теоретический шаг
   */
  completeTheoryStep: async (params: CompleteStepParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/training/step/complete/theory", {
      method: "POST",
      body: params,
    });
  },

  /**
   * Завершить практический шаг
   */
  completePracticeStep: async (params: CompleteStepParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/training/step/complete/practice", {
      method: "POST",
      body: params,
    });
  },

  postDiaryEntry: async (dayOnCourseId: string, content: string): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/training/diary", {
      method: "POST",
      body: { dayOnCourseId, content },
    });
  },

  getDiaryEntries: async (
    courseId: string,
    upToDayOnCourseId?: string,
  ): Promise<ApiResponse<{ entries: DiaryEntry[] }>> => {
    const params = new URLSearchParams({ courseId });
    if (upToDayOnCourseId) params.set("upToDayOnCourseId", upToDayOnCourseId);
    return apiClient<{ entries: DiaryEntry[] }>(`/api/v1/training/diary?${params.toString()}`);
  },

  /**
   * Получить signed URL для видео (HLS манифест)
   * Использует POST endpoint /api/v1/training/video/url
   */
  async getVideoUrl(videoUrl: string): Promise<ApiResponse<{ url: string }>> {
    return apiClient<{ url: string }>("/api/v1/training/video/url", {
      method: "POST",
      body: { videoUrl },
    });
  },
};
