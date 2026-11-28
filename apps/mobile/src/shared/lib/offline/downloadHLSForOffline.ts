/**
 * Скачивание HLS-видео для офлайна: signed URL → манифест → сегменты в FileSystem.
 * Переписанный манифест — только имена файлов сегментов (относительные).
 */
import * as FileSystem from "expo-file-system/legacy";

import { trainingApi } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/error-reporting";
import { selectHighestBandwidthVariant } from "./hlsOfflineManifest";
import { assertSafeOfflineSegment, getScopedCourseDirUri } from "./offlineStorage";
import { captureOfflineCourseScope } from "./offlineCourseSession";
import { throwIfOfflineDownloadAborted } from "./downloadAbort";

const CONCURRENCY = 3;
const SEGMENT_RETRIES = 2;

export interface DownloadHLSProgress {
  current: number;
  total: number;
  segmentFileName?: string;
}

/**
 * Извлекает имя файла сегмента из строки манифеста (URL или относительный путь).
 */
function getSegmentFileName(line: string): string {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return "";
  try {
    const url = new URL(trimmed);
    const pathParam = url.searchParams.get("path");
    if (pathParam) {
      const parts = pathParam.split("/");
      return parts[parts.length - 1] || pathParam;
    }
    const pathname = url.pathname;
    const last = pathname.split("/").pop();
    return last || trimmed;
  } catch (error) {
    // Native segment names must not contain a signed URL query or fragment.
    // Keep the full original line for fetching the remote segment.
    const fileName = trimmed.split(/[?#]/)[0] ?? "";
    if (fileName !== trimmed) return fileName;
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "DownloadHLSForOffline",
      keys: { operation: "resolve_segment_url" },
    });
    return trimmed;
  }
}

/**
 * Скачивает один HLS-видео в offline/{courseType}/videos/{videoId}/.
 * Прогресс отдаётся через onProgress(current, total).
 */
