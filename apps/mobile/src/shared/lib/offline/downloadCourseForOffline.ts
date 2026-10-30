/**
 * Скачивание одного курса целиком: API → meta → HLS-видео → изображения и PDF.
 * Проверка места на диске, отмена через AbortSignal, при ошибке — откат (deleteCourseData).
 */
import { reportClientError } from "@/shared/lib/tracer";
import * as FileSystem from "expo-file-system/legacy";
import { offlineApi, type FullCourseData } from "@/shared/lib/api/offline";
import { getVideoIdFromUrl } from "@/shared/lib/utils/videoUrl";
import { saveCourseMeta, deleteCourseData, assertSafeOfflineSegment } from "./offlineStorage";
import { downloadHLSForOffline } from "./downloadHLSForOffline";
import { throwIfOfflineDownloadAborted } from "./downloadAbort";

const MIN_FREE_BYTES = 500 * 1024 * 1024; // 500 МБ
const NETWORK_RETRY_ATTEMPTS = 3;

// Prevent overlapping JS calls from writing into the same native course path.
const activeOfflineDownloads = new Set<string>();

/** Only our trainer-video storage hosts are supported by /training/video/url. */
function isCdnVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && (
      (parsed.hostname === "gafus-media.storage.yandexcloud.net" &&
        parsed.pathname.startsWith("/uploads/trainers/")) ||
      (parsed.hostname === "storage.yandexcloud.net" &&
        parsed.pathname.startsWith("/gafus-media/uploads/trainers/"))
    );
  } catch {
    return false;
  }
}

/** Preserve the original file basename, not signed URL query parameters. */
function getSafeAssetFileName(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    // Preserve the existing support for relative URLs.
    pathname = url.split("?")[0] ?? "";
  }
  const fileName = pathname.split("/").pop() ?? "";
  assertSafeOfflineSegment(fileName);
  return fileName;
}

export type DownloadCoursePhase = "meta" | "videos" | "images" | "pdfs" | "done";

export interface DownloadCourseProgress {
  phase: DownloadCoursePhase;
  current: number;
  total: number;
  label?: string;
}

/**
 * Проверяет доступное место на диске. Возвращает true, если места достаточно.
 */
export async function hasEnoughDiskSpace(): Promise<boolean> {
  /* eslint-disable @gafus/require-client-catch-tracer -- API FileSystem может вернуть ошибку; считаем места нет */
  try {
    const free = await FileSystem.getFreeDiskStorageAsync();
    return free >= MIN_FREE_BYTES;
  } catch {
    return false;
  }
  /* eslint-enable @gafus/require-client-catch-tracer */
}

/**
 * Скачивает один курс. При ошибке (кроме отмены) откатывает папку курса.
 * При сетевой ошибке повторяет до NETWORK_RETRY_ATTEMPTS раз.
 */
export async function downloadCourseForOffline(
  courseType: string,
  onProgress: (p: DownloadCourseProgress) => void,
  signal?: AbortSignal,
): Promise<{ success: true; version: string } | { success: false; error: string; code?: string }> {
  try {
    assertSafeOfflineSegment(courseType);
  } catch {
    return {
      success: false,
      error: "Недопустимый идентификатор курса",
      code: "INVALID_COURSE_TYPE",
    };
  }
  if (activeOfflineDownloads.has(courseType)) {
    return {
      success: false,
      error: "Этот курс уже загружается",
      code: "DOWNLOAD_IN_PROGRESS",
    };
  }
  activeOfflineDownloads.add(courseType);
  try {
    // Existing on-device data can belong to another user or an older schema.
    // Refuse implicit overwrite or deletion until ownership is reconciled.
    const doc = FileSystem.documentDirectory;
    if (!doc) {
      return {
        success: false,
        error: "Локальное хранилище недоступно",
        code: "OFFLINE_STORAGE_UNAVAILABLE",
      };
    }
    try {
      const existing = await FileSystem.getInfoAsync(doc + "offline/" + courseType + "/");
      if (existing.exists) {
        return {
          success: false,
          error: "На устройстве уже есть данные курса; требуется безопасное восстановление",
          code: "EXISTING_OFFLINE_DATA",
        };
      }
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "OfflineDownload",
        keys: { operation: "probe_existing_course", courseType },
      });
      return {
        success: false,
        error: "Не удалось проверить локальные данные курса",
        code: "OFFLINE_STORAGE_UNAVAILABLE",
      };
    }

    let lastNetworkError: Error | null = null;
    for (let attempt = 1; attempt <= NETWORK_RETRY_ATTEMPTS; attempt++) {
      if (signal?.aborted) {
        return { success: false, error: "Отменено", code: "ABORTED" };
      }
      try {
        const result = await runDownload(courseType, onProgress, signal);
        return result;
      } catch (err) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        if (isAbort) {
          await deleteCourseData(courseType);
          return { success: false, error: "Отменено", code: "ABORTED" };
        }
        const isNetwork =
          err instanceof TypeError ||
          (err instanceof Error &&
            (err.message.includes("network") || err.message.includes("fetch")));
        if (isNetwork) {
          lastNetworkError = err instanceof Error ? err : new Error(String(err));
          continue;
        }
        const errorObj = err instanceof Error ? err : new Error(String(err));
        reportClientError(errorObj, {
          issueKey: "OfflineDownload",
          keys: { operation: "download_course", courseType },
        });
        await deleteCourseData(courseType);
        return {
          success: false,
          error: errorObj.message,
          code: "DOWNLOAD_ERROR",
        };
      }
    }
    if (lastNetworkError) {
      reportClientError(lastNetworkError, {
        issueKey: "OfflineDownload",
        keys: { operation: "download_course_retries", courseType },
      });
    }
    await deleteCourseData(courseType);
    return {
      success: false,
      error: lastNetworkError?.message || "Ошибка сети. Повторите позже.",
      code: "NETWORK_ERROR",
    };
  } finally {
    activeOfflineDownloads.delete(courseType);
  }
}

