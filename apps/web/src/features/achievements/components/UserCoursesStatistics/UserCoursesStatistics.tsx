"use client";

import { format } from "date-fns";
import { ru } from "date-fns/locale";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

import { reportClientError } from "@gafus/error-handling";
import { TrainingStatus, type CourseWithProgressData } from "@gafus/types";

import { useCourseProgressSync } from "@shared/hooks/useCourseProgressSync";
import { getUserProgress, type UserDetailedProgress } from "@shared/lib/user/getUserProgress";
import { useCourseStore, useCourseStoreActions } from "@shared/stores/courseStore";
import { useStepStore } from "@shared/stores/stepStore";

import styles from "./UserCoursesStatistics.module.css";

function useSelfCourseProgress(courseId: string, userId?: string) {
  const [progress, setProgress] = useState<UserDetailedProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchProgress() {
      if (!courseId || !userId) return;

      setLoading(true);
      setError(null);
      try {
        const data = await getUserProgress(courseId, userId, { readOnly: true });
        if (!cancelled) {
          setProgress(data);
        }
      } catch (err) {
        reportClientError(err, {
          issueKey: "UserCoursesStatistics",
          keys: { operation: "fetch_course_progress" },
        });
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Не удалось загрузить прогресс");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchProgress();

    return () => {
      cancelled = true;
    };
  }, [courseId, userId]);

  return { progress, loading, error };
}

/**
 * Компонент для отображения детальной статистики по курсам пользователя
 */
export default function UserCoursesStatistics() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id as string | undefined;
  const { allCourses, loading, errors } = useCourseStore();
  const { fetchAllCourses } = useCourseStoreActions();
  const { syncedCourses, isAssigned, getCachedData } = useCourseProgressSync();

  // Получаем курсы с прогрессом из стора (используем синхронизированные данные)
  const courses = useMemo(() => {
    const coursesData = syncedCourses || allCourses?.data;
    if (!coursesData) return [];
    return coursesData.filter((course) => course.userStatus !== "NOT_STARTED");
  }, [syncedCourses, allCourses?.data]);

  // Получаем ID курсов для загрузки детального прогресса (не используется, но оставляем для совместимости)
  const _courseIds = useMemo(() => {
    return courses.map((course) => course.id);
  }, [courses]);

  // Убираем загрузку с сервера - используем только данные из stores

  // Получаем данные из stepStore для подсчета завершенных шагов
  const stepStates = useStepStore((state) => state.stepStates);
  const getStepKey = useStepStore((state) => state.getStepKey);

  // Получаем кэшированные данные дней тренировок из trainingStore
  const cachedTrainingData = useMemo(() => {
    const data: Record<
      string,
      {
        trainingDays: {
          dayOnCourseId: string;
          title: string;
          type: string;
          courseId: string;
          userStatus: string;
        }[];
        courseDescription: string | null;
        courseId: string | null;
        courseVideoUrl: string | null;
      }
    > = {};
    courses.forEach((course) => {
      const cached = getCachedData(course.type);
      if (cached.data && !cached.isExpired) {
        data[course.id] = cached.data;
      }
    });
    return data;
  }, [courses, getCachedData]);

  // Загружаем данные при первом рендере, если их нет в кэше
  useEffect(() => {
    if (!allCourses?.data && !loading.all) {
      fetchAllCourses("with-progress");
    }
  }, [allCourses?.data, loading.all, fetchAllCourses]);

  // Состояние загрузки и ошибок
  const isLoading = loading.all;
  const error = errors.all;

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingSpinner}></div>
        <p>Загрузка статистики курсов...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        <div className={styles.errorIcon}>⚠️</div>
        <h3>Ошибка загрузки</h3>
        <p>Не удалось загрузить статистику курсов. Попробуйте обновить страницу.</p>
      </div>
    );
  }

  if (!courses || courses.length === 0) {
    return (
      <div className={styles.noCourses}>
        <div className={styles.noCoursesIcon}>📚</div>
        <h3>Пока нет начатых курсов</h3>
        <p>
          Начните изучение любого курса, чтобы увидеть здесь детальную статистику вашего прогресса.
        </p>
        <Link href="/courses" className={styles.browseCoursesButton}>
          Выбрать курс
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.coursesList}>
      {courses.map((course) => {
        // Получаем кэшированные данные дней тренировок
        const cachedData = cachedTrainingData[course.id];

        return (
          <CourseStatisticsCard
            key={course.id}
            course={course as CourseWithProgressData}
            currentUserId={currentUserId}
            cachedTrainingData={cachedData}
            isAssigned={isAssigned(course.id)}
            stepStates={stepStates}
            getStepKey={getStepKey}
          />
        );
      })}
    </div>
  );
}

