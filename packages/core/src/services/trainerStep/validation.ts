/**
 * Валидация данных формы шага (createStep/updateStep).
 * Централизованные правила валидации — используются в обоих местах.
 */

import type { ChecklistQuestion } from "@gafus/types";

const VALID_STEP_TYPES = [
  "TRAINING",
  "EXAMINATION",
  "THEORY",
  "BREAK",
  "PRACTICE",
  "DIARY",
] as const;

const MAX_COMMENT_LENGTH = 500;
const EXTERNAL_VIDEO_PATTERN =
  /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|rutube\.ru|vimeo\.com|vk\.com|vkvideo\.ru)\/.+/;
const CDN_URL_PATTERN =
  /^https:\/\/gafus-media\.storage\.yandexcloud\.net\/uploads\/.+/;

export interface StepFormData {
  title: string;
  description: string;
  type: string;
  duration?: string | null;
  videoUrl?: string | null;
  checklist?: string | null;
  hasTestQuestions?: boolean;
}

export interface StepFormValidationResult {
  title: string | null;
  description: string | null;
  type: string | null;
  duration: string | null;
  videoUrl: string | null;
  checklist: string | null;
}

/** Результат валидации формы: null — валидно, строка — сообщение об ошибке */
export type ValidationError = string | null;

/**
 * Валидирует данные шага перед созданием/обновлением.
 * Используется в createStep и updateStep.
 */
export function validateStepFormData(data: StepFormData): StepFormValidationResult {
  return {
    title: validateTitle(data.title),
    description: validateDescription(data.description),
    type: validateType(data.type),
    duration: validateDuration(data.type, data.duration),
    videoUrl: validateVideoUrl(data.type, data.videoUrl),
    checklist: validateChecklist(
      data.type,
      data.checklist,
      data.hasTestQuestions ?? false,
    ),
  };
}

/** Проверяет, что валидация прошла успешно (нет ошибок) */
export function hasValidationErrors(
  result: StepFormValidationResult,
): boolean {
  return Object.values(result).some((v) => v !== null);
}

/** Возвращает массив сообщений об ошибках */
export function getValidationErrors(
  result: StepFormValidationResult,
): string[] {
  return Object.values(result).filter((v): v is string => v !== null);
}

function validateTitle(title: string): ValidationError {
  const v = String(title ?? "");
  if (!v || v.trim().length === 0) return "Название обязательно";
  if (v.length < 3) return "Минимум 3 символа";
  if (v.length > 100) return "Максимум 100 символов";
  return null;
}

function validateDescription(description: string): ValidationError {
  const v = String(description ?? "");
  if (!v || v.trim().length === 0) return "Описание обязательно";
  if (v.length < 10) return "Минимум 10 символов";
  if (v.length > 3000) return "Максимум 3000 символов";
  return null;
}

function validateType(type: string): ValidationError {
  const v = String(type ?? "");
  if (!v || v.trim().length === 0) return "Тип шага обязателен";
  if (!VALID_STEP_TYPES.includes(v as (typeof VALID_STEP_TYPES)[number])) {
    return "Неверный тип шага";
  }
  return null;
}

function validateDuration(type: string, duration: string | null | undefined): ValidationError {
  const v = String(duration ?? "");
  if (
    type === "EXAMINATION" ||
    type === "THEORY" ||
    type === "PRACTICE" ||
    type === "DIARY"
  ) {
    return null;
  }
  if (type === "TRAINING" || type === "BREAK") {
    if (!v || v.trim().length === 0) return "Длительность обязательна";
  } else {
    return null;
  }
  const num = parseInt(v, 10);
  if (isNaN(num)) return "Должно быть числом";
  if (num <= 0) return "Должно быть положительным числом";
  if (num > 6000) return "Максимум 6000 секунд";
  return null;
}

function validateVideoUrl(type: string, videoUrl: string | null | undefined): ValidationError {
  const v = String(videoUrl ?? "");
  if (!v) return null;
  if (type !== "TRAINING" && type !== "THEORY" && type !== "PRACTICE") {
    return null;
  }
  return EXTERNAL_VIDEO_PATTERN.test(v) || CDN_URL_PATTERN.test(v)
    ? null
    : "Неверный формат ссылки на видео";
}

function validateChecklist(
  type: string,
  checklist: string | null | undefined,
  hasTestQuestions: boolean,
): ValidationError {
  if (type !== "EXAMINATION") return null;
  const v = String(checklist ?? "");
  if (!hasTestQuestions) return null;
  if (!v)
    return "Для тестовых вопросов необходимо добавить хотя бы один вопрос";
  try {
    const parsed = JSON.parse(v) as unknown;
    if (!Array.isArray(parsed)) return "Чек-лист должен быть массивом";
    const checklistArr = parsed as ChecklistQuestion[];
    if (checklistArr.length === 0) return "Добавьте хотя бы один вопрос";
    for (const question of checklistArr) {
      if (typeof question !== "object" || question === null)
        return "Каждый вопрос чек-листа должен быть объектом";
      if (!question.id || typeof question.id !== "string")
        return "Каждый вопрос должен иметь идентификатор";
      if (!question.question || question.question.trim().length === 0)
        return "Все вопросы должны иметь текст";
      if (
        !Array.isArray(question.options) ||
        question.options.length < 2
      )
        return "Каждый вопрос должен иметь минимум 2 варианта ответа";
      if (
        question.options.some((opt: string) => !opt || opt.trim().length === 0)
      )
        return "Все варианты ответов должны быть заполнены";
      if (question.comment != null) {
        if (typeof question.comment !== "string")
          return "Комментарий к вопросу должен быть строкой";
        if (question.comment.trim().length > MAX_COMMENT_LENGTH)
          return `Комментарий не должен превышать ${MAX_COMMENT_LENGTH} символов`;
      }
    }
    return null;
  } catch {
    return "Неверный формат чек-листа";
  }
}
