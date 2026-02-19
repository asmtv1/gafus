/**
 * Валидация загружаемых файлов (изображения, видео).
 * Бизнес-правила типов и размеров — переиспользуются во всех приложениях.
 */

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

const IMAGE_ALLOWED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];
const IMAGE_MAX_SIZE = 10 * 1024 * 1024; // 10MB

const VIDEO_ALLOWED_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
];
const VIDEO_MAX_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * Валидирует загруженное изображение (тип, размер)
 */
export function validateImageUpload(file: File): FileValidationResult {
  if (!IMAGE_ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: "Неподдерживаемый тип файла. Разрешены только JPEG, PNG и WebP",
    };
  }

  if (file.size > IMAGE_MAX_SIZE) {
    return {
      valid: false,
      error: "Файл слишком большой. Максимальный размер: 10MB",
    };
  }

  return { valid: true };
}

/**
 * Валидирует видео файл перед загрузкой
 */
export function validateVideoUpload(file: File): FileValidationResult {
  if (!VIDEO_ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: "Неподдерживаемый тип видео. Разрешены только MP4, MOV, AVI",
    };
  }

  if (file.size > VIDEO_MAX_SIZE) {
    return {
      valid: false,
      error: "Видео слишком большое. Максимальный размер: 100MB",
    };
  }

  return { valid: true };
}
