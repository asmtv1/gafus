/**
 * Офлайн-хранилище: метаданные и пути к медиа в expo-file-system.
 * schemaVersion в meta.json для будущей миграции структуры.
 */
import * as FileSystem from "expo-file-system/legacy";
import type { FullCourseData } from "@/shared/lib/api/offline";
import { getVideoIdFromUrl } from "@/shared/lib/utils/videoUrl";

const OFFLINE_DIR = "offline";
const META_FILENAME = "meta.json";
const CURRENT_SCHEMA_VERSION = 1;

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
  } catch {
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
      const itemInfo = await FileSystem.getInfoAsync(`${baseUri}${name}`);
      if (itemInfo.exists && itemInfo.isDirectory) {
        courseTypes.push(name);
      }
    }
    return courseTypes;
  } catch {
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
  const manifestPath = `${OFFLINE_DIR}/${courseType}/videos/${videoId}/manifest.m3u8`;
  const fullUri = `${FileSystem.documentDirectory}${manifestPath}`;
  try {
    const info = await FileSystem.getInfoAsync(fullUri);
    if (info.exists && !info.isDirectory) return manifestPath;
    return null;
  } catch {
    return null;
  }
}

/**
 * Собирает полный URI для воспроизведения по относительному пути.
 * documentDirectory уже в формате file:// и с завершающим /.
 */
export function buildFileUri(relativePath: string): string {
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
