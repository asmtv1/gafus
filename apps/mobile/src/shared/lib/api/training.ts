import { apiClient, type ApiResponse } from "./client";

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
  userStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | null;
  completedAt: string | null;
}

export interface TrainingDaysResponse {
  trainingDays: TrainingDay[];
  courseDescription: string;
  courseId: string;
  courseVideoUrl: string;
  courseEquipment: string;
  courseTrainingLevel: string;
}

export interface UserStep {
  id: string;
  stepId: string;
  stepIndex: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED";
  remainingSec: number | null;
  completedAt: string | null;
  // Данные шага из курса
  step: {
    id: string;
    title: string;
    description: string;
    type: "THEORY" | "PRACTICE" | "EXAM";
    durationSec: number | null;
    videoUrl: string | null;
    pdfUrl: string | null;
    order: number;
  };
}

export interface TrainingDayResponse {
  trainingDayId: string;
  dayOnCourseId: string;
  displayDayNumber?: number;
  title: string;
  type: string;
  description?: string;
  steps: UserStep[];
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
