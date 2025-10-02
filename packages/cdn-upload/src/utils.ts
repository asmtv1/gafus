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
  if (path.startsWith('http')) {
    return path;
  }
  
  // Убираем ведущий слеш если есть
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  // Возвращаем полный CDN URL
  return `https://gafus-media.storage.yandexcloud.net/${cleanPath}`;
}

/**
 * Проверяет, является ли путь CDN URL
 * @param path - путь для проверки
 * @returns true если это CDN URL
 */
export function isCDNUrl(path: string): boolean {
  return path.startsWith('https://gafus-media.storage.yandexcloud.net/');
}
