/**
 * Офлайн-хранилище: метаданные и пути к медиа в expo-file-system.
 * schemaVersion в meta.json для будущей миграции структуры.
 */
import * as FileSystem from "expo-file-system/legacy";
import type { FullCourseData } from "@/shared/lib/api/offline";
import { reportClientError } from "@/shared/lib/tracer";
import { getVideoIdFromUrl } from "@/shared/lib/utils/videoUrl";

const OFFLINE_DIR = "offline";
const META_FILENAME = "meta.json";
const CURRENT_SCHEMA_VERSION = 1;

/** Validate dynamic native filesystem path components before any IO. */
export function assertSafeOfflineSegment(value: string): void {
  const badChar = Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 || [47, 92, 37, 63, 35].includes(code);
  });
  if (!value || value === "." || value === ".." || badChar) {
    throw new Error("Недопустимое имя локального офлайн-файла");
  }
}

export interface OfflineCourseMeta {
  schemaVersion: number;
  course: FullCourseData["course"];
  trainingDays: FullCourseData["trainingDays"];
  version: string;
  downloadedAt: string;
}

function getOfflineBaseUri(): string {
  const doc = FileSystem.documentDirectory;
  if (!doc) throw new Error("documentDirectory недоступен");
  return `${doc}${OFFLINE_DIR}/`;
}

function getCourseDirUri(courseType: string): string {
  assertSafeOfflineSegment(courseType);
  return `${getOfflineBaseUri()}${courseType}/`;
}

function getMetaUri(courseType: string): string {
  return `${getCourseDirUri(courseType)}${META_FILENAME}`;
}

/**
 * Сохраняет метаданные курса в meta.json (всегда schemaVersion: 1).
 */
export async function saveCourseMeta(
  courseType: string,
  data: Omit<OfflineCourseMeta, "schemaVersion">,
): Promise<void> {
  const courseUri = getCourseDirUri(courseType);
  await FileSystem.makeDirectoryAsync(courseUri, { intermediates: true });
  const meta: OfflineCourseMeta = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...data,
  };
  await FileSystem.writeAsStringAsync(getMetaUri(courseType), JSON.stringify(meta));
}

/**
 * Читает метаданные курса. При отсутствии, нечитаемом или несовместимом schemaVersion возвращает null.
 */
export async function getCourseMeta(courseType: string): Promise<OfflineCourseMeta | null> {
  try {
    const uri = getMetaUri(courseType);
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) return null;
    const raw = await FileSystem.readAsStringAsync(uri);
    const parsed = JSON.parse(raw) as OfflineCourseMeta;
    if (
      typeof parsed.schemaVersion !== "number" ||
      parsed.schemaVersion !== CURRENT_SCHEMA_VERSION
    ) {
      return null;
    }
    return parsed;
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "offlineStorage",
      severity: "warning",
      keys: { operation: "getCourseMeta", courseType },
    });
    return null;
  }
}

/**
 * Список courseType скачанных курсов (поддиректории offline/).
 */
export async function getOfflineCourseTypes(): Promise<string[]> {
  try {
    const baseUri = getOfflineBaseUri();
    const info = await FileSystem.getInfoAsync(baseUri);
    if (!info.exists || !info.isDirectory) return [];
    const names = await FileSystem.readDirectoryAsync(baseUri);
    const courseTypes: string[] = [];
    for (const name of names) {
      try {
        assertSafeOfflineSegment(name);
      } catch {
        continue;
      }
      const itemInfo = await FileSystem.getInfoAsync(`${baseUri}${name}`);
      if (itemInfo.exists && itemInfo.isDirectory) {
        courseTypes.push(name);
      }
    }
    return courseTypes;
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "offlineStorage",
      severity: "warning",
      keys: { operation: "getOfflineCourseTypes" },
    });
    return [];
  }
}

/**
 * Удаляет папку курса целиком.
 */
export async function deleteCourseData(courseType: string): Promise<void> {
  const uri = getCourseDirUri(courseType);
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

/**
 * Возвращает относительный путь к локальному манифесту видео или null, если файла нет.
 * Полный URI собирается в рантайме: documentDirectory + relativePath.
 */
export async function getLocalVideoManifestPath(
  courseType: string,
  videoId: string,
): Promise<string | null> {
  try {
    assertSafeOfflineSegment(courseType);
    assertSafeOfflineSegment(videoId);
  } catch {
    return null;
  }
  const manifestPath = `${OFFLINE_DIR}/${courseType}/videos/${videoId}/manifest.m3u8`;
  const fullUri = `${FileSystem.documentDirectory}${manifestPath}`;
  try {
    const info = await FileSystem.getInfoAsync(fullUri);
    if (info.exists && !info.isDirectory) return manifestPath;
    return null;
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "offlineStorage",
      severity: "warning",
      keys: { operation: "getLocalVideoManifestPath", courseType, videoId },
    });
    return null;
  }
}

/**
 * Собирает полный URI для воспроизведения по относительному пути.
 * documentDirectory уже в формате file:// и с завершающим /.
 */
export function buildFileUri(relativePath: string): string {
  // This helper is used to play native offline media. Never let an untrusted
  // relative reference escape the sandbox or point at a different data tree.
  const segments = relativePath.split("/");
  if (segments[0] !== OFFLINE_DIR || segments.length < 3) {
    throw new Error("Недопустимый относительный путь офлайн-файла");
  }
  for (const segment of segments) {
    assertSafeOfflineSegment(segment);
  }
  const doc = FileSystem.documentDirectory;
  if (!doc) return relativePath;
  return `${doc}${relativePath}`;
}

/**
 * Резолвер офлайн-видео: если курс скачан и есть локальный манифест для videoUrl — возвращает file URI, иначе null.
 */
export async function getOfflineVideoUri(
  courseType: string,
  videoUrl: string | null | undefined,
): Promise<string | null> {
  if (!videoUrl) return null;
  const videoId = getVideoIdFromUrl(videoUrl);
  if (!videoId) return null;
  const relativePath = await getLocalVideoManifestPath(courseType, videoId);
  if (!relativePath) return null;
  return buildFileUri(relativePath);
}

/** Возвращает локальный постер скачанного видео, если он существует. */
export async function getOfflineVideoPosterUri(
  courseType: string,
  videoUrl: string | null | undefined,
): Promise<string | null> {
  if (!videoUrl) return null;
  const videoId = getVideoIdFromUrl(videoUrl);
  if (!videoId) return null;
  try {
    assertSafeOfflineSegment(courseType);
    assertSafeOfflineSegment(videoId);
  } catch {
    return null;
  }
  const posterUri = `${getCourseDirUri(courseType)}videos/${videoId}/poster.jpg`;
  try {
    const info = await FileSystem.getInfoAsync(posterUri);
    return info.exists && !info.isDirectory ? posterUri : null;
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "offlineStorage",
      severity: "warning",
      keys: { operation: "getOfflineVideoPosterUri", courseType, videoId },
    });
    return null;
  }
}
