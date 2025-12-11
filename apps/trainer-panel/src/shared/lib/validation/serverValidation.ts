import type { ValidationResult } from "@gafus/types";

// Серверная валидация для создания шага
export function validateStepForm(data: {
  title: string;
  description: string;
  duration: string;
  videoUrl?: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  // Валидация названия
  if (!data.title || data.title.trim().length === 0) {
    errors.title = "Название шага обязательно";
  } else if (data.title.length < 3) {
    errors.title = "Название должно содержать минимум 3 символа";
  } else if (data.title.length > 100) {
    errors.title = "Название не может быть длиннее 100 символов";
  } else if (!/^[а-яёА-ЯЁa-zA-Z0-9\s\-–—_.,!?()]+$/.test(data.title)) {
    errors.title = "Название содержит недопустимые символы";
  }

  // Валидация описания
  if (!data.description || data.description.trim().length === 0) {
    errors.description = "Описание шага обязательно";
  } else if (data.description.length < 10) {
    errors.description = "Описание должно содержать минимум 10 символов";
  } else if (data.description.length > 2000) {
    errors.description = "Описание не может быть длиннее 2000 символов";
  }

  // Валидация длительности
  if (!data.duration || data.duration.trim().length === 0) {
    errors.duration = "Длительность обязательна";
  } else {
    const duration = parseInt(data.duration, 10);
    if (isNaN(duration)) {
      errors.duration = "Длительность должна быть числом";
    } else if (duration <= 0) {
      errors.duration = "Длительность должна быть положительным числом";
    } else if (duration > 6000) {
      errors.duration = "Длительность не может быть больше 6000 секунд";
    }
  }

  // Валидация ссылки на видео (необязательное поле)
  if (data.videoUrl && data.videoUrl.trim().length > 0) {
    const urlPattern = /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|rutube\.ru|vimeo\.com|vk\.com|vkvideo\.ru)\/.+/;
    if (!urlPattern.test(data.videoUrl)) {
      errors.videoUrl = "Неверный формат ссылки на видео";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// Серверная валидация для создания курса
export function validateCourseForm(data: {
  name: string;
  description: string;
  shortDesc: string;
  duration: string;
  logoImg: string;
  videoUrl?: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  // Валидация названия курса
  if (!data.name || data.name.trim().length === 0) {
    errors.name = "Название курса обязательно";
  } else if (data.name.length < 3) {
    errors.name = "Название должно содержать минимум 3 символа";
  } else if (data.name.length > 100) {
    errors.name = "Название не может быть длиннее 100 символов";
  } else if (!/^[а-яёА-ЯЁa-zA-Z0-9\s\-–—_.,!?()]+$/.test(data.name)) {
    errors.name = "Название содержит недопустимые символы";
  }

  // Валидация полного описания
  if (!data.description || data.description.trim().length === 0) {
    errors.description = "Полное описание курса обязательно";
  } else if (data.description.length < 10) {
    errors.description = "Описание должно содержать минимум 10 символов";
  } else if (data.description.length > 2000) {
    errors.description = "Описание не может быть длиннее 2000 символов";
  }

  // Валидация краткого описания
  if (!data.shortDesc || data.shortDesc.trim().length === 0) {
    errors.shortDesc = "Краткое описание курса обязательно";
  } else if (data.shortDesc.length < 10) {
    errors.shortDesc = "Краткое описание должно содержать минимум 10 символов";
  } else if (data.shortDesc.length > 500) {
    errors.shortDesc = "Краткое описание не может быть длиннее 500 символов";
  }

  // Валидация продолжительности курса
  if (!data.duration || data.duration.trim().length === 0) {
    errors.duration = "Продолжительность курса обязательна";
  } else if (data.duration.length < 3) {
    errors.duration = "Продолжительность должна содержать минимум 3 символа";
  } else if (data.duration.length > 50) {
    errors.duration = "Продолжительность не может быть длиннее 50 символов";
  }

  // Валидация изображения
  if (!data.logoImg || data.logoImg.trim().length === 0) {
    errors.logoImg = "Изображение курса обязательно";
  }

  // Валидация ссылки на видео (необязательное поле)
  if (data.videoUrl && data.videoUrl.trim().length > 0) {
    const urlPattern = /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|rutube\.ru|vimeo\.com|vk\.com|vkvideo\.ru)\/.+/;
    if (!urlPattern.test(data.videoUrl)) {
      errors.videoUrl = "Неверный формат ссылки на видео";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// Серверная валидация для создания дня тренировки
export function validateTrainingDayForm(data: {
  title: string;
  type: string;
  description: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  // Валидация названия дня
  if (!data.title || data.title.trim().length === 0) {
    errors.title = "Название дня обязательно";
  } else if (data.title.length < 3) {
    errors.title = "Название должно содержать минимум 3 символа";
  } else if (data.title.length > 100) {
    errors.title = "Название не может быть длиннее 100 символов";
  }

  // Валидация типа дня
  if (!data.type || data.type.trim().length === 0) {
    errors.type = "Тип дня обязателен";
  } else {
    const validTypes = ["regular", "introduction", "test", "rest"];
    if (!validTypes.includes(data.type)) {
      errors.type = "Выберите корректный тип дня";
    }
  }

  // Валидация описания дня
  if (!data.description || data.description.trim().length === 0) {
    errors.description = "Описание дня обязательно";
  } else if (data.description.length < 10) {
    errors.description = "Описание должно содержать минимум 10 символов";
  } else if (data.description.length > 2000) {
    errors.description = "Описание не может быть длиннее 2000 символов";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// Универсальная функция валидации
export function validateForm<T extends Record<string, unknown>>(
  data: T,
  validationRules: Record<string, (value: unknown) => string | null>,
): ValidationResult {
  const errors: Record<string, string> = {};

  for (const [field, validator] of Object.entries(validationRules)) {
    const error = validator(data[field]);
    if (error) {
      errors[field] = error;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// Хелперы для создания валидаторов
export const validators = {
  required:
    (message = "Поле обязательно") =>
    (value: unknown) =>
      !value || (typeof value === "string" && value.trim() === "") ? message : null,

  minLength: (min: number, message: string) => (value: string) =>
    !value || value.length < min ? message : null,

  maxLength: (max: number, message: string) => (value: string) =>
    value && value.length > max ? message : null,

  pattern: (regex: RegExp, message: string) => (value: string) =>
    value && !regex.test(value) ? message : null,

  number: (min?: number, max?: number, message?: string) => (value: unknown) => {
    if (value === undefined || value === null || value === "") return null;
    const num = Number(value);
    if (isNaN(num)) return message || "Должно быть числом";
    if (min !== undefined && num < min) return message || `Минимум ${min}`;
    if (max !== undefined && num > max) return message || `Максимум ${max}`;
    return null;
  },

  url:
    (message = "Неверный формат ссылки") =>
    (value: string) => {
      if (!value) return null;
      const urlPattern = /^https?:\/\/.+/;
      return urlPattern.test(value) ? null : message;
    },

  videoUrl:
    (message = "Неверный формат ссылки на видео") =>
    (value: string) => {
      if (!value) return null;
      const urlPattern = /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|rutube\.ru|vimeo\.com|vk\.com|vkvideo\.ru)\/.+/;
      return urlPattern.test(value) ? null : message;
    },
};
