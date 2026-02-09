"use client";

import { memo, useCallback, useEffect } from "react";
import Link from "next/link";

import { createWebLogger } from "@gafus/logger";
import { useCachedTrainingDays } from "@shared/hooks/useCachedTrainingDays";
import { useStepStatesForCourse } from "@shared/stores/stepStore";
import {
  calculateDayStatus,
  DAY_TYPE_LABELS,
  getDayDisplayStatus,
} from "@gafus/core/utils/training";
import { showLockedDayAlert, showPrivateCourseAccessDeniedAlert } from "@shared/utils/sweetAlert";
import { LockIcon } from "@shared/utils/muiImports";
import styles from "./TrainingDayList.module.css";

const logger = createWebLogger("TrainingDayList");

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

  const courseId =
    initialData?.courseId ??
    data?.courseId ??
    initialData?.trainingDays?.[0]?.courseId ??
    data?.trainingDays?.[0]?.courseId ??
    "";
  const stepStates = useStepStatesForCourse(courseId);

  // Добавляем в getItemClass динамику для цветов
  const getItemClass = useCallback((status: string, dayNumber: number) => {
    let baseClass = `${styles.item} ${styles[`day${dayNumber % 2 === 1 ? "Odd" : "Even"}`]}`;
    if (status === "IN_PROGRESS") baseClass += ` ${styles.inprogress}`;
    if (status === "COMPLETED") baseClass += ` ${styles.completed}`;
    if (status === "RESET") baseClass += ` ${styles.reset}`;
    return baseClass;
  }, []);

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

  return (
    <ul className={styles.list}>
      {displayData.trainingDays.map((day, index) => {
        if (process.env.NODE_ENV !== "production") {
          logger.debug("Day time", {
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
              const localStatus = calculateDayStatus(day.courseId, day.dayOnCourseId, stepStates);
              const finalStatus = getDayDisplayStatus(localStatus, day.userStatus);
              return getItemClass(finalStatus, index + 1);
            })()}
          >
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
                <p className={styles.subtitle}>({DAY_TYPE_LABELS[day.type] || day.type})</p>
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
