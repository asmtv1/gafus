/**
 * Утилиты для работы с CDN URL
 */

/**
 * Преобразует относительный путь в полный CDN URL
 * @param path - относительный путь (например: "/uploads/steps/image.png")
 * @returns полный CDN URL
 */
export function getCDNUrl(path: string): string {
  // Если уже полный URL, возвращаем как есть
  if (path.startsWith("http")) {
    return path;
  }

  // Убираем ведущий слеш если есть
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;

  // Возвращаем полный CDN URL
  return `https://storage.yandexcloud.net/gafus-media/${cleanPath}`;
}

/**
 * Извлекает относительный путь из полного CDN URL
 * Поддерживает оба формата URL для обратной совместимости
 * @param cdnUrl - полный CDN URL
 * @returns относительный путь (например: "uploads/steps/image.png")
 */
export function getRelativePathFromCDNUrl(cdnUrl: string): string {
  // Новый формат: https://storage.yandexcloud.net/gafus-media/uploads/...
  if (cdnUrl.startsWith("https://storage.yandexcloud.net/gafus-media/")) {
    return cdnUrl.replace("https://storage.yandexcloud.net/gafus-media/", "");
  }

  // Старый формат: https://gafus-media.storage.yandexcloud.net/uploads/...
  if (cdnUrl.startsWith("https://gafus-media.storage.yandexcloud.net/")) {
    return cdnUrl.replace("https://gafus-media.storage.yandexcloud.net/", "");
  }

  // Если это не CDN URL, возвращаем как есть
  return cdnUrl;
}

/**
 * Проверяет, является ли путь CDN URL
 * @param path - путь для проверки
 * @returns true если это CDN URL
 */
export function isCDNUrl(path: string): boolean {
  return (
    path.startsWith("https://storage.yandexcloud.net/gafus-media/") ||
    path.startsWith("https://gafus-media.storage.yandexcloud.net/")
  ); // Поддержка старого формата
}

/**
 * Извлекает videoId (TrainerVideo.id) из CDN URL видео.
 * Путь в CDN: .../videocourses/{videoId}/...
 * @param cdnUrl - полный CDN URL или относительный путь
 * @returns videoId или null
 */
export function extractVideoIdFromCdnUrl(cdnUrl: string): string | null {
  const match = cdnUrl.match(/videocourses\/([^/]+)/);
  return match ? match[1] : null;
}