export async function downloadHLSForOffline(
  videoUrl: string,
  courseType: string,
  videoId: string,
  onProgress?: (p: DownloadHLSProgress) => void,
  signal?: AbortSignal,
  scope = captureOfflineCourseScope(),
): Promise<void> {
  const assertCurrent = () => {
    throwIfOfflineDownloadAborted(signal);
    if (!scope?.canWrite()) {
      const error = new Error("OFFLINE_COURSE_SESSION_CHANGED");
      error.name = "AbortError";
      throw error;
    }
  };
  assertSafeOfflineSegment(courseType);
  assertSafeOfflineSegment(videoId);
  assertCurrent();
  const res = await trainingApi.getVideoUrl(videoUrl);
  if (!res.success || !res.data?.url) {
    throw new Error(res.error || "Не удалось получить URL видео");
  }
  assertCurrent();
  const rootManifestUrl = res.data.url;

  const doc = FileSystem.documentDirectory;
  if (!doc) throw new Error("documentDirectory недоступен");
  if (!scope) throw new Error("OFFLINE_COURSE_SESSION_REQUIRED");
  const videoDirUri = `${getScopedCourseDirUri(courseType, scope)}videos/${videoId}/`;
  await FileSystem.makeDirectoryAsync(videoDirUri, { intermediates: true });

  const manifestResponse = await fetch(rootManifestUrl, { signal });
  if (!manifestResponse.ok) {
    throw new Error(`Манифест: HTTP ${manifestResponse.status}`);
  }
  let manifestUrl = rootManifestUrl;
  let manifestText = await manifestResponse.text();
  assertCurrent();
  const selectedVariant = selectHighestBandwidthVariant(manifestText);
  if (selectedVariant) {
    manifestUrl = new URL(selectedVariant, rootManifestUrl).toString();
    const variantResponse = await fetch(manifestUrl, { signal });
    if (!variantResponse.ok) {
      throw new Error(`Вариант HLS: HTTP ${variantResponse.status}`);
    }
    manifestText = await variantResponse.text();
    assertCurrent();
  }
  const lines = manifestText.split("\n");

  const segmentLines: { line: string; fileName: string; lineIndex: number }[] = [];
  for (const [lineIndex, line] of lines.entries()) {
    const fileName = getSegmentFileName(line);
    if (fileName) {
      assertSafeOfflineSegment(fileName);
      segmentLines.push({ line, fileName, lineIndex });
    }
  }

  // Multiple source directories can contain e.g. "0001.ts". Never let
  // concurrent downloads overwrite one another, or replace our local
  // manifest / poster. Keep legacy non-colliding filenames unchanged.
  const sourceNames = new Set(segmentLines.map(({ fileName }) => fileName));
  const assignedNames = new Set(["manifest.m3u8", "poster.jpg"]);
  for (const segment of segmentLines) {
    if (assignedNames.has(segment.fileName)) {
      const originalName = segment.fileName;
      let candidate = `segment-${segment.lineIndex}-${originalName}`;
      let disambiguator = 0;
      while (sourceNames.has(candidate) || assignedNames.has(candidate)) {
        disambiguator++;
        candidate = `segment-${segment.lineIndex}-${disambiguator}-${originalName}`;
      }
      assertSafeOfflineSegment(candidate);
      segment.fileName = candidate;
    }
    assignedNames.add(segment.fileName);
  }

  const total = segmentLines.length;
  let completed = 0;

  const downloadOne = async (segmentUrl: string, filePath: string): Promise<void> => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= SEGMENT_RETRIES; attempt++) {
      assertCurrent();
      try {
        // Нативная загрузка пишет сегмент сразу на диск и не держит его в JS heap.
        const result = await FileSystem.downloadAsync(segmentUrl, filePath);
        assertCurrent();
        if (result.status < 200 || result.status >= 300) {
          await FileSystem.deleteAsync(filePath, { idempotent: true });
          throw new Error(`HTTP ${result.status}`);
        }
        return;
      } catch (e) {
        reportClientError(e instanceof Error ? e : new Error(String(e)), {
          issueKey: "DownloadHLSForOffline",
          keys: { operation: "download_segment_attempt" },
        });
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }
    throw lastError || new Error("Ошибка загрузки сегмента");
  };

  let nextSegmentIndex = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
    while (nextSegmentIndex < segmentLines.length) {
      const { line, fileName } = segmentLines[nextSegmentIndex++]!;
      const fullPath = `${videoDirUri}${fileName}`;
      const segmentUrl = new URL(line.trim(), manifestUrl).toString();
      try {
        await downloadOne(segmentUrl, fullPath);
      } catch (error) {
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "DownloadHLSForOffline",
          keys: { operation: "download_segment_rejected" },
        });
        throw error;
      } finally {
        completed++;
        onProgress?.({ current: completed, total, segmentFileName: fileName });
      }
    }
  });
  // Wait for every in-flight native write before a caller can delete the
  // incomplete course directory. Promise.all() rejects too early here.
  const workerResults = await Promise.allSettled(workers);
  const failedWorker = workerResults.find((result) => result.status === "rejected");
  if (failedWorker?.status === "rejected") throw failedWorker.reason;
  assertCurrent();

  const localNameByLine = new Map(
    segmentLines.map(({ lineIndex, fileName }) => [lineIndex, fileName]),
  );
  const modifiedLines = lines.map((line, lineIndex) =>
    localNameByLine.get(lineIndex) ?? line,
  );
  assertCurrent();
  await FileSystem.writeAsStringAsync(`${videoDirUri}manifest.m3u8`, modifiedLines.join("\n"));

  assertCurrent();
  if (res.data.posterUrl) {
    try {
      await downloadOne(res.data.posterUrl, `${videoDirUri}poster.jpg`);
      assertCurrent();
    } catch (error) {
      assertCurrent();
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "DownloadHLSForOffline",
        severity: "warning",
        keys: { operation: "download_poster" },
      });
    }
  }
}
