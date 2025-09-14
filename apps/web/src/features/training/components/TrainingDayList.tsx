"use client";

import { memo, useCallback } from "react";
import Link from "next/link";

import { useCachedTrainingDays } from "@shared/hooks/useCachedTrainingDays";
import { useStepStore } from "@shared/stores/stepStore";
import { calculateDayStatus } from "@shared/utils/trainingCalculations";
import styles from "./TrainingDayList.module.css";
import { useOfflineStore } from "@shared/stores/offlineStore";

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
      estimatedDuration?: number;
      equipment?: string;
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

  // Локальные статусы шагов (офлайн-истина)
  const { stepStates } = useStepStore();

  // Добавляем в getItemClass динамику для цветов
  const getItemClass = useCallback((status: string, dayNumber: number) => {
    let baseClass = `${styles.item} ${styles[`day${dayNumber % 2 === 1 ? 'Odd' : 'Even'}`]}`;
    if (status === "IN_PROGRESS") baseClass += ` ${styles.inprogress}`;
    if (status === "COMPLETED") baseClass += ` ${styles.completed}`;
    return baseClass;
  }, []);

  const typeLabels: Record<string, string> = {
    base: "Базовый день",
    regular: "Тренировочный день",
    introduction: "Вводный день",
    test: "Проверочный или экзаменационный день",
    rest: "День отдыха",
  };

  const rank = (s?: string) => {
    if (s === "COMPLETED") return 2;
    if (s === "IN_PROGRESS" || s === "PAUSED") return 1;
    return 0; // NOT_STARTED или неизвестно
  };

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
        <li
          key={`${day.courseId}-${day.day}`}
          className={(() => {
            // Вычисляем локальный статус дня из stepStore
            const localStatus = calculateDayStatus(day.courseId, day.day, stepStates);
            // Не понижаем статус: берем максимум между серверным и локальным
            const finalStatus = rank(localStatus) > rank(day.userStatus)
              ? localStatus
              : day.userStatus;
            return getItemClass(finalStatus, day.day);
          })()}
        >
          <Link
            href={`/trainings/${courseType}/${day.day}`}
            className={styles.link}
            prefetch={false}
            onClick={(e) => {
              // При офлайн-навигации форсируем полную навигацию, чтобы SW отдал HTML заглушку
              const isOnline = useOfflineStore.getState().isOnline;
              if (!isOnline) {
                e.preventDefault();
                window.location.assign(`/trainings/${courseType}/${day.day}`);
              }
            }}
          >
            <div className={styles.timeBadge}>
              <div>{day.estimatedDuration}</div>
              <span>мин</span>
            </div>
            <div className={styles.card}>
              <h2 className={styles.dayTitle}>{day.title}</h2>
              <p className={styles.subtitle}>({typeLabels[day.type] || day.type})</p>
              <p>Что понадобится:</p>
              <p className={styles.equipment}>{day.equipment || "вкусняшки и терпение"}</p>
            </div>
          </Link>
          
        </li>
      ))}
    </ul>
  );
});

export default TrainingDayList;
