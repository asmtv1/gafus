/**
 * Офлайн-хранилище: метаданные и пути к медиа в expo-file-system.
 * schemaVersion в meta.json для будущей миграции структуры.
 */
import * as FileSystem from "expo-file-system/legacy";
import type { FullCourseData } from "@/shared/lib/api/offline";
import { reportClientError } from "@/shared/lib/error-reporting";
import { getVideoIdFromUrl } from "@/shared/lib/utils/videoUrl";

import { captureOfflineCourseScope, type OfflineCourseScope } from "./offlineCourseSession";

const OFFLINE_DIR = "offline-v2";
const META_FILENAME = "meta.json";
const DOWNLOAD_INTENT_FILENAME = ".download-intent-v1.json";
const CURRENT_SCHEMA_VERSION = 2;

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

function getOfflineBaseUri(scope: OfflineCourseScope): string {
  const doc = FileSystem.documentDirectory;
  if (!doc) throw new Error("documentDirectory недоступен");
  assertSafeOfflineSegment(scope.principalId);
  return `${doc}${OFFLINE_DIR}/${scope.principalId}/`;
}

export function getScopedCourseDirUri(courseType: string, scope: OfflineCourseScope): string {
  assertSafeOfflineSegment(courseType);
  return `${getOfflineBaseUri(scope)}${courseType}/`;
}

function getMetaUri(courseType: string, scope: OfflineCourseScope): string {
  return `${getScopedCourseDirUri(courseType, scope)}${META_FILENAME}`;
}

/** Durable, owner-scoped intent is written before the first media byte.
 * Existing committed/unknown metadata always wins over a stale intent. */
export async function beginOfflineCourseDownload(courseType: string, scope: OfflineCourseScope): Promise<void> {
  if (!scope.canWrite()) throw new Error("OFFLINE_COURSE_SESSION_REQUIRED");
  const dir = getScopedCourseDirUri(courseType, scope);
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  if (!scope.canWrite()) throw new Error("OFFLINE_COURSE_SESSION_CHANGED");
  await FileSystem.writeAsStringAsync(dir + DOWNLOAD_INTENT_FILENAME, JSON.stringify({
    schemaVersion: 1, ownerId: scope.principalId, courseType,
  }));
}

/** Called only while the download's per-owner in-process lock is held.
 * Unknown historical directories and any final metadata are never removed.
 * A kill before intent write can leave an empty directory or intent alone. */
export async function recoverIncompleteOfflineCourse(courseType: string, scope: OfflineCourseScope): Promise<boolean> {
  if (!scope.canWrite()) return false;
  const dir = getScopedCourseDirUri(courseType, scope);
  const metadata = await FileSystem.getInfoAsync(getMetaUri(courseType, scope));
  if (metadata.exists) return false;
  const entries = await FileSystem.readDirectoryAsync(dir);
  const intentUri = dir + DOWNLOAD_INTENT_FILENAME;
  let provenIncomplete = entries.length === 0;
  if (!provenIncomplete && entries.includes(DOWNLOAD_INTENT_FILENAME)) {
    const info = await FileSystem.getInfoAsync(intentUri);
    if (!info.exists || info.isDirectory) return false;
    try {
      const marker = JSON.parse(await FileSystem.readAsStringAsync(intentUri));
      provenIncomplete = marker?.schemaVersion === 1 && marker.ownerId === scope.principalId &&
        marker.courseType === courseType;
    } catch {
      return false;
    }
  }
  if (!provenIncomplete || !scope.canWrite()) return false;
  await FileSystem.deleteAsync(dir, { idempotent: true });
  return scope.canWrite();
}

/**
 * Сохраняет метаданные курса в meta.json (всегда schemaVersion: 2).
 */
