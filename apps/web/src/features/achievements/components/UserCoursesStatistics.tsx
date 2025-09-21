"use client";

import { useCourseStore, useCourseStoreActions } from "@shared/stores/courseStore";
import { useStepStore } from "@shared/stores/stepStore";
import { useCourseProgressSync } from "@shared/hooks/useCourseProgressSync";
import { TrainingStatus, type CourseWithProgressData } from "@gafus/types";
import { type UserDetailedProgress } from "@shared/lib/user/getUserProgress";
import Link from "next/link";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useMemo, useEffect } from "react";

import styles from "./UserCoursesStatistics.module.css";

/**
 * Компонент для отображения детальной статистики по курсам пользователя
 */
export default function UserCoursesStatistics() {
  const { allCourses, loading, errors } = useCourseStore();
  const { fetchAllCourses } = useCourseStoreActions();
  const { syncedCourses, isAssigned, getCachedData } = useCourseProgressSync();
  
  // Получаем курсы с прогрессом из стора (используем синхронизированные данные)
  const courses = useMemo(() => {
    const coursesData = syncedCourses || allCourses?.data;
    if (!coursesData) return [];
    return coursesData.filter(course => course.userStatus !== "NOT_STARTED");
  }, [syncedCourses, allCourses?.data]);
  
  // Получаем ID курсов для загрузки детального прогресса (не используется, но оставляем для совместимости)
  const _courseIds = useMemo(() => {
    return courses.map(course => course.id);
  }, [courses]);
  
  // Убираем загрузку с сервера - используем только данные из stores
  
  
  // Получаем данные из stepStore для подсчета завершенных шагов
  const stepStates = useStepStore((state) => state.stepStates);
  const getStepKey = useStepStore((state) => state.getStepKey);
  
  // Получаем кэшированные данные дней тренировок из trainingStore
  const cachedTrainingData = useMemo(() => {
    const data: Record<string, {
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
    }> = {};
    courses.forEach(course => {
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
        <p>Начните изучение любого курса, чтобы увидеть здесь детальную статистику вашего прогресса.</p>
        <Link href="/courses" className={styles.browseCoursesButton}>
          Выбрать курс
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.coursesList}>
      {courses.map((course) => {
        // Используем только данные из кэшированного trainingStore
        const userProgress = null; // Не используем данные с сервера
        
        // Получаем кэшированные данные дней тренировок
        const cachedData = cachedTrainingData[course.id];
        
        return (
          <CourseStatisticsCard 
            key={course.id} 
            course={course as CourseWithProgressData} 
            userProgress={userProgress}
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
  userProgress,
  cachedTrainingData,
  isAssigned,
  stepStates,
  getStepKey
}: { 
  course: CourseWithProgressData;
  userProgress?: UserDetailedProgress | null;
  cachedTrainingData?: {
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
  };
  isAssigned?: boolean;
  stepStates: Record<string, { status: string; isFinished: boolean; timeLeft: number; isPaused: boolean }>;
  getStepKey: (courseId: string, day: number, stepIndex: number) => string;
}) {
  // Вычисляем общее количество дней и шагов
  const totalDays = course.dayLinks?.length || 0;
  const totalSteps = course.dayLinks?.reduce((sum, dayLink) => sum + (dayLink.day?.stepLinks?.length || 0), 0) || 0;
  
  // Используем только кэшированные данные из trainingStore
  const completedDaysFromUserProgress = 0; // Не используем данные с сервера
  const completedStepsFromUserProgress = 0; // Не используем данные с сервера
  
  // Используем данные из stepStore для точного подсчета завершенных шагов
  const cachedProgress = useMemo(() => {
    if (!cachedTrainingData?.trainingDays) return { 
      completedDays: 0, 
      completedSteps: 0 
    };
    
    const completedDaysFromCache = cachedTrainingData.trainingDays.filter(
      (day) => day.userStatus === TrainingStatus.COMPLETED
    ).length;
    
    // Если курс завершен, но в кэше нет данных о завершенных днях, 
    // считаем все дни завершенными
    let finalCompletedDays = completedDaysFromCache;
    if (course.userStatus === TrainingStatus.COMPLETED && completedDaysFromCache === 0 && totalDays > 0) {
      finalCompletedDays = totalDays;
    }
    
    // Дополнительная проверка: если курс завершен, но кэш показывает меньше дней,
    // чем общее количество, используем общее количество
    if (course.userStatus === TrainingStatus.COMPLETED && completedDaysFromCache < totalDays && totalDays > 0) {
      finalCompletedDays = totalDays;
    }
    
    // Подсчитываем реальные завершенные шаги из stepStore
    let completedStepsFromStepStore = 0;
    if (course.dayLinks) {
      course.dayLinks.forEach((dayLink, dayIndex) => {
        if (dayLink.day?.stepLinks) {
          dayLink.day.stepLinks.forEach((stepLink, stepIndex) => {
            // Используем dayIndex + 1 вместо parseInt(dayLink.day!.id)
            const stepKey = getStepKey(course.id, dayIndex + 1, stepIndex);
            const stepState = stepStates[stepKey];
            if (stepState && stepState.status === TrainingStatus.COMPLETED) {
              completedStepsFromStepStore++;
            }
          });
        }
      });
    }
    
    
    return {
      completedDays: finalCompletedDays,
      completedSteps: completedStepsFromStepStore
    };
  }, [cachedTrainingData, course.id, course.dayLinks, stepStates, getStepKey]);
  
  const finalCompletedDays = cachedProgress.completedDays;
  const finalCompletedSteps = cachedProgress.completedSteps;
  
  
  const progressPercentage = totalDays > 0 ? Math.round((finalCompletedDays / totalDays) * 100) : 0;
  const isCompleted = course.userStatus === TrainingStatus.COMPLETED;
  const isInProgress = course.userStatus === TrainingStatus.IN_PROGRESS || isAssigned;

  return (
    <div className={`${styles.courseCard} ${isCompleted ? styles.completed : ''} ${isInProgress ? styles.inProgress : ''}`}>
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
            {!isCompleted && !isInProgress && course.userStatus === TrainingStatus.NOT_STARTED && "⏸️ Не начат"}
          </span>
        </div>
      </div>

      <div className={styles.progressSection}>
        <div className={styles.progressBar}>
          <div 
            className={styles.progressFill} 
            style={{ width: `${progressPercentage}%` }}
          ></div>
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
            const dayProgress = userProgress?.days?.find((day) => day.dayOrder === dayNumber);
            
            // Проверяем также кэшированные данные
            const cachedDay = cachedTrainingData?.trainingDays?.find(
              (day) => day.day === dayNumber
            );
            
            // Используем ту же логику, что и для подсчета завершенных дней
            let isCompleted = dayProgress?.status === TrainingStatus.COMPLETED || 
              cachedDay?.userStatus === TrainingStatus.COMPLETED;
            
            // Если курс завершен, но кэш не показывает завершенный день, считаем день завершенным
            if (course.userStatus === TrainingStatus.COMPLETED && !isCompleted) {
              isCompleted = true;
            }
            
            const isInProgress = dayProgress?.status === TrainingStatus.IN_PROGRESS ||
              cachedDay?.userStatus === TrainingStatus.IN_PROGRESS;
            
            return (
              <div 
                key={dayNumber}
                className={`${styles.dayCircle} ${
                  isCompleted ? styles.completed : 
                  isInProgress ? styles.inProgress : 
                  styles.pending
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
            {course.startedAt ? format(new Date(course.startedAt), "dd MMMM yyyy", { locale: ru }) : "Не указано"}
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
          <Link 
            href={`/trainings/${course.type}`}
            className={styles.continueButton}
          >
            Продолжить обучение
          </Link>
        )}
        
        {!isCompleted && (
          <Link 
            href={`/trainings/${course.type}`}
            className={styles.viewButton}
          >
            Посмотреть курс
          </Link>
        )}
      </div>
    </div>
  );
}
