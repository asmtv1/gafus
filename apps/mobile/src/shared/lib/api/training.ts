import { apiClient, type ApiResponse } from "./client";
import { reportClientError } from "@/shared/lib/tracer";
import type {
  DiaryEntryWire,
  DiaryRead,
  TrainingDayWire,
  TrainingDayStepWire,
  TrainingDaysWireItem,
  TrainingDaysRead,
} from "../../../../../../packages/types/src/data/training";

// Типы для тренировок
export interface TrainingDay {
  id: string;
  dayOnCourseId: TrainingDaysWireItem["dayOnCourseId"];
  title: TrainingDaysWireItem["title"];
  type: TrainingDaysWireItem["type"];
  estimatedDuration: number | null;
  theoryMinutes?: number | null;
  equipment?: string | null;
  order: number;
  userStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "RESET" | null;
  completedAt: string | null;
  /** Для summary: true, если не все остальные дни завершены (как на web) */
  isLocked?: boolean;
  /** Показывать кнопку экспорта «Ваш путь» (только для типа summary) */
  showCoursePathExport?: TrainingDaysWireItem["showCoursePathExport"];
}

/** Legacy Mobile offline/cache response: not the canonical Hono /days wire. */
export interface TrainingDaysResponse {
  trainingDays: TrainingDay[];
  courseDescription: string;
  courseId: string;
  courseVideoUrl: string;
  courseEquipment: string;
  courseTrainingLevel: string;
  courseIsPersonalized?: TrainingDaysRead["data"]["courseIsPersonalized"];
  userCoursePersonalization?: TrainingDaysRead["data"]["userCoursePersonalization"];
}

/** Данные шага из курса (вложенный объект в UserStep или плоский шаг из офлайна). */
export type StepContent = {
  id: TrainingDayStepWire["id"];
  title: TrainingDayStepWire["title"];
  description: TrainingDayStepWire["description"];
  /** THEORY | PRACTICE | EXAM из API; на офлайне также TRAINING, BREAK, EXAMINATION. */
  type: string;
  durationSec: TrainingDayStepWire["durationSec"] | null;
  videoUrl: TrainingDayStepWire["videoUrl"];
  /** Загруженные тренером изображения (как на web StepContent / OfflineImageViewer). */
  imageUrls?: TrainingDayStepWire["imageUrls"];
  pdfUrl: string | null;
  order: TrainingDayStepWire["order"];
  estimatedDurationSec?: TrainingDayStepWire["estimatedDurationSec"];
  checklist?: unknown;
  requiresVideoReport?: TrainingDayStepWire["requiresVideoReport"];
  requiresWrittenFeedback?: TrainingDayStepWire["requiresWrittenFeedback"];
  hasTestQuestions?: TrainingDayStepWire["hasTestQuestions"];
  surveySlug?: TrainingDayStepWire["surveySlug"];
};

export interface UserStep {
  id: string;
  stepId: string;
  stepIndex: number;
  status: `${TrainingDayStepWire["status"]}`;
  remainingSec: number | null;
  isPausedOnServer?: boolean;
  remainingSecOnServer?: number | null;
  completedAt: string | null;
  step: StepContent;
  userStepId?: TrainingDayStepWire["userStepId"];
  locked?: TrainingDayStepWire["locked"];
  monetizationTarget?: TrainingDayStepWire["monetizationTarget"];
}

/** Возвращает контент шага (вложенный step или сам шаг, если он плоский). */
export function getStepContent(step: UserStep | StepContent): StepContent {
  if ("step" in step && step.step) return step.step;
  return step as StepContent;
}

/** Existing Native GET-day/offline shape remains narrower than the full
 * canonical Hono wire: keep nested UserStep and offline-optional description.
 */
export interface TrainingDayResponse extends Pick<TrainingDayWire,
  "courseId" | "trainingDayId" | "dayOnCourseId" | "title" | "type" |
  "showCoursePathExport"
