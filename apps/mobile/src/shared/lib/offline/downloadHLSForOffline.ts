/**
 * Скачивание HLS-видео для офлайна: signed URL → манифест → сегменты в FileSystem.
 * Переписанный манифест — только имена файлов сегментов (относительные).
 */
import * as FileSystem from "expo-file-system/legacy";
import { trainingApi } from "@/shared/lib/api";

const CONCURRENCY = 3;
const SEGMENT_RETRIES = 2;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

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
  } catch {
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
): Promise<void> {
  const res = await trainingApi.getVideoUrl(videoUrl);
  if (!res.success || !res.data?.url) {
    throw new Error(res.error || "Не удалось получить URL видео");
  }
  const manifestUrl = res.data.url;

  const doc = FileSystem.documentDirectory;
  if (!doc) throw new Error("documentDirectory недоступен");
  const videoDirUri = `${doc}offline/${courseType}/videos/${videoId}/`;
  await FileSystem.makeDirectoryAsync(videoDirUri, { intermediates: true });

  const manifestResponse = await fetch(manifestUrl, { signal });
  if (!manifestResponse.ok) {
    throw new Error(`Манифест: HTTP ${manifestResponse.status}`);
  }
  const manifestText = await manifestResponse.text();
  const lines = manifestText.split("\n");

  const segmentLines: { line: string; fileName: string }[] = [];
  for (const line of lines) {
    const fileName = getSegmentFileName(line);
    if (fileName) segmentLines.push({ line, fileName });
  }

  const total = segmentLines.length;
  let completed = 0;

  const downloadOne = async (segmentUrl: string, filePath: string): Promise<void> => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= SEGMENT_RETRIES; attempt++) {
      if (signal?.aborted) throw new Error("aborted");
      try {
        const resp = await fetch(segmentUrl, { signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buf = await resp.arrayBuffer();
        const base64 = arrayBufferToBase64(buf);
        await FileSystem.writeAsStringAsync(filePath, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }
    throw lastError || new Error("Ошибка загрузки сегмента");
  };

  const queue = [...segmentLines];
  const running: Promise<void>[] = [];

  const runNext = (): Promise<void> | null => {
    if (queue.length === 0) return null;
    const { line, fileName } = queue.shift()!;
    const fullPath = `${videoDirUri}${fileName}`;
    const rawLine = line.trim();
    let segUrl: string;
    if (rawLine.startsWith("http")) {
      segUrl = rawLine;
    } else {
      const [pathPart, queryPart] = manifestUrl.split("?");
      const base = pathPart.replace(/\/[^/]*$/, "/");
      segUrl = base + rawLine + (queryPart ? `?${queryPart}` : "");
    }
    const p = downloadOne(segUrl, fullPath).then(
      () => {
        completed++;
        onProgress?.({ current: completed, total, segmentFileName: fileName });
      },
      (err) => {
        completed++;
        onProgress?.({ current: completed, total, segmentFileName: fileName });
        throw err;
      },
    );
    running.push(p);
    return p.then(() => {
      running.splice(running.indexOf(p), 1);
      return runNext() ?? Promise.resolve();
    });
  };

  for (let i = 0; i < CONCURRENCY; i++) {
    const next = runNext();
    if (next) running.push(next);
  }
  await Promise.all(running);

  const modifiedLines = lines.map((line) => {
    const fileName = getSegmentFileName(line);
    if (fileName) return fileName;
    return line;
  });
  await FileSystem.writeAsStringAsync(
    `${videoDirUri}manifest.m3u8`,
    modifiedLines.join("\n"),
  );
}
