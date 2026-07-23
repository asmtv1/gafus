import AsyncStorage from "@react-native-async-storage/async-storage";

import { reportClientError } from "@/shared/lib/tracer";

const STORAGE_KEY = "video-progress-storage";

export interface LocalVideoProgress {
  positionSec: number;
  updatedAt: number;
}

type VideoProgressMap = Record<string, LocalVideoProgress>;

function isLocalVideoProgress(value: unknown): value is LocalVideoProgress {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<LocalVideoProgress>;
  return (
    typeof record.positionSec === "number" &&
    Number.isFinite(record.positionSec) &&
    record.positionSec >= 0 &&
    typeof record.updatedAt === "number" &&
    Number.isFinite(record.updatedAt)
  );
}

async function readProgressMap(): Promise<VideoProgressMap> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, LocalVideoProgress] =>
        isLocalVideoProgress(entry[1]),
      ),
    );
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "VideoProgressStorage",
      severity: "warning",
      keys: { operation: "parse" },
    });
    return {};
  }
}

export async function getLocalVideoProgress(videoId: string): Promise<LocalVideoProgress | null> {
  const map = await readProgressMap();
  return map[videoId] ?? null;
}

export async function saveLocalVideoProgress(
  videoId: string,
  positionSec: number,
  updatedAt = Date.now(),
): Promise<LocalVideoProgress> {
  const progress = {
    positionSec: Math.max(0, Math.floor(positionSec)),
    updatedAt,
  };
  const map = await readProgressMap();
  map[videoId] = progress;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  return progress;
}

export async function clearLocalVideoProgress(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
