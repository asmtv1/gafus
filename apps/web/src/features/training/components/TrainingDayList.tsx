"use client";

import { memo, useCallback } from "react";
import Link from "next/link";

import { useCachedTrainingDays } from "@shared/hooks/useCachedTrainingDays";
import { useStepStore } from "@shared/stores/stepStore";
import { calculateDayStatus } from "@shared/utils/trainingCalculations";
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
      estimatedDuration?: number;
       theoryMinutes?: number;
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

  // Определяем текущий день для индикатора "Вы здесь"
  const getCurrentDayNumber = useCallback((days: {
    day: number;
    courseId: string;
    userStatus: string;
  }[]) => {
    // 1. Ищем первый день IN_PROGRESS
    const inProgressDay = days.find((day) => {
      const localStatus = calculateDayStatus(day.courseId, day.day, stepStates);
      const finalStatus = rank(localStatus) > rank(day.userStatus) ? localStatus : day.userStatus;
      return finalStatus === "IN_PROGRESS";
    });
    
    if (inProgressDay) return inProgressDay.day;

    // 2. Ищем последний COMPLETED и возвращаем следующий
    let lastCompletedDay = 0;
    days.forEach((day) => {
      const localStatus = calculateDayStatus(day.courseId, day.day, stepStates);
      const finalStatus = rank(localStatus) > rank(day.userStatus) ? localStatus : day.userStatus;
      if (finalStatus === "COMPLETED") {
        lastCompletedDay = Math.max(lastCompletedDay, day.day);
      }
    });

    if (lastCompletedDay > 0 && lastCompletedDay < days.length) {
      return lastCompletedDay + 1;
    }

    // 3. По умолчанию - первый день
    return days[0]?.day || 1;
  }, [stepStates]);

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

  const currentDayNumber = getCurrentDayNumber(displayData.trainingDays);

  return (
    <ul className={styles.list}>
      {displayData.trainingDays.map((day) => {
        const isCurrent = day.day === currentDayNumber;
        
        if (process.env.NODE_ENV !== "production") {
          // Отладка времени по дню: таймеры vs теория
          // eslint-disable-next-line no-console
          console.warn("[TrainingDayList] Day time debug", {
            dayNumber: day.day,
            title: day.title,
            estimatedDuration: day.estimatedDuration,
            theoryMinutes: day.theoryMinutes,
            type: day.type,
          });
        }

        return (
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
            {isCurrent && (
              <div className={styles.currentIndicator}>
                <span>📍</span>
                <span>Вы здесь</span>
              </div>
            )}
            <Link
              href={`/trainings/${courseType}/${day.day}`}
              className={styles.link}
              prefetch={false}
            >
              {(day.estimatedDuration ?? 0) > 0 || (day.theoryMinutes ?? 0) > 0 ? (
                <div className={styles.timeBadgeWrapper}>
                  {(day.estimatedDuration ?? 0) > 0 && (
                    <div className={styles.timeBadge}>
                      <div>{day.estimatedDuration}</div>
                      <span>мин</span>
                    </div>
                  )}
                  {(day.theoryMinutes ?? 0) > 0 && (
                    <div className={styles.timeBadgeTheory}>
                      <div>{day.theoryMinutes}</div>
                      <span>мин</span>
                    </div>
                  )}
                </div>
              ) : null}
              <div className={styles.card}>
                <h2 className={styles.dayTitle}>{day.title}</h2>
                <p className={styles.subtitle}>({typeLabels[day.type] || day.type})</p>
                <p>Что понадобится:</p>
                <p className={styles.equipment}>{day.equipment || "вкусняшки и терпение"}</p>
              </div>
            </Link>
            
          </li>
        );
      })}
    </ul>
  );
});

export default TrainingDayList;
