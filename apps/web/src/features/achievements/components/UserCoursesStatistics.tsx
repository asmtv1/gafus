"use client";

import { useUserStartedCourses } from "@shared/hooks/useUserCourses";
import { useUserProgressForCourses } from "@shared/hooks/useUserProgress";
import { TrainingStatus, type CourseWithProgressData } from "@gafus/types";
import { type UserDetailedProgress } from "@shared/lib/user/getUserProgress";
import Link from "next/link";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useMemo } from "react";

import styles from "./UserCoursesStatistics.module.css";

/**
 * Компонент для отображения детальной статистики по курсам пользователя
 */
export default function UserCoursesStatistics() {
  const { data: courses, error, isLoading } = useUserStartedCourses();
  
  // Получаем ID курсов для загрузки прогресса
  const courseIds = useMemo(() => {
    if (!courses || !Array.isArray(courses)) {
      return [];
    }
    return courses.map(course => course.id);
  }, [courses]);
  
  // Загружаем детальный прогресс для всех курсов
  const { data: progressMap, isLoading: progressLoading } = useUserProgressForCourses(courseIds);

  if (isLoading || progressLoading) {
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
        const userProgress = progressMap && typeof progressMap.get === 'function' 
          ? progressMap.get(course.id) 
          : null;
        return (
          <CourseStatisticsCard 
            key={course.id} 
            course={course} 
            userProgress={userProgress}
          />
        );
      })}
    </div>
  );
}

function CourseStatisticsCard({ 
  course, 
  userProgress 
}: { 
  course: CourseWithProgressData;
  userProgress?: UserDetailedProgress | null;
}) {
  // Вычисляем общее количество дней и шагов
  const totalDays = course.dayLinks?.length || 0;
  const totalSteps = course.dayLinks?.reduce((sum, dayLink) => sum + (dayLink.day?.stepLinks?.length || 0), 0) || 0;
  
  // Вычисляем реальный прогресс на основе userProgress
  const completedDays = userProgress?.days?.filter((day) => day.status === TrainingStatus.COMPLETED).length || 0;
  const completedSteps = userProgress?.days?.reduce((sum: number, day) => {
    return sum + (day.steps?.filter((step) => step.status === TrainingStatus.COMPLETED).length || 0);
  }, 0) || 0;
  
  const progressPercentage = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;
  const isCompleted = course.userStatus === TrainingStatus.COMPLETED;
  const isInProgress = course.userStatus === TrainingStatus.IN_PROGRESS;

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
            {course.userStatus === TrainingStatus.NOT_STARTED && "⏸️ Не начат"}
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
            const isCompleted = dayProgress?.status === TrainingStatus.COMPLETED;
            const isInProgress = dayProgress?.status === TrainingStatus.IN_PROGRESS;
            
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
            {completedDays} из {totalDays} дней
          </span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Шагов пройдено:</span>
          <span className={styles.statValue}>
            {completedSteps} из {totalSteps}
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
