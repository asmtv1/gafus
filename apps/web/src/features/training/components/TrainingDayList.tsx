"use client";

import { memo, useCallback } from "react";
import Link from "next/link";

import { useCachedTrainingDays } from "@shared/hooks/useCachedTrainingDays";
import styles from "./TrainingDayList.module.css";

interface TrainingDayListProps {
  courseType: string;
  initialData?: {
    trainingDays: {
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

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="text-gray-600">Загрузка дней тренировок...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center py-8 space-y-4">
        <div className="text-red-600">Ошибка загрузки: {error}</div>
        <button
          onClick={refetch}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  if (!data || data.trainingDays.length === 0) {
    return (
      <div className="text-gray-600 py-8 text-center">
        Дни тренировок не найдены
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {data.trainingDays.map((day) => (
        <li key={`${day.courseId}-${day.day}`} className={getItemClass(day.userStatus)}>
          <Link href={`/trainings/${courseType}/${day.day}`} className={styles.link}>
            <span className={styles.day}>{day.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
});

export default TrainingDayList;
