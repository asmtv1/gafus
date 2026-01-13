/**
 * Данные задачи транскодирования видео в HLS
 */
export interface VideoTranscodingJobData {
  videoId: string; // ID видео в БД (TrainerVideo.id)
  trainerId: string; // ID тренера
  originalPath: string; // Относительный путь к оригинальному файлу в Object Storage
}

/**
 * Результат транскодирования видео
 */
export interface VideoTranscodingResult {
  success: boolean;
  hlsManifestPath?: string; // Путь к HLS манифесту в Object Storage
  error?: string; // Текст ошибки если транскодирование провалилось
}
