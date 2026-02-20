import { describe, expect, it } from "vitest";

import {
  validateStepFormData,
  hasValidationErrors,
  getValidationErrors,
} from "./validation";

describe("validateStepFormData", () => {
  it("returns null errors for valid TRAINING step", () => {
    const result = validateStepFormData({
      title: "Тренировка",
      description: "Описание минимум 10 символов",
      type: "TRAINING",
      duration: "60",
    });
    expect(hasValidationErrors(result)).toBe(false);
  });

  it("returns title error when empty", () => {
    const result = validateStepFormData({
      title: "",
      description: "Описание минимум 10 символов",
      type: "TRAINING",
      duration: "60",
    });
    expect(result.title).toBe("Название обязательно");
  });

  it("returns description error when too short", () => {
    const result = validateStepFormData({
      title: "Шаг",
      description: "Короткое",
      type: "TRAINING",
      duration: "60",
    });
    expect(result.description).toBe("Минимум 10 символов");
  });

  it("returns type error for invalid type", () => {
    const result = validateStepFormData({
      title: "Шаг",
      description: "Описание минимум 10 символов",
      type: "INVALID",
    });
    expect(result.type).toBe("Неверный тип шага");
  });

  it("returns duration error for TRAINING without duration", () => {
    const result = validateStepFormData({
      title: "Шаг",
      description: "Описание минимум 10 символов",
      type: "TRAINING",
      duration: "",
    });
    expect(result.duration).toBe("Длительность обязательна");
  });

  it("accepts EXAMINATION without duration", () => {
    const result = validateStepFormData({
      title: "Экзамен",
      description: "Описание минимум 10 символов",
      type: "EXAMINATION",
    });
    expect(result.duration).toBeNull();
  });

  it("returns videoUrl error for invalid URL", () => {
    const result = validateStepFormData({
      title: "Шаг",
      description: "Описание минимум 10 символов",
      type: "TRAINING",
      duration: "60",
      videoUrl: "not-a-valid-url",
    });
    expect(result.videoUrl).toBe("Неверный формат ссылки на видео");
  });

  it("accepts valid CDN video URL", () => {
    const result = validateStepFormData({
      title: "Шаг",
      description: "Описание минимум 10 символов",
      type: "TRAINING",
      duration: "60",
      videoUrl: "https://gafus-media.storage.yandexcloud.net/uploads/video.mp4",
    });
    expect(result.videoUrl).toBeNull();
  });

  it("returns checklist error for EXAMINATION with hasTestQuestions but empty checklist", () => {
    const result = validateStepFormData({
      title: "Экзамен",
      description: "Описание минимум 10 символов",
      type: "EXAMINATION",
      checklist: "",
      hasTestQuestions: true,
    });
    expect(result.checklist).toBe(
      "Для тестовых вопросов необходимо добавить хотя бы один вопрос",
    );
  });

  it("returns checklist error for invalid JSON", () => {
    const result = validateStepFormData({
      title: "Экзамен",
      description: "Описание минимум 10 символов",
      type: "EXAMINATION",
      checklist: "not-json",
      hasTestQuestions: true,
    });
    expect(result.checklist).toBe("Неверный формат чек-листа");
  });

  it("returns checklist error when not array", () => {
    const result = validateStepFormData({
      title: "Экзамен",
      description: "Описание минимум 10 символов",
      type: "EXAMINATION",
      checklist: "{}",
      hasTestQuestions: true,
    });
    expect(result.checklist).toBe("Чек-лист должен быть массивом");
  });

  it("returns checklist error for empty array", () => {
    const result = validateStepFormData({
      title: "Экзамен",
      description: "Описание минимум 10 символов",
      type: "EXAMINATION",
      checklist: "[]",
      hasTestQuestions: true,
    });
    expect(result.checklist).toBe("Добавьте хотя бы один вопрос");
  });

  it("accepts valid checklist for EXAMINATION", () => {
    const result = validateStepFormData({
      title: "Экзамен",
      description: "Описание минимум 10 символов",
      type: "EXAMINATION",
      checklist: JSON.stringify([
        {
          id: "q1",
          question: "Вопрос 1?",
          options: ["A", "B"],
        },
      ]),
      hasTestQuestions: true,
    });
    expect(result.checklist).toBeNull();
  });
});

describe("hasValidationErrors", () => {
  it("returns false when all null", () => {
    expect(
      hasValidationErrors({
        title: null,
        description: null,
        type: null,
        duration: null,
        videoUrl: null,
        checklist: null,
      }),
    ).toBe(false);
  });

  it("returns true when any error", () => {
    expect(
      hasValidationErrors({
        title: "Ошибка",
        description: null,
        type: null,
        duration: null,
        videoUrl: null,
        checklist: null,
      }),
    ).toBe(true);
  });
});

describe("getValidationErrors", () => {
  it("returns array of error messages", () => {
    const errors = getValidationErrors({
      title: "Ошибка 1",
      description: "Ошибка 2",
      type: null,
      duration: null,
      videoUrl: null,
      checklist: null,
    });
    expect(errors).toEqual(["Ошибка 1", "Ошибка 2"]);
  });
});