export async function saveCourseMeta(
  courseType: string,
  data: Omit<OfflineCourseMeta, "schemaVersion">,
  scope = captureOfflineCourseScope(),
): Promise<void> {
  if (!scope?.canWrite()) throw new Error("OFFLINE_COURSE_SESSION_REQUIRED");
  const courseUri = getScopedCourseDirUri(courseType, scope);
  await FileSystem.makeDirectoryAsync(courseUri, { intermediates: true });
  if (!scope.canWrite()) throw new Error("OFFLINE_COURSE_SESSION_CHANGED");
  const meta: OfflineCourseMeta & { ownerId: string } = {
    ...data,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ownerId: scope.principalId,
  };
  // A process kill during write must never leave a half-written final commit.
  const destination = getMetaUri(courseType, scope);
  const temporary = destination + ".pending";
  await FileSystem.writeAsStringAsync(temporary, JSON.stringify(meta));
  if (!scope.canWrite()) throw new Error("OFFLINE_COURSE_SESSION_CHANGED");
  await FileSystem.moveAsync({ from: temporary, to: destination });
}

/**
 * Читает метаданные курса. При отсутствии, нечитаемом или несовместимом schemaVersion возвращает null.
 */
export async function getCourseMeta(courseType: string, scope = captureOfflineCourseScope()): Promise<OfflineCourseMeta | null> {
  if (!scope?.isCurrent()) return null;
  try {
    const uri = getMetaUri(courseType, scope);
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) return null;
    const raw = await FileSystem.readAsStringAsync(uri);
    const parsed = JSON.parse(raw) as OfflineCourseMeta & { ownerId?: string };
    if (
      !scope.isCurrent() || parsed?.ownerId !== scope.principalId ||
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
export async function getOfflineCourseTypes(scope = captureOfflineCourseScope()): Promise<string[]> {
  if (!scope?.isCurrent()) return [];
  try {
    const baseUri = getOfflineBaseUri(scope);
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
      if (!scope.isCurrent()) return [];
      if (itemInfo.exists && itemInfo.isDirectory && await getCourseMeta(name, scope)) {
        courseTypes.push(name);
      }
    }
    return scope.isCurrent() ? courseTypes : [];
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
export async function deleteCourseData(courseType: string, scope = captureOfflineCourseScope()): Promise<void> {
  if (!scope) return;
  // An in-flight writer may clean up its own captured path after logout.
  const uri = getScopedCourseDirUri(courseType, scope);
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

/**
 * Возвращает относительный путь к локальному манифесту видео или null, если файла нет.
 * Полный URI собирается в рантайме: documentDirectory + relativePath.
 */
export async function getLocalVideoManifestPath(
  courseType: string,
  videoId: string,
  scope = captureOfflineCourseScope(),
): Promise<string | null> {
  if (!scope?.isCurrent()) return null;
  try {
    assertSafeOfflineSegment(courseType);
    assertSafeOfflineSegment(videoId);
  } catch {
    return null;
  }
  if (!await getCourseMeta(courseType, scope)) return null;
  const manifestPath = `${OFFLINE_DIR}/${scope.principalId}/${courseType}/videos/${videoId}/manifest.m3u8`;
  const fullUri = `${FileSystem.documentDirectory}${manifestPath}`;
  try {
    const info = await FileSystem.getInfoAsync(fullUri);
    if (scope.isCurrent() && info.exists && !info.isDirectory) return manifestPath;
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
  const scope = captureOfflineCourseScope();
  const segments = relativePath.split("/");
  if (!scope?.isCurrent() || segments[0] !== OFFLINE_DIR || segments[1] !== scope.principalId || segments.length < 4) {
    throw new Error("Недопустимый относительный путь офлайн-файла");
  }
  for (const segment of segments) {
    assertSafeOfflineSegment(segment);
  }
  const doc = FileSystem.documentDirectory;
  if (!doc) throw new Error("documentDirectory недоступен");
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
  const scope = captureOfflineCourseScope();
  if (!scope) return null;
  const relativePath = await getLocalVideoManifestPath(courseType, videoId, scope);
  if (!relativePath || !scope.isCurrent()) return null;
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
  const scope = captureOfflineCourseScope();
  if (!scope?.isCurrent() || !await getCourseMeta(courseType, scope)) return null;
  const posterUri = `${getScopedCourseDirUri(courseType, scope)}videos/${videoId}/poster.jpg`;
  try {
    const info = await FileSystem.getInfoAsync(posterUri);
    return scope.isCurrent() && info.exists && !info.isDirectory ? posterUri : null;
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "offlineStorage",
      severity: "warning",
      keys: { operation: "getOfflineVideoPosterUri", courseType, videoId },
    });
    return null;
  }
}
