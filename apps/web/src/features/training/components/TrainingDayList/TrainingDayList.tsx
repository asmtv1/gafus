"use client";

import { memo, useCallback, useEffect } from "react";
import Link from "next/link";

import { useCachedTrainingDays } from "@shared/hooks/useCachedTrainingDays";
import { useStepStore } from "@shared/stores/stepStore";
import { calculateDayStatus } from "@gafus/core/utils/training";
import { showLockedDayAlert, showPrivateCourseAccessDeniedAlert } from "@shared/utils/sweetAlert";
import { LockIcon } from "@shared/utils/muiImports";
import styles from "./TrainingDayList.module.css";

interface TrainingDayListProps {
  courseType: string;
  initialData?: {
    trainingDays: {
      trainingDayId: string;
      dayOnCourseId: string;
      title: string;
      type: string;
      courseId: string;
      userStatus: string;
      estimatedDuration?: number;
      theoryMinutes?: number;
      equipment?: string;
      isLocked?: boolean;
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
  initialError,
}: TrainingDayListProps) {
  const { data, loading, error, refetch } = useCachedTrainingDays(courseType, {
    initialData,
    initialError,
  });

  // Локальные статусы шагов (офлайн-истина)
  const { stepStates } = useStepStore();

  // Добавляем в getItemClass динамику для цветов
  const getItemClass = useCallback((status: string, dayNumber: number) => {
    let baseClass = `${styles.item} ${styles[`day${dayNumber % 2 === 1 ? "Odd" : "Even"}`]}`;
    if (status === "IN_PROGRESS") baseClass += ` ${styles.inprogress}`;
    if (status === "COMPLETED") baseClass += ` ${styles.completed}`;
    return baseClass;
  }, []);

  // Определяем текущий день для индикатора "Вы здесь"
  const getCurrentDayIndex = useCallback(
    (
      days: {
        dayOnCourseId: string;
        courseId: string;
        userStatus: string;
      }[],
    ) => {
      // 1. Ищем первый день IN_PROGRESS
      const inProgressDayIndex = days.findIndex((day) => {
        const localStatus = calculateDayStatus(day.courseId, day.dayOnCourseId, stepStates);
        const finalStatus = rank(localStatus) > rank(day.userStatus) ? localStatus : day.userStatus;
        return finalStatus === "IN_PROGRESS";
      });

      if (inProgressDayIndex !== -1) return inProgressDayIndex;

      // 2. Ищем последний COMPLETED и возвращаем следующий
      let lastCompletedIndex = -1;
      days.forEach((day, index) => {
        const localStatus = calculateDayStatus(day.courseId, day.dayOnCourseId, stepStates);
        const finalStatus = rank(localStatus) > rank(day.userStatus) ? localStatus : day.userStatus;
        if (finalStatus === "COMPLETED") {
          lastCompletedIndex = index;
        }
      });

      if (lastCompletedIndex !== -1 && lastCompletedIndex < days.length - 1) {
        return lastCompletedIndex + 1;
      }

      // 3. По умолчанию - первый день
      return 0;
    },
    [stepStates],
  );

  const typeLabels: Record<string, string> = {
    base: "Базовый день",
    regular: "Тренировочный день",
    introduction: "Вводный блок",
    instructions: "Инструкции",
    diagnostics: "Диагностика",
    summary: "Подведение итогов",
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

  // Специальная обработка для ошибки доступа
  useEffect(() => {
    if (displayError && displayError.includes("COURSE_ACCESS_DENIED")) {
      showPrivateCourseAccessDeniedAlert();
    }
  }, [displayError]);

  if (displayLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-600">Загрузка дней тренировок...</div>
      </div>
    );
  }

  if (displayError) {
    // Специальная обработка для ошибки доступа - показываем alert и возвращаем null
    if (displayError.includes("COURSE_ACCESS_DENIED")) {
      return null;
    }

    return (
      <div className="flex flex-col items-center space-y-4 py-8">
        <div className="text-red-600">Ошибка загрузки: {displayError}</div>
        <button
          onClick={refetch}
          className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  if (!displayData || displayData.trainingDays.length === 0) {
    return <div className="py-8 text-center text-gray-600">Дни тренировок не найдены</div>;
  }

  const currentDayIndex = getCurrentDayIndex(displayData.trainingDays);

  return (
    <ul className={styles.list}>
      {displayData.trainingDays.map((day, index) => {
        const isCurrent = index === currentDayIndex;

        if (process.env.NODE_ENV !== "production") {
          // Отладка времени по дню: таймеры vs теория
          console.warn("[TrainingDayList] Day time debug", {
            dayOnCourseId: day.dayOnCourseId,
            title: day.title,
            estimatedDuration: day.estimatedDuration,
            theoryMinutes: day.theoryMinutes,
            type: day.type,
          });
        }

        return (
          <li
            key={`${day.courseId}-${day.dayOnCourseId}`}
            className={(() => {
              // Вычисляем локальный статус дня из stepStore
              const localStatus = calculateDayStatus(day.courseId, day.dayOnCourseId, stepStates);
              // Не понижаем статус: берем максимум между серверным и локальным
              const finalStatus =
                rank(localStatus) > rank(day.userStatus) ? localStatus : day.userStatus;
              return getItemClass(finalStatus, index + 1);
            })()}
          >
            {isCurrent && (
              <div className={styles.currentIndicator}>
                <span>📍</span>
                <span>Вы здесь</span>
              </div>
            )}
            <Link
              href={`/trainings/${courseType}/${day.trainingDayId}`}
              className={`${styles.link} ${day.isLocked ? styles.locked : ""}`}
              prefetch={false}
              onClick={(e) => {
                if (day.isLocked) {
                  e.preventDefault();
                  showLockedDayAlert();
                }
              }}
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
              <div className={`${styles.card} ${day.isLocked ? styles.locked : ""}`}>
                {day.isLocked && (
                  <div className={styles.lockBadge}>
                    <LockIcon className={styles.lockIcon} />
                    <span>Заблокировано</span>
                  </div>
                )}
                <div className={styles.titleWithLock}>
                  <h2 className={styles.dayTitle}>{day.title}</h2>
                </div>
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
