/**
 * Утилиты для работы с видео URL
 * Преобразует CDN URL в HLS формат для воспроизведения
 */

/**
 * Извлекает videoId из URL
 */
function extractVideoIdFromUrl(videoUrl: string): string | null {
  // Для CDN URL вида: https://storage.yandexcloud.net/gafus-media/uploads/videocourses/xxx/original.mp4
  // или: https://storage.yandexcloud.net/gafus-media/uploads/videocourses/xxx/hls/playlist.m3u8
  const cdnMatch = videoUrl.match(/videocourses\/([^\/]+)/);
  if (cdnMatch) {
    return cdnMatch[1];
  }
  return null;
}

/**
 * Преобразует videoUrl в формат для воспроизведения
 * - Для внешних видео (YouTube, VK): возвращает оригинальный URL
 * - Для CDN видео: возвращает URL для получения signed HLS манифеста
 */
export function getVideoUrlForPlayback(videoUrl: string | null | undefined): string | null {
  if (!videoUrl) {
    return null;
  }

  // Внешние видео (YouTube, VK, RuTube) - возвращаем как есть
  const externalPatterns = [
    /youtube\.com/,
    /youtu\.be/,
    /rutube\.ru/,
    /vimeo\.com/,
    /vk\.com\/video/,
    /vkvideo\.ru/,
  ];

  if (externalPatterns.some((pattern) => pattern.test(videoUrl))) {
    return videoUrl;
  }

  // Если уже HLS манифест - возвращаем как есть
  if (videoUrl.endsWith(".m3u8") || videoUrl.includes("/hls/playlist.m3u8")) {
    return videoUrl;
  }

  // Для CDN видео нужно получить signed URL через API
  // Возвращаем null, чтобы компонент мог запросить signed URL
  const isCDNVideo =
    videoUrl.includes("gafus-media.storage.yandexcloud.net") ||
    videoUrl.includes("storage.yandexcloud.net/gafus-media");

  if (isCDNVideo) {
    // URL будет получен через API запрос
    return null;
  }

  // Для других URL возвращаем как есть
  return videoUrl;
}

/**
 * Получает videoId из URL для запроса signed URL
 */
export function getVideoIdFromUrl(videoUrl: string | null | undefined): string | null {
  if (!videoUrl) return null;
  return extractVideoIdFromUrl(videoUrl);
}
