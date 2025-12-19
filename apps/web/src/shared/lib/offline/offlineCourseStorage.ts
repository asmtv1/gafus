"use client";

import { createWebLogger } from "@gafus/logger";
import type { OfflineCourse } from "./types";

const logger = createWebLogger("web-offline-course-storage");

const DB_NAME = "gafus-offline-courses";
const DB_VERSION = 1;
const STORE_NAME = "courses";

// Инициализация базы данных
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      logger.error("Failed to open IndexedDB", request.error as Error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "courseId" });
        store.createIndex("courseType", "courseType", { unique: false });
        store.createIndex("version", "version", { unique: false });
        store.createIndex("downloadedAt", "downloadedAt", { unique: false });
      }
    };
  });
}

// Сохранение курса в IndexedDB
export async function saveOfflineCourse(data: OfflineCourse): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    logger.info("Course saved to offline storage", {
      courseId: data.courseId,
      courseType: data.courseType,
    });
  } catch (error) {
    logger.error("Failed to save course to offline storage", error as Error, {
      courseId: data.courseId,
    });
    throw error;
  }
}

// Получение курса из IndexedDB
export async function getOfflineCourse(
  courseId: string,
): Promise<OfflineCourse | null> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(courseId);
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    logger.error("Failed to get course from offline storage", error as Error, {
      courseId,
    });
    return null;
  }
}

// Получение курса по типу
export async function getOfflineCourseByType(
  courseType: string,
): Promise<OfflineCourse | null> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("courseType");

    return new Promise((resolve, reject) => {
      const request = index.get(courseType);
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    logger.error(
      "Failed to get course by type from offline storage",
      error as Error,
      { courseType },
    );
    return null;
  }
}

// Обновление курса в IndexedDB
export async function updateOfflineCourse(
  courseId: string,
  data: Partial<OfflineCourse>,
): Promise<void> {
  try {
    const existing = await getOfflineCourse(courseId);
    if (!existing) {
      throw new Error(`Course ${courseId} not found in offline storage`);
    }

    const updated: OfflineCourse = {
      ...existing,
      ...data,
      courseId: existing.courseId, // Не позволяем изменять ID
    };

    await saveOfflineCourse(updated);
    logger.info("Course updated in offline storage", { courseId });
  } catch (error) {
    logger.error("Failed to update course in offline storage", error as Error, {
      courseId,
    });
    throw error;
  }
}

// Удаление курса из IndexedDB
export async function deleteOfflineCourse(courseId: string): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(courseId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    logger.info("Course deleted from offline storage", { courseId });
  } catch (error) {
    logger.error("Failed to delete course from offline storage", error as Error, {
      courseId,
    });
    throw error;
  }
}

// Получение версии курса
export async function getOfflineCourseVersion(
  courseId: string,
): Promise<string | null> {
  try {
    const course = await getOfflineCourse(courseId);
    return course?.version || null;
  } catch (error) {
    logger.error(
      "Failed to get course version from offline storage",
      error as Error,
      { courseId },
    );
    return null;
  }
}

// Проверка, скачан ли курс
export async function isCourseDownloaded(
  courseId: string,
): Promise<boolean> {
  try {
    const course = await getOfflineCourse(courseId);
    return !!course;
  } catch (error) {
    logger.error(
      "Failed to check if course is downloaded",
      error as Error,
      { courseId },
    );
    return false;
  }
}

// Проверка по типу курса
export async function isCourseDownloadedByType(
  courseType: string,
): Promise<boolean> {
  try {
    const course = await getOfflineCourseByType(courseType);
    return !!course;
  } catch (error) {
    logger.error(
      "Failed to check if course is downloaded by type",
      error as Error,
      { courseType },
    );
    return false;
  }
}

// Получение списка всех скачанных курсов
export async function getAllDownloadedCourses(): Promise<OfflineCourse[]> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    logger.error(
      "Failed to get all downloaded courses",
      error as Error,
    );
    return [];
  }
}

// Получение размера хранилища (приблизительно)
export async function getStorageSize(): Promise<number> {
  try {
    const courses = await getAllDownloadedCourses();
    let totalSize = 0;

    for (const course of courses) {
      // Размер метаданных (приблизительно)
      totalSize += JSON.stringify(course.course).length;

      // Размер медиафайлов
      for (const blob of Object.values(course.mediaFiles.videos)) {
        totalSize += blob.size;
      }
      for (const blob of Object.values(course.mediaFiles.images)) {
        totalSize += blob.size;
      }
      for (const blob of Object.values(course.mediaFiles.pdfs)) {
        totalSize += blob.size;
      }
    }

    return totalSize;
  } catch (error) {
    logger.error("Failed to calculate storage size", error as Error);
    return 0;
  }
}
