"use client";

import { reportClientError } from "@gafus/error-handling";
import { createWebLogger } from "@gafus/logger";

/**
 * IndexedDB storage для офлайн прогресса просмотра видео
 * Отдельная БД от основного offline storage
 */

const logger = createWebLogger("videoProgressStorage");
const DB_NAME = "gafus-video-progress";
const DB_VERSION = 1;
const STORE_NAME = "progress";

interface VideoProgressEntry {
  videoId: string;
  lastPositionSec: number;
  updatedAt: number;
  ownerId?: string;
}

let currentOwnerId: string | null = null;

/** Set from UserProvider; records without this binding are never sent to the server. */
export function setVideoProgressOwner(userId: string | null): void {
  currentOwnerId = userId;
}

/**
 * Открывает или создает IndexedDB для video progress
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Создаем store если его нет
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "videoId" });
      }
    };
  });
}

/**
 * Получает прогресс просмотра из IndexedDB
 */
export async function getLocalVideoProgress(videoId: string): Promise<number | null> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(videoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entry = request.result as VideoProgressEntry | undefined;
        resolve(entry?.lastPositionSec ?? null);
      };
    });
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "VideoProgress",
      keys: { operation: "get", videoId },
    });
    return null;
  }
}

/**
 * Сохраняет прогресс просмотра в IndexedDB
 */
export async function saveLocalVideoProgress(
  videoId: string,
  lastPositionSec: number,
): Promise<void> {
  try {
    if (!currentOwnerId) {
      throw new Error("Cannot save video progress without an authenticated session owner");
    }
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const entry: VideoProgressEntry = {
      videoId,
      lastPositionSec,
      updatedAt: Date.now(),
      ownerId: currentOwnerId,
    };

    return new Promise((resolve, reject) => {
      const request = store.put(entry);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "VideoProgress",
      keys: { operation: "save", videoId },
    });
    throw error;
  }
}

/**
 * Получает все записи из IndexedDB для синхронизации
 */
export async function getAllVideoProgress(): Promise<VideoProgressEntry[]> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as VideoProgressEntry[]);
    });
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "VideoProgress",
      keys: { operation: "getAll" },
    });
    return [];
  }
}

/**
 * Legacy course-download data can be removed only after video progress has no
 * pending records for the current account. Entries without an owner, or for a
 * different account, remain untouched because their ownership is unknown here.
 */
export async function getVideoProgressMigrationState(
  userId: string | null,
): Promise<"clear" | "pending" | "unknown"> {
  if (!userId) return "unknown";

  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const entries = await new Promise<VideoProgressEntry[]>((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as VideoProgressEntry[]);
    });

    if (entries.some((entry) => entry.ownerId !== userId)) return "unknown";
    return entries.length === 0 ? "clear" : "pending";
  } catch {
    return "unknown";
  }
}

/** Deletes only snapshots acknowledged by the server and unchanged while the request was in flight. */
async function deleteConfirmedVideoProgress(entries: VideoProgressEntry[], confirmedVideoIds: string[]): Promise<void> {
  if (!currentOwnerId || confirmedVideoIds.length === 0) return;
  const confirmed = new Set(confirmedVideoIds);
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);

  await Promise.all(entries.filter((entry) => confirmed.has(entry.videoId)).map((entry) =>
    new Promise<void>((resolve, reject) => {
      const request = store.get(entry.videoId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const current = request.result as VideoProgressEntry | undefined;
        if (
          current?.ownerId === currentOwnerId &&
          current.updatedAt === entry.updatedAt &&
          current.lastPositionSec === entry.lastPositionSec
        ) {
          const deleteRequest = store.delete(entry.videoId);
          deleteRequest.onerror = () => reject(deleteRequest.error);
          deleteRequest.onsuccess = () => resolve();
        } else {
          resolve();
        }
      };
    }),
  ));
}

/**
 * Синхронизирует все прогрессы из IndexedDB на сервер
 */
export async function syncVideoProgressFromIndexedDB(): Promise<void> {
  try {
    if (!currentOwnerId) return;
    // Получаем все записи из IndexedDB
    const entries = (await getAllVideoProgress()).filter((entry) => entry.ownerId === currentOwnerId);

    if (entries.length === 0) {
      logger.info("Нет прогрессов для синхронизации");
      return;
    }

    // Импортируем server action
    const { syncVideoProgressFromLocal } = await import("./videoProgressActions");

    // Преобразуем в формат для server action
    const payload = entries.map((entry) => ({
      videoId: entry.videoId,
      lastPositionSec: entry.lastPositionSec,
    }));

    // Отправляем на сервер
    const result = await syncVideoProgressFromLocal(payload);

    if (result.confirmedVideoIds?.length) {
      logger.info("Синхронизировано прогрессов", {
        count: result.confirmedVideoIds.length,
      });
      await deleteConfirmedVideoProgress(entries, result.confirmedVideoIds);
    }
    if (!result.success) {
      logger.error("Ошибка синхронизации", new Error(result.error ?? "Unknown"));
    }
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "VideoProgress",
      keys: { operation: "sync" },
    });
    logger.error("Ошибка синхронизации с сервером", error as Error);
  }
}
