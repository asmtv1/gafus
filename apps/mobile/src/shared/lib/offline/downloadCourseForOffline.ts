/**
 * Скачивание одного курса целиком: API → meta → HLS-видео → изображения и PDF.
 * Проверка места на диске, отмена через AbortSignal, при ошибке — откат (deleteCourseData).
 */
import * as FileSystem from "expo-file-system/legacy";
import { offlineApi, type FullCourseData } from "@/shared/lib/api/offline";
import { getVideoIdFromUrl } from "@/shared/lib/utils/videoUrl";
import { saveCourseMeta, deleteCourseData } from "./offlineStorage";
import { downloadHLSForOffline } from "./downloadHLSForOffline";

const MIN_FREE_BYTES = 500 * 1024 * 1024; // 500 МБ
const NETWORK_RETRY_ATTEMPTS = 3;

const CDN_HOSTS = [
  "gafus-media.storage.yandexcloud.net",
  "storage.yandexcloud.net/gafus-media",
];

function isCdnVideoUrl(url: string): boolean {
  return CDN_HOSTS.some((h) => url.includes(h));
}

export type DownloadCoursePhase =
  | "meta"
  | "videos"
  | "images"
  | "pdfs"
  | "done";

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
  try {
    const free = await FileSystem.getFreeDiskStorageAsync();
    return free >= MIN_FREE_BYTES;
  } catch {
    return false;
  }
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
        (err instanceof Error && (err.message.includes("network") || err.message.includes("fetch")));
      if (isNetwork) {
        lastNetworkError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
      await deleteCourseData(courseType);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Ошибка скачивания",
        code: "DOWNLOAD_ERROR",
      };
    }
  }
  await deleteCourseData(courseType);
  return {
    success: false,
    error: lastNetworkError?.message || "Ошибка сети. Повторите позже.",
    code: "NETWORK_ERROR",
  };
}

async function runDownload(
  courseType: string,
  onProgress: (p: DownloadCourseProgress) => void,
  signal?: AbortSignal,
): Promise<{ success: true; version: string } | { success: false; error: string; code?: string }> {
  onProgress({ phase: "meta", current: 0, total: 1, label: "Загрузка данных..." });
  const apiResult = await offlineApi.downloadCourse(courseType);

  if (apiResult.code === "COURSE_ACCESS_DENIED" || (apiResult as { code?: string }).code === "COURSE_ACCESS_DENIED") {
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
  const downloadedAt = new Date().toISOString();
  await saveCourseMeta(courseType, {
    course: data.course,
    trainingDays: data.trainingDays,
    version: data.course.updatedAt,
    downloadedAt,
  });
  onProgress({ phase: "meta", current: 1, total: 1 });

  const cdnVideos = data.mediaFiles.videos.filter(isCdnVideoUrl);
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
    if (signal?.aborted) throw new Error("aborted");
    const videoUrl = cdnVideos[i];
    const videoId = getVideoIdFromUrl(videoUrl);
    if (!videoId) {
      report();
      continue;
    }
    await downloadHLSForOffline(
      videoUrl,
      courseType,
      videoId,
      (p) => report(`Видео ${i + 1}/${totalVideos}`),
      signal,
    );
    report();
  }

  const doc = FileSystem.documentDirectory;
  if (!doc) throw new Error("documentDirectory недоступен");
  const baseUri = `${doc}offline/${courseType}`;
  const imagesUri = `${baseUri}/images/`;
  const pdfsUri = `${baseUri}/pdfs/`;
  await FileSystem.makeDirectoryAsync(imagesUri, { intermediates: true });
  await FileSystem.makeDirectoryAsync(pdfsUri, { intermediates: true });

  const downloadFile = async (url: string, dirUri: string, fileName: string): Promise<void> => {
    const resp = await fetch(url, { signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
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
  };

  for (const url of data.mediaFiles.images) {
    if (signal?.aborted) throw new Error("aborted");
    const name = url.split("/").pop() || `img_${done}.bin`;
    try {
      await downloadFile(url, imagesUri, name);
    } catch {
      // Пропускаем при ошибке одного изображения
    }
    report();
  }
  for (const url of data.mediaFiles.pdfs) {
    if (signal?.aborted) throw new Error("aborted");
    const name = url.split("/").pop() || `doc_${done}.pdf`;
    try {
      await downloadFile(url, pdfsUri, name);
    } catch {
      // Пропускаем при ошибке одного PDF
    }
    report();
  }

  onProgress({ phase: "done", current: totalMedia, total: totalMedia, label: "Готово" });
  return { success: true, version: data.course.updatedAt };
}
