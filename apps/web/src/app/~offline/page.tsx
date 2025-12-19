"use client";

import { useEffect, useMemo, useState } from "react";
import { TrainingStatus } from "@gafus/types";
import { useOfflineCourse } from "@shared/hooks/useOfflineCourse";
import { useOfflineStatus } from "@shared/hooks/useOfflineStatus";
import type { OfflineCourse } from "@shared/lib/offline/types";
import type { CourseCardPropsWithIndex } from "@gafus/types";
import { CourseCard } from "@/features/courses/components/CourseCard/CourseCard";
import courseStyles from "../(main)/courses/courses.module.css";
import styles from "./offline.module.css";

// Преобразование OfflineCourse → CourseCardProps
function convertToCourseCardProps(
  offlineCourse: OfflineCourse,
  index: number,
): CourseCardPropsWithIndex {
  const metadata = offlineCourse.course.metadata;
  return {
    id: metadata.id,
    name: metadata.name,
    type: metadata.type,
    duration: metadata.duration,
    logoImg: metadata.logoImg,
    isPrivate: metadata.isPrivate,
    userStatus: TrainingStatus.NOT_STARTED,
    startedAt: null,
    completedAt: null,
    shortDesc: metadata.shortDesc,
    authorUsername: metadata.authorUsername,
    createdAt: new Date(metadata.createdAt),
    avgRating: metadata.avgRating,
    trainingLevel: metadata.trainingLevel as "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT",
    reviews: [],
    isFavorite: false,
    index,
  };
}

export default function OfflinePage() {
  const { downloadedCourses, refreshDownloadedCourses } = useOfflineCourse();
  const { isOnline } = useOfflineStatus();
  const [isLoading, setIsLoading] = useState(true);
  const [indexedDBError, setIndexedDBError] = useState<string | null>(null);
  const [showConnectionRestored, setShowConnectionRestored] = useState(false);

  // Загружаем курсы при монтировании
  useEffect(() => {
    const loadCourses = async () => {
      setIsLoading(true);
      setIndexedDBError(null);
      try {
        await refreshDownloadedCourses();
      } catch (error) {
        setIndexedDBError(
          error instanceof Error ? error.message : "Ошибка загрузки курсов"
        );
      } finally {
        setIsLoading(false);
      }
    };
    loadCourses();
  }, [refreshDownloadedCourses]);

  // Отслеживаем восстановление подключения
  useEffect(() => {
    if (isOnline) {
      setShowConnectionRestored(true);
      // Автоматический возврат обрабатывается в offlineDetector
      // Показываем уведомление на короткое время
      const timer = setTimeout(() => {
        setShowConnectionRestored(false);
      }, 2000);
      return () => clearTimeout(timer);
    } else {
      setShowConnectionRestored(false);
    }
  }, [isOnline]);


  // Преобразуем курсы в формат для карточек
  const courseCards = useMemo(() => {
    return downloadedCourses.map((course, index) =>
      convertToCourseCardProps(course, index),
    );
  }, [downloadedCourses]);

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Нет соединения с сервером</h1>
      
      {/* Заголовок и информационное сообщение */}
      <div className={styles.headerSection}>
        <div className={styles.infoBox}>
          <p>
            Да, вы офлайн, но вот ваши скачанные курсы, можете их проходить
          </p>
          <p>
            Все скачанные курсы доступны для прохождения в офлайн-режиме
          </p>
        </div>
      </div>

      {/* Список курсов или пустое состояние */}
      {isLoading ? (
        <div className={styles.loadingState}>
          <p>Загрузка скачанных курсов...</p>
        </div>
      ) : courseCards.length > 0 ? (
        <ul className={courseStyles.courseList}>
          {courseCards.map((course) => (
            <CourseCard key={course.id} {...course} />
          ))}
        </ul>
      ) : (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h2 className={styles.emptyStateTitle}>
            Нет скачанных курсов
          </h2>
          <p className={styles.emptyStateText}>
            У вас пока нет скачанных курсов для офлайн-доступа. Вернитесь на главную страницу
            и скачайте курсы, чтобы использовать их без интернета.
          </p>
        </div>
      )}

      {/* Кнопки действий */}
      <div className={styles.actionsSection}>
        <button
          onClick={() => window.location.reload()}
          className={styles.button}
        >
          Попробовать снова
        </button>
        <button
          onClick={() => (window.location.href = "/")}
          className={`${styles.button} ${styles.buttonSecondary}`}
        >
          На главную
        </button>
      </div>


      {/* Уведомление о восстановлении подключения */}
      {showConnectionRestored && (
        <div
          style={{
            marginTop: "16px",
            padding: "12px",
            background: "#d4edda",
            border: "1px solid #c3e6cb",
            borderRadius: "4px",
            color: "#155724",
            textAlign: "center",
          }}
        >
          <strong>Подключение восстановлено!</strong> Происходит автоматический возврат...
        </div>
      )}

      {/* Ошибка IndexedDB */}
      {indexedDBError && (
        <div
          style={{
            marginTop: "16px",
            padding: "12px",
            background: "#f8d7da",
            border: "1px solid #f5c6cb",
            borderRadius: "4px",
            color: "#721c24",
          }}
        >
          <strong>Внимание:</strong> {indexedDBError}
        </div>
      )}
    </div>
  );
}