async function runDownload(
  courseType: string,
  onProgress: (p: DownloadCourseProgress) => void,
  signal?: AbortSignal,
): Promise<{ success: true; version: string } | { success: false; error: string; code?: string }> {
  throwIfOfflineDownloadAborted(signal);
  onProgress({ phase: "meta", current: 0, total: 1, label: "Загрузка данных..." });
  const apiResult = await offlineApi.downloadCourse(courseType);

  if (
    apiResult.code === "COURSE_ACCESS_DENIED" ||
    (apiResult as { code?: string }).code === "COURSE_ACCESS_DENIED"
  ) {
    return { success: false, error: "Нет доступа к курсу", code: "COURSE_ACCESS_DENIED" };
  }
  if (!apiResult.success || !apiResult.data) {
    return {
      success: false,
      error: apiResult.error || "Не удалось загрузить курс",
      code: apiResult.code,
    };
  }

  const data = apiResult.data as FullCourseData;
  // External video services and unknown storage hosts cannot be replayed as
  // local HLS. Never label a course "downloaded" while silently skipping video.
  const unsupportedVideo = data.mediaFiles.videos.some((url) => {
    if (!isCdnVideoUrl(url)) return true;
    const id = getVideoIdFromUrl(url);
    if (!id) return true;
    try {
      assertSafeOfflineSegment(id);
      return false;
    } catch {
      return true;
    }
  });
  if (unsupportedVideo) {
    return {
      success: false,
      code: "OFFLINE_VIDEO_UNSUPPORTED",
      error: "Курс содержит видео из внешнего или неподдерживаемого источника. Сохранить весь курс для просмотра без интернета нельзя.",
    };
  }
  const downloadedAt = new Date().toISOString();
  await saveCourseMeta(courseType, {
    course: data.course,
    trainingDays: data.trainingDays ?? [],
    version: data.course.updatedAt,
    downloadedAt,
  });
  onProgress({ phase: "meta", current: 1, total: 1 });

  const cdnVideos = data.mediaFiles.videos;
  const totalVideos = cdnVideos.length;
  const totalImages = data.mediaFiles.images.length;
  const totalPdfs = data.mediaFiles.pdfs.length;
  const totalMedia = totalVideos + totalImages + totalPdfs;

  let done = 0;
  const report = (label?: string) => {
    done++;
    onProgress({
      phase: done <= totalVideos ? "videos" : done <= totalVideos + totalImages ? "images" : "pdfs",
      current: done,
      total: totalMedia,
      label,
    });
  };

  for (let i = 0; i < cdnVideos.length; i++) {
    throwIfOfflineDownloadAborted(signal);
    const videoUrl = cdnVideos[i];
    const videoId = getVideoIdFromUrl(videoUrl);
    if (!videoId) {
      report();
      continue;
    }
    await downloadHLSForOffline(videoUrl, courseType, videoId, undefined, signal);
    report(`Видео ${i + 1}/${totalVideos}`);
  }

  const doc = FileSystem.documentDirectory;
  if (!doc) throw new Error("documentDirectory недоступен");
  const baseUri = `${doc}offline/${courseType}`;
  const imagesUri = `${baseUri}/images/`;
  const pdfsUri = `${baseUri}/pdfs/`;
  await FileSystem.makeDirectoryAsync(imagesUri, { intermediates: true });
  await FileSystem.makeDirectoryAsync(pdfsUri, { intermediates: true });

  const downloadFile = async (url: string, dirUri: string, fileName: string): Promise<void> => {
    assertSafeOfflineSegment(fileName);
    const resp = await fetch(url, { signal });
    throwIfOfflineDownloadAborted(signal);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    throwIfOfflineDownloadAborted(signal);
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
    }
    const base64 = btoa(binary);
    await FileSystem.writeAsStringAsync(`${dirUri}${fileName}`, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    throwIfOfflineDownloadAborted(signal);
  };

  for (const url of data.mediaFiles.images) {
    throwIfOfflineDownloadAborted(signal);
    try {
      const name = getSafeAssetFileName(url);
      await downloadFile(url, imagesUri, name);
    } catch (error) {
      throwIfOfflineDownloadAborted(signal);
      if (error instanceof Error && error.name === "AbortError") throw error;
      // Пропускаем при ошибке одного изображения
    }
    report();
  }
  for (const url of data.mediaFiles.pdfs) {
    throwIfOfflineDownloadAborted(signal);
    try {
      const name = getSafeAssetFileName(url);
      await downloadFile(url, pdfsUri, name);
    } catch (error) {
      throwIfOfflineDownloadAborted(signal);
      if (error instanceof Error && error.name === "AbortError") throw error;
      // Пропускаем при ошибке одного PDF
    }
    report();
  }

  throwIfOfflineDownloadAborted(signal);
  onProgress({ phase: "done", current: totalMedia, total: totalMedia, label: "Готово" });
  return { success: true, version: data.course.updatedAt };
}
