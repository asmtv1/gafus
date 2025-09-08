"use client";

import { memo, useCallback } from "react";
import Link from "next/link";

import { useCachedTrainingDays } from "@shared/hooks/useCachedTrainingDays";
import styles from "./TrainingDayList.module.css";

interface TrainingDayListProps {
  courseType: string;
  initialData?: {
    trainingDays: {
      trainingDayId: string;
      day: number;
      title: string;
      type: string;
      courseId: string;
      userStatus: string;
    }[];
    courseDescription: string | null;
    courseId: string | null;
    courseVideoUrl: string | null;
  } | null;
  initialError?: string | null;
}

const TrainingDayList = memo(function TrainingDayList({ 
  courseType, 
  initialData, 
  initialError 
}: TrainingDayListProps) {
  const { data, loading, error, refetch } = useCachedTrainingDays(courseType, {
    initialData,
    initialError
  });

  const getItemClass = useCallback((status: string) => {
    if (status === "IN_PROGRESS") return `${styles.item} ${styles.inprogress}`;
    if (status === "COMPLETED") return `${styles.item} ${styles.completed}`;
    return styles.item;
  }, []);

  // Используем initialData если есть, иначе данные из хука
  const displayData = initialData || data;
  const displayError = initialError || error;
  const displayLoading = !initialData && loading;

  if (displayLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="text-gray-600">Загрузка дней тренировок...</div>
      </div>
    );
  }

  if (displayError) {
    return (
      <div className="flex flex-col items-center py-8 space-y-4">
        <div className="text-red-600">Ошибка загрузки: {displayError}</div>
        <button
          onClick={refetch}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  if (!displayData || displayData.trainingDays.length === 0) {
    return (
      <div className="text-gray-600 py-8 text-center">
        Дни тренировок не найдены
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {displayData.trainingDays.map((day) => (
        <li key={`${day.courseId}-${day.day}`} className={getItemClass(day.userStatus)}>
          <Link
            href={`/trainings/${courseType}/${day.day}`}
            className={styles.link}
            prefetch={false}
            onClick={(e) => {
              // При офлайн-навигации форсируем полную навигацию, чтобы SW отдал HTML заглушку
              if (typeof navigator !== "undefined" && !navigator.onLine) {
                e.preventDefault();
                window.location.assign(`/trainings/${courseType}/${day.day}`);
              }
            }}
          >
            <span className={styles.day}>{day.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
});

export default TrainingDayList;
