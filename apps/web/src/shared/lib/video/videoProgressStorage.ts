"use client";

/**
 * IndexedDB storage для офлайн прогресса просмотра видео
 * Отдельная БД от основного offline storage
 */

const DB_NAME = "gafus-video-progress";
const DB_VERSION = 1;
const STORE_NAME = "progress";

interface VideoProgressEntry {
  videoId: string;
  lastPositionSec: number;
  updatedAt: number;
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
    console.error("[videoProgressStorage] Ошибка получения прогресса:", error);
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
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const entry: VideoProgressEntry = {
      videoId,
      lastPositionSec,
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const request = store.put(entry);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error("[videoProgressStorage] Ошибка сохранения прогресса:", error);
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
    console.error("[videoProgressStorage] Ошибка получения всех прогрессов:", error);
    return [];
  }
}

/**
 * Очищает все записи из IndexedDB (после синхронизации)
 */
export async function clearAllVideoProgress(): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error("[videoProgressStorage] Ошибка очистки прогрессов:", error);
    throw error;
  }
}

/**
 * Синхронизирует все прогрессы из IndexedDB на сервер
 */
export async function syncVideoProgressFromIndexedDB(): Promise<void> {
  try {
    // Получаем все записи из IndexedDB
    const entries = await getAllVideoProgress();

    if (entries.length === 0) {
      console.log("[videoProgressStorage] Нет прогрессов для синхронизации");
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

    if (result.success) {
      console.log(
        `[videoProgressStorage] Синхронизировано ${result.syncedCount || entries.length} прогрессов`,
      );
      // Очищаем IndexedDB после успешной синхронизации
      await clearAllVideoProgress();
    } else {
      console.error("[videoProgressStorage] Ошибка синхронизации:", result.error);
    }
  } catch (error) {
    console.error("[videoProgressStorage] Ошибка синхронизации с сервером:", error);
  }
}