function CourseStatisticsCard({
  course,
  currentUserId,
  cachedTrainingData,
  isAssigned,
  stepStates,
  getStepKey,
}: {
  course: CourseWithProgressData;
  currentUserId?: string;
  cachedTrainingData?: {
    trainingDays: {
      dayOnCourseId: string;
      title: string;
      type: string;
      courseId: string;
      userStatus: string;
    }[];
    courseDescription: string | null;
    courseId: string | null;
    courseVideoUrl: string | null;
  };
  isAssigned?: boolean;
  stepStates: Record<
    string,
    { status: string; isFinished: boolean; timeLeft: number; isPaused: boolean }
  >;
  getStepKey: (courseId: string, dayOnCourseId: string, stepIndex: number) => string;
}) {
  // Вычисляем общее количество дней и шагов
  const totalDays = course.dayLinks?.length || 0;
  const totalSteps =
    course.dayLinks?.reduce((sum, dayLink) => sum + (dayLink.day?.stepLinks?.length || 0), 0) || 0;

  const { progress } = useSelfCourseProgress(course.id, currentUserId);

  // Используем данные из stepStore для точного подсчета завершенных шагов
  const cachedProgress = useMemo(() => {
    const trainingDays = cachedTrainingData?.trainingDays ?? [];

    const completedDaysFromCache = trainingDays.filter(
      (day) => day.userStatus === TrainingStatus.COMPLETED,
    ).length;

    let finalCompletedDays = completedDaysFromCache;

    if (course.userStatus === TrainingStatus.COMPLETED && totalDays > 0) {
      finalCompletedDays = totalDays;
    }

    let completedStepsFromStepStore = 0;
    if (course.dayLinks) {
      course.dayLinks.forEach((dayLink, dayIndex) => {
        if (dayLink.day?.stepLinks) {
          // Находим dayOnCourseId из кэшированных данных по индексу
          const cachedDay = cachedTrainingData?.trainingDays?.[dayIndex];
          const dayOnCourseId = cachedDay?.dayOnCourseId || `${course.id}-day-${dayIndex}`;
          dayLink.day.stepLinks.forEach((_, stepIndex) => {
            const stepKey = getStepKey(course.id, dayOnCourseId, stepIndex);
            const stepState = stepStates[stepKey];
            if (stepState && stepState.status === TrainingStatus.COMPLETED) {
              completedStepsFromStepStore++;
            }
          });
        }
      });
    }

    const completedDaysFromServer = progress
      ? progress.days.filter((day) => day.status === TrainingStatus.COMPLETED).length
      : null;

    const completedStepsFromServer = progress
      ? progress.days.reduce((sum, day) => {
          return sum + day.steps.filter((step) => step.status === TrainingStatus.COMPLETED).length;
        }, 0)
      : null;

    return {
      completedDays: completedDaysFromServer ?? finalCompletedDays,
      completedSteps: completedStepsFromServer ?? completedStepsFromStepStore,
    };
  }, [
    cachedTrainingData,
    course.dayLinks,
    course.id,
    course.userStatus,
    getStepKey,
    progress,
    stepStates,
    totalDays,
  ]);

  const finalCompletedDays = cachedProgress.completedDays;
  const finalCompletedSteps = cachedProgress.completedSteps;

  const progressPercentage = totalDays > 0 ? Math.round((finalCompletedDays / totalDays) * 100) : 0;
  const isCompleted = course.userStatus === TrainingStatus.COMPLETED;
  const isInProgress = course.userStatus === TrainingStatus.IN_PROGRESS || isAssigned;

  return (
    <div
      className={`${styles.courseCard} ${isCompleted ? styles.completed : ""} ${isInProgress ? styles.inProgress : ""}`}
    >
      <div className={styles.courseHeader}>
        <div className={styles.courseInfo}>
          <h3 className={styles.courseTitle}>{course.name}</h3>
          <p className={styles.courseDescription}>{course.description}</p>
        </div>
        <div className={styles.courseMeta}>
          <span className={styles.author}>Автор: {course.authorUsername}</span>
          <span className={styles.status}>
            {isCompleted && "✅ Завершен"}
            {isInProgress && "🔄 В процессе"}
            {!isCompleted &&
              !isInProgress &&
              course.userStatus === TrainingStatus.NOT_STARTED &&
              "⏸️ Не начат"}
          </span>
        </div>
      </div>

      <div className={styles.progressSection}>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progressPercentage}%` }}></div>
        </div>
        <span className={styles.progressText}>{progressPercentage}%</span>
      </div>

      <div className={styles.daysTracker}>
        <div className={styles.trackerHeader}>
          <div className={styles.calendarIcon}>📅</div>
          <h4 className={styles.trackerTitle}>Трекер занятий</h4>
        </div>
        <div className={styles.daysGrid}>
          {Array.from({ length: totalDays }, (_, index) => {
            const dayNumber = index + 1;
            const dayProgress = progress?.days?.find((day) => day.dayOrder === dayNumber);

            // Проверяем также кэшированные данные
            // Находим день по индексу в массиве (так как порядок сохранен)
            const cachedDay = cachedTrainingData?.trainingDays?.[index];

            // Используем ту же логику, что и для подсчета завершенных дней
            let isCompleted =
              dayProgress?.status === TrainingStatus.COMPLETED ||
              cachedDay?.userStatus === TrainingStatus.COMPLETED;

            // Если курс завершен, но кэш не показывает завершенный день, считаем день завершенным
            if (course.userStatus === TrainingStatus.COMPLETED && !isCompleted) {
              isCompleted = true;
            }

            const isInProgress =
              dayProgress?.status === TrainingStatus.IN_PROGRESS ||
              cachedDay?.userStatus === TrainingStatus.IN_PROGRESS;

            return (
              <div
                key={dayNumber}
                className={`${styles.dayCircle} ${
                  isCompleted ? styles.completed : isInProgress ? styles.inProgress : styles.pending
                }`}
              >
                {isCompleted ? (
                  <span className={styles.checkmark}>✓</span>
                ) : (
                  <span className={styles.dayNumber}>{dayNumber}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.courseStats}>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Прогресс:</span>
          <span className={styles.statValue}>
            {finalCompletedDays} из {totalDays} дней
          </span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Шагов пройдено:</span>
          <span className={styles.statValue}>
            {finalCompletedSteps} из {totalSteps}
          </span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Начат:</span>
          <span className={styles.statValue}>
            {course.startedAt
              ? format(new Date(course.startedAt), "dd MMMM yyyy", { locale: ru })
              : "Не указано"}
          </span>
        </div>
        {isCompleted && course.completedAt && (
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Завершен:</span>
            <span className={styles.statValue}>
              {format(new Date(course.completedAt), "dd MMMM yyyy", { locale: ru })}
            </span>
          </div>
        )}
      </div>

      <div className={styles.courseActions}>
        {isInProgress && (
          <Link href={`/trainings/${course.type}`} className={styles.continueButton}>
            Продолжить обучение
          </Link>
        )}

        {!isCompleted && (
          <Link href={`/trainings/${course.type}`} className={styles.viewButton}>
            Посмотреть курс
          </Link>
        )}
      </div>
    </div>
  );
}