> {
  displayDayNumber?: NonNullable<TrainingDayWire["displayDayNumber"]>;
  description?: TrainingDayWire["description"];
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

/** Mobile UI uses only this established six-field view of the eight-field GET wire. */
export type DiaryEntry = Pick<
  DiaryEntryWire,
  "id" | "content" | "dayOnCourseId" | "createdAt" | "dayOrder" | "dayTitle"
>;

/** Public, read-only marketing outline shared with Web's paid course overview.
 * The endpoint rejects private/non-paid courses and never returns step bodies. */
export type PublicPaidCourseOutline = {
  courseId: string;
  courseType: string;
  name: string;
  description: string | null;
  equipment: string | null;
  trainingLevel: string | null;
  outline: {
    id: string;
    title: string;
    order: number;
    type?: string;
    equipment?: string;
    estimatedDuration?: number;
    theoryMinutes?: number;
  }[];
};

const validOutlineId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);

/** Refuse malformed/publicity-expanded transport; never infer private steps. */
export function projectPublicPaidCourseOutline(
  input: unknown, courseType: string,
): PublicPaidCourseOutline {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("INVALID_PUBLIC_PAID_OUTLINE");
  const row = input as Record<string, unknown>;
  if (!validOutlineId(row.courseId) || row.courseType !== courseType ||
      typeof row.name !== "string" || !row.name.trim() ||
      ![row.description, row.equipment, row.trainingLevel].every(value =>
        value === null || typeof value === "string") ||
      !Array.isArray(row.outline) || row.outline.length > 500)
    throw Error("INVALID_PUBLIC_PAID_OUTLINE");
  const ids = new Set<string>();
  const outline = row.outline.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error("INVALID_PUBLIC_PAID_OUTLINE_DAY");
    const day = value as Record<string, unknown>;
    if (!validOutlineId(day.id) || ids.has(day.id) ||
        typeof day.title !== "string" || !day.title.trim() ||
        !Number.isSafeInteger(day.order) || Number(day.order) < 0)
      throw Error("INVALID_PUBLIC_PAID_OUTLINE_DAY");
    if ((day.type !== undefined && typeof day.type !== "string") ||
        (day.equipment !== undefined && typeof day.equipment !== "string") ||
        [day.estimatedDuration, day.theoryMinutes].some(value => value !== undefined &&
          (!Number.isSafeInteger(value) || Number(value) < 0)))
      throw Error("INVALID_PUBLIC_PAID_OUTLINE_DAY");
    ids.add(day.id);
    return {
      id: day.id, title: day.title, order: day.order as number,
      ...(day.type === undefined ? {} : { type: day.type as string }),
      ...(day.equipment === undefined ? {} : { equipment: day.equipment as string }),
      ...(day.estimatedDuration === undefined ? {} : {
        estimatedDuration: day.estimatedDuration as number,
      }),
      ...(day.theoryMinutes === undefined ? {} : { theoryMinutes: day.theoryMinutes as number }),
    };
  });
  return {
    courseId: row.courseId as string, courseType,
    name: row.name as string, description: row.description as string | null,
    equipment: row.equipment as string | null,
    trainingLevel: row.trainingLevel as string | null,
    outline,
  };
}

/**
 * API модуль для работы с тренировками
 */
