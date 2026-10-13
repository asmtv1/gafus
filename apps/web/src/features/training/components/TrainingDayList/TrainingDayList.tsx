"use client";

import { LoadingState } from "@/shared/components/ui/LoadingState";

import { trackEvent } from "@gafus/analytics";
import { memo, useCallback, useEffect, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { createWebLogger } from "@gafus/logger";
import { useCachedTrainingDays } from "@shared/hooks/useCachedTrainingDays";
import { useStepStatesForCourse } from "@shared/stores/stepStore";
import {
  calculateDayStatus,
  DAY_TYPE_LABELS,
  getDayDisplayStatus,
  type StepStates,
} from "@gafus/core/utils/training";
import { showLockedDayAlert, showPrivateCourseAccessDeniedAlert } from "@shared/utils/sweetAlert";
import { LockIcon } from "@shared/utils/muiImports";
import styles from "./TrainingDayList.module.css";

const logger = createWebLogger("TrainingDayList");

/** Course records may still contain the legacy "День N" title. Keep it as display-only copy. */
const getBlockTitle = (title: string) => title.replace(/^День\s+(?=\d)/i, "Блок ");

interface TrainingDayListDay {
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
}

interface TrainingDayListProps {
  courseType: string;
  initialData?: {
    trainingDays: TrainingDayListDay[];
    courseDescription: string | null;
    courseId: string | null;
    courseVideoUrl: string | null;
  } | null;
  initialError?: string | null;
}

interface TrainingDayListDayItemProps {
  courseType: string;
  day: TrainingDayListDay;
  dayNumber: number;
  pathname: string;
  stepStates: StepStates;
}

const TrainingDayListDayItem = memo(function TrainingDayListDayItem({
  courseType,
  day,
  dayNumber,
  pathname,
  stepStates,
}: TrainingDayListDayItemProps) {
  if (process.env.NODE_ENV !== "production") {
    logger.debug("Day time", {
      dayOnCourseId: day.dayOnCourseId,
      title: day.title,
      estimatedDuration: day.estimatedDuration,
      theoryMinutes: day.theoryMinutes,
      type: day.type,
    });
  }

  const localStatus = calculateDayStatus(day.courseId, day.dayOnCourseId, stepStates);
  const finalStatus = getDayDisplayStatus(localStatus, day.userStatus);
  const itemClassName = [
    styles.item,
    finalStatus === "IN_PROGRESS" && styles.inprogress,
    finalStatus === "COMPLETED" && styles.completed,
    finalStatus === "RESET" && styles.reset,
  ]
    .filter(Boolean)
    .join(" ");
  const statusLabel =
    finalStatus === "COMPLETED"
      ? "Пройден"
      : finalStatus === "IN_PROGRESS"
        ? "В процессе"
        : finalStatus === "RESET"
          ? "Сброшен"
          : finalStatus === "PAUSED"
            ? "На паузе"
            : "Не начат";
  const equipment = day.equipment?.trim();
  const hasEquipment = Boolean(equipment && equipment !== "-");
  const displayTitle = getBlockTitle(day.title);

  const handleLinkClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (day.isLocked) {
        e.preventDefault();
        trackEvent({
          eventName: "button_click",
          platform: "web",
          pathOrScreen: pathname,
          elementId: "course-day-locked-click",
          courseType,
          courseId: day.courseId,
        });
        showLockedDayAlert();
        return;
      }
      trackEvent({
        eventName: "button_click",
        platform: "web",
        pathOrScreen: pathname,
        elementId: "course-day-open-click",
        courseType,
        courseId: day.courseId,
      });
    },
    [courseType, day.courseId, day.isLocked, pathname],
  );

  return (
    <li className={itemClassName}>
      <Link
        href={"/trainings/" + courseType + "/" + day.trainingDayId}
        className={[styles.link, day.isLocked && styles.locked].filter(Boolean).join(" ")}
        prefetch={false}
        onClick={handleLinkClick}
        aria-disabled={day.isLocked || undefined}
      >
        <div className={styles.card}>
          <div className={styles.cardMeta}>
            <span className={styles.blockNumber}>Блок {String(dayNumber).padStart(2, "0")}</span>
            <span className={[styles.statusBadge, day.isLocked && styles.lockBadge].filter(Boolean).join(" ")}>
              {day.isLocked && <LockIcon className={styles.lockIcon} aria-hidden="true" />}
              {day.isLocked ? "Закрыт" : statusLabel}
            </span>
          </div>

          <h2 className={styles.dayTitle}>{displayTitle}</h2>
          <p className={styles.subtitle}>{DAY_TYPE_LABELS[day.type] || day.type}</p>

          {hasEquipment && (
            <p className={styles.equipment}>
              <span className={styles.equipmentLabel}>Понадобится: </span>
              {equipment}
            </p>
          )}

          <div className={styles.cardFooter}>
            <div className={styles.durationRow}>
              {(day.estimatedDuration ?? 0) > 0 && (
                <span className={styles.durationPractice}>
                  Практика · {day.estimatedDuration} мин
                </span>
              )}
              {(day.theoryMinutes ?? 0) > 0 && (
                <span className={styles.durationTheory}>
                  Теория · {day.theoryMinutes} мин
                </span>
              )}
            </div>
            <span className={styles.actionArrow} aria-hidden="true">→</span>
          </div>
        </div>
      </Link>
    </li>
  );
});

const TrainingDayList = memo(function TrainingDayList({
  courseType,
  initialData,
  initialError,
}: TrainingDayListProps) {
  const pathname = usePathname() ?? `/trainings/${courseType}`;
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
      <LoadingState message="Загрузка дней тренировок…" />
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
      {displayData.trainingDays.map((day, index) => (
        <TrainingDayListDayItem
          key={`${day.courseId}-${day.dayOnCourseId}`}
          courseType={courseType}
          day={day}
          dayNumber={index + 1}
          pathname={pathname}
          stepStates={stepStates}
        />
      ))}
    </ul>
  );
});

export default TrainingDayList;
