import { Parser } from "m3u8-parser";

/**
 * Структура HLS данных в IndexedDB
 */
export interface HLSManifestCache {
  manifestUrl: string; // Оригинальный URL манифеста
  manifest: string; // Содержимое playlist.m3u8
  segments: Record<string, Blob>; // { "segment-000.ts": Blob, ... }
}

/**
 * Скачивает HLS манифест и все сегменты для офлайн-использования
 * @param manifestUrl - URL HLS манифеста
 * @param onProgress - Колбэк для отслеживания прогресса
 * @returns HLS данные для сохранения в IndexedDB
 */
export async function downloadHLSForOffline(
  manifestUrl: string,
  onProgress?: (downloaded: number, total: number) => void
): Promise<HLSManifestCache> {
  try {
    // 1. Скачиваем манифест
    const manifestResponse = await fetch(manifestUrl);
    if (!manifestResponse.ok) {
      throw new Error(`Не удалось скачать манифест: ${manifestResponse.statusText}`);
    }
    const manifestText = await manifestResponse.text();

    // 2. Парсим манифест для извлечения URL сегментов
    const parser = new Parser();
    parser.push(manifestText);
    parser.end();

    const parsed = parser.manifest;

    // Извлекаем URL сегментов
    const segmentUrls: string[] = [];
    
    if (parsed.segments && Array.isArray(parsed.segments)) {
      for (const segment of parsed.segments) {
        if (segment.uri) {
          // Формируем полный URL сегмента (относительно манифеста)
          const segmentUrl = new URL(segment.uri, manifestUrl).toString();
          segmentUrls.push(segmentUrl);
        }
      }
    }

    if (segmentUrls.length === 0) {
      throw new Error("Не найдено ни одного сегмента в манифесте");
    }

    // 3. Скачиваем все сегменты
    const segments: Record<string, Blob> = {};
    let downloaded = 0;
    const total = segmentUrls.length;

    for (const segmentUrl of segmentUrls) {
      const segmentResponse = await fetch(segmentUrl);
      if (!segmentResponse.ok) {
        throw new Error(`Не удалось скачать сегмент: ${segmentUrl}`);
      }

      const segmentBlob = await segmentResponse.blob();
      
      // Используем имя файла как ключ
      const segmentName = segmentUrl.split("/").pop() || `segment-${downloaded}`;
      segments[segmentName] = segmentBlob;

      downloaded++;
      if (onProgress) {
        onProgress(downloaded, total);
      }
    }

    return {
      manifestUrl,
      manifest: manifestText,
      segments,
    };
  } catch (error) {
    console.error("Ошибка скачивания HLS для офлайна:", error);
    throw error;
  }
}

/**
 * Создаёт локальный HLS манифест с blob URLs для офлайн-воспроизведения
 * @param hlsCache - Кэшированные HLS данные из IndexedDB
 * @returns Blob URL для локального манифеста
 */
export function createOfflineHLSManifest(hlsCache: HLSManifestCache): string {
  const { manifest, segments } = hlsCache;

  // Парсим оригинальный манифест
  const lines = manifest.split("\n");

  // Заменяем URL сегментов на blob URLs
  const modifiedLines = lines.map((line) => {
    const trimmedLine = line.trim();
    
    // Если строка - это URL сегмента (не начинается с # и не пустая)
    if (trimmedLine && !trimmedLine.startsWith("#")) {
      // Ищем сегмент в нашем кэше
      const segmentBlob = segments[trimmedLine];
      
      if (segmentBlob) {
        // Создаём blob URL для сегмента
        return URL.createObjectURL(segmentBlob);
      }
      
      console.warn(`Сегмент не найден в кэше: ${trimmedLine}`);
      return line;
    }
    
    return line;
  });

  // Создаём blob URL для модифицированного манифеста
  const modifiedManifest = modifiedLines.join("\n");
  const manifestBlob = new Blob([modifiedManifest], { type: "application/vnd.apple.mpegurl" });
  
  return URL.createObjectURL(manifestBlob);
}

/**
 * Проверяет доступное место в IndexedDB
 * @returns Объект с информацией о квоте
 */
export async function checkIndexedDBQuota(): Promise<{
  usage: number; // Использовано байт
  quota: number; // Квота байт
  available: number; // Доступно байт
  percentUsed: number; // Процент использования
}> {
  if (!navigator.storage || !navigator.storage.estimate) {
    // Браузер не поддерживает Storage API, возвращаем большую квоту
    return {
      usage: 0,
      quota: 1024 * 1024 * 1024 * 10, // 10GB
      available: 1024 * 1024 * 1024 * 10,
      percentUsed: 0,
    };
  }

  const estimate = await navigator.storage.estimate();
  const usage = estimate.usage || 0;
  const quota = estimate.quota || 0;
  const available = quota - usage;
  const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;

  return {
    usage,
    quota,
    available,
    percentUsed,
  };
}

/**
 * Форматирует размер в байтах в читаемый формат
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Байт";

  const k = 1024;
  const sizes = ["Байт", "КБ", "МБ", "ГБ"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}