export const trainingApi = {
  getPublicPaidCourseOutline: async (
    courseType: string, requestGuard?: () => boolean,
  ): Promise<ApiResponse<PublicPaidCourseOutline>> => {
    if (!validOutlineId(courseType))
      return { success: false, code: "INVALID_COURSE_TYPE", error: "Недопустимый курс" };
    const response = await apiClient<unknown>(
      `/api/v1/public/paid-course-outline/${courseType}`,
      { skipAuth: true, suppressSubscriptionPaywall: true,
        ...(requestGuard ? { requestGuard } : {}) },
    );
    if (!response.success) return { success: false, error: response.error, code: response.code };
    try {
      return { success: true, data: projectPublicPaidCourseOutline(response.data, courseType) };
    } catch {
      // Keep the raw provider payload out of logs, errors and telemetry.
      reportClientError(new Error("INVALID_PUBLIC_PAID_OUTLINE"), {
        issueKey: "TrainingDays", keys: { operation: "project_public_paid_outline" },
      });
      return { success: false, code: "INVALID_PUBLIC_PAID_OUTLINE",
        error: "Некорректная программа курса" };
    }
  },
  /**
   * Получить список дней тренировок курса
   */
  getDays: async (courseType: string): Promise<ApiResponse<TrainingDaysResponse>> => {
    // Viewing the day list must never launch the global subscription modal.
    // A 402/403 is handled by the screen's public paid-course outline instead.
    return apiClient<TrainingDaysResponse>(`/api/v1/training/days?type=${courseType}`, {
      suppressSubscriptionPaywall: true,
    });
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
    return apiClient<TrainingDayResponse>(`/api/v1/training/day?${params}`, {
      suppressSubscriptionPaywall: true,
    });
  },

  /**
   * Начать выполнение шага
   */
  startStep: async (params: StartStepParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/training/step/start", {
      method: "POST",
      body: params,
      suppressSubscriptionPaywall: true,
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
      suppressSubscriptionPaywall: true,
    });
  },

  /**
   * Поставить шаг на паузу
   */
  pauseStep: async (params: PauseStepParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/training/step/pause", {
      method: "POST",
      body: params,
      suppressSubscriptionPaywall: true,
    });
  },

  /**
   * Возобновить шаг после паузы
   */
  resumeStep: async (params: StepActionParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/training/step/resume", {
      method: "POST",
      body: params,
      suppressSubscriptionPaywall: true,
    });
  },

  /**
   * Сбросить шаг (таймер) в NOT_STARTED
   */
  resetStep: async (params: ResetStepParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/training/step/reset", {
      method: "POST",
      body: params,
      suppressSubscriptionPaywall: true,
    });
  },

  /**
   * Завершить теоретический шаг
   */
  completeTheoryStep: async (params: CompleteStepParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/training/step/complete/theory", {
      method: "POST",
      body: params,
      suppressSubscriptionPaywall: true,
    });
  },

  /**
   * Завершить практический шаг
   */
  completePracticeStep: async (params: CompleteStepParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/training/step/complete/practice", {
      method: "POST",
      body: params,
      suppressSubscriptionPaywall: true,
    });
  },

  postDiaryEntry: async (dayOnCourseId: string, content: string): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/training/diary", {
      method: "POST",
      body: { dayOnCourseId, content },
      suppressSubscriptionPaywall: true,
    });
  },

  getDiaryEntries: async (
    courseId: string,
    upToDayOnCourseId?: string,
  ): Promise<ApiResponse<DiaryRead["data"]>> => {
    const params = new URLSearchParams({ courseId });
    if (upToDayOnCourseId) params.set("upToDayOnCourseId", upToDayOnCourseId);
    return apiClient<DiaryRead["data"]>(`/api/v1/training/diary?${params.toString()}`, {
      suppressSubscriptionPaywall: true,
    });
  },

  /**
   * Получить signed URL для видео (HLS манифест)
   * Использует POST endpoint /api/v1/training/video/url
   */
  async getVideoUrl(
    videoUrl: string,
  ): Promise<ApiResponse<{ url: string; videoId?: string; posterUrl?: string }>> {
    return apiClient<{ url: string; videoId?: string; posterUrl?: string }>(
      "/api/v1/training/video/url",
      {
        method: "POST",
        body: { videoUrl },
        suppressSubscriptionPaywall: true,
      },
    );
  },

  async getVideoProgress(
    videoId: string,
  ): Promise<ApiResponse<{ lastPositionSec: number } | null>> {
    return apiClient<{ lastPositionSec: number } | null>(
      `/api/v1/training/video/${encodeURIComponent(videoId)}/progress`,
      { suppressSubscriptionPaywall: true },
    );
  },

  async saveVideoProgress(videoId: string, positionSec: number): Promise<ApiResponse<void>> {
    return apiClient<void>(`/api/v1/training/video/${encodeURIComponent(videoId)}/progress`, {
      method: "POST",
      body: { positionSec },
      suppressSubscriptionPaywall: true,
    });
  },
};
