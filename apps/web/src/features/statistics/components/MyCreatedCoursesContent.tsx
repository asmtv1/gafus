"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import styles from "./MyCreatedCourses.module.css";

import type { AuthoredCourse } from "@gafus/types";

import { getUserProgress, type UserDetailedProgress } from "@/shared/lib/user";
import { shouldUsePriority } from "@/utils/imageLoading";

interface MyCreatedCoursesContentProps {
  course: AuthoredCourse;
  index?: number;
}

const statusLabels: Record<string, string> = {
  NOT_STARTED: "не начат",
  IN_PROGRESS: "в процессе прохождения",
  COMPLETED: "завершил",
};

const stepStatusLabels: Record<string, string> = {
  NOT_STARTED: "не начат",
  IN_PROGRESS: "в процессе",
  COMPLETED: "завершен",
};

// Вспомогательная функция для безопасного создания ключей
function createSafeKey(prefix: string, id: string | number, date?: Date | string | null): string {
  if (date) {
    const dateStr = typeof date === "string" ? date : date.toISOString();
    return `${prefix}-${id}-${dateStr}`;
  }
  return `${prefix}-${id}`;
}

// Хук для получения детального прогресса пользователя
function useUserProgress(courseId: string, userId: string) {
  const [progress, setProgress] = useState<UserDetailedProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProgress() {
      setLoading(true);
      setError(null);
      try {
        const data = await getUserProgress(courseId, userId);
        if (data) {
          setProgress(data);
        } else {
          setError("Прогресс пользователя не найден");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Произошла ошибка");
      } finally {
        setLoading(false);
      }
    }

    if (courseId && userId) {
      fetchProgress();
    }
  }, [courseId, userId]);

  return { progress, loading, error };
}

export default function MyCreatedCoursesContent({
  course,
  index = 0,
}: MyCreatedCoursesContentProps) {
  // Определяем стратегию загрузки изображений
  const usePriority = shouldUsePriority(index);

  // Обеспечиваем, что reviews всегда является массивом
  const reviews = course.reviews || [];

  return (
    <>
      <div className={styles.header}>
        <Image
          src={course.logoImg}
          alt={`${course.name} logo`}
          width={48}
          height={48}
          className={styles.logo}
          unoptimized
          priority={usePriority}
        />
        <h3 className={styles.title}>{course.name}</h3>
      </div>

      <div className={styles.stats}>
        <div>
          Всего участников: <span className={styles.statValue}>{course.totalStarted}</span>
        </div>
        <div>
          Завершили курс: <span className={styles.statValue}>{course.totalCompleted}</span>
        </div>
        <div>
          Рейтинг: <span className={styles.statValue}>{course.avgRating?.toFixed(1) ?? "–"}</span>
        </div>
        <div>
          Отзывов: <span className={styles.statValue}>{course.totalRatings}</span>
        </div>
      </div>

      <div className={styles.reviewsSection}>
        <h4 className={styles.subTitle}>Отзывы:</h4>
        {reviews.length ? (
          <ul className={styles.reviewList}>
            {reviews.map((rev, index) => {
              return (
                <li
                  key={createSafeKey("review", index, rev.createdAt)}
                  className={styles.reviewItem}
                >
                  <div className={styles.reviewHeader}>
                    <Image
                      src={rev.user.profile?.avatarUrl || "/uploads/avatar.svg"}
                      alt={`Аватар ${rev.user.username}`}
                      width={24}
                      height={24}
                      className={styles.reviewAvatar}
                      unoptimized
                      loading="lazy"
                    />
                    <strong className={styles.reviewUsername}>{rev.user.username}:</strong>
                  </div>
                  <div className={styles.reviewContent}>
                    {rev.comment || "Без комментария"}
                    {/* Улучшенная обработка рейтинга */}
                    {(() => {
                      if (rev.rating == null) return null;

                      const rating =
                        typeof rev.rating === "string" ? parseFloat(rev.rating) : rev.rating;

                      if (isNaN(rating) || rating < 1 || rating > 5) {
                        return null;
                      }

                      return (
                        <span className={styles.reviewRating}>(Рейтинг: {rating.toFixed(1)})</span>
                      );
                    })()}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.empty}>Нет отзывов</p>
        )}
      </div>

      <div className={styles.progressSection}>
        <h4 className={styles.subTitle}>Участники курса:</h4>
        {course.userProgress && course.userProgress.length > 0 ? (
          course.userProgress.map((userProgress) => (
            <UserProgressBlock
              key={userProgress.userId}
              userProgress={userProgress}
              courseId={course.id}
            />
          ))
        ) : (
          <p className={styles.empty}>Пока нет участников</p>
        )}
      </div>
    </>
  );
}

// Компонент для отображения прогресса конкретного пользователя
function UserProgressBlock({
  userProgress,
  courseId,
}: {
  userProgress: AuthoredCourse["userProgress"][0];
  courseId: string;
}) {
  const { progress, loading, error } = useUserProgress(courseId, userProgress.userId);
  const [isExpanded, setIsExpanded] = useState(false);

  // Фильтруем дни, показывая только те, где есть пройденные шаги
  const activeDays =
    progress?.days.filter((day) => {
      // Проверяем, есть ли активные шаги в дне
      const hasActiveSteps = day.steps.some(
        (step) => step.status === "IN_PROGRESS" || step.status === "COMPLETED",
      );

      // Показываем день только если есть активные шаги
      return hasActiveSteps;
    }) || [];

  // Фильтруем шаги, показывая только те, с которыми пользователь взаимодействовал
  const getActiveSteps = (day: UserDetailedProgress["days"][0]) => {
    return day.steps.filter((step) => step.status === "IN_PROGRESS" || step.status === "COMPLETED");
  };

  const hasActiveProgress = activeDays.length > 0;

  return (
    <div className={styles.userBlock}>
      <div className={styles.userHeader} onClick={() => setIsExpanded(!isExpanded)}>
        <div className={styles.userInfo}>
          <Image
            src={userProgress.avatarUrl || "/uploads/avatar.svg"}
            alt={`Аватар ${userProgress.username}`}
            width={32}
            height={32}
            className={styles.userAvatar}
            unoptimized
            loading="lazy"
          />
          <span className={styles.userName}>{userProgress.username}</span>
        </div>

        <div className={styles.userStatus}>
          {/* Определяем корректный статус на основе данных */}
          {(() => {
            let displayStatus: string = "NOT_STARTED";
            let statusLabel = statusLabels["NOT_STARTED"];

            // Корректируем статус, если есть дата начала, но статус "не начат" - значит пользователь начал курс
            if (userProgress.startedAt) {
              displayStatus = "IN_PROGRESS";
              statusLabel = "в процессе";
            }

            if (userProgress.completedAt) {
              displayStatus = "COMPLETED";
              statusLabel = "завершил";
            }

            return (
              <>
                Статус:{" "}
                <span className={`${styles.statusTag} ${styles[`status${displayStatus}`]}`}>
                  {statusLabel}
                </span>
              </>
            );
          })()}

          {/* Показываем даты в зависимости от статуса */}
          {userProgress.startedAt && (
            <span className={styles.userDate}>
              Начал:{" "}
              {(() => {
                const startedAt = userProgress.startedAt;
                if (startedAt instanceof Date) {
                  return startedAt.toLocaleDateString("ru-RU");
                } else if (typeof startedAt === "string") {
                  const date = new Date(startedAt);
                  return isNaN(date.getTime()) ? startedAt : date.toLocaleDateString("ru-RU");
                }
                return "";
              })()}
            </span>
          )}
          {userProgress.completedAt && (
            <span className={styles.userDate}>
              Завершил:{" "}
              {(() => {
                const completedAt = userProgress.completedAt;
                if (completedAt instanceof Date) {
                  return completedAt.toLocaleDateString("ru-RU");
                } else if (typeof completedAt === "string" && completedAt) {
                  const date = new Date(completedAt);
                  return isNaN(date.getTime()) ? completedAt : date.toLocaleDateString("ru-RU");
                }
                return "";
              })()}
            </span>
          )}
        </div>

        <div className={styles.expandIcon}>{isExpanded ? "▼" : "▶"}</div>
      </div>

      {/* Детальный прогресс по дням (скрыт в accordion) */}
      {isExpanded && (
        <div className={styles.detailsContent}>
          {loading && <div className={styles.loading}>Загрузка прогресса...</div>}
          {error && <div className={styles.error}>Ошибка загрузки: {error}</div>}

          {progress && hasActiveProgress ? (
            <div className={styles.daysProgress}>
              <h5 className={styles.daysTitle}>Дни с активным прогрессом:</h5>
              <div className={styles.daysList}>
                {activeDays.map((day) => {
                  const activeSteps = getActiveSteps(day);

                  return (
                    <div key={day.dayOrder} className={styles.dayBlock}>
                      <div className={styles.dayHeader}>
                        <span className={styles.dayNumber}>День {day.dayOrder}</span>
                        <span className={styles.dayTitle}>{day.dayTitle}</span>
                        <span className={`${styles.dayStatus} ${styles[`status${day.status}`]}`}>
                          {statusLabels[day.status]}
                        </span>
                        {day.status === "COMPLETED" &&
                        (day as { dayCompletedAt?: unknown }).dayCompletedAt ? (
                          <span className={styles.userDate}>
                            Завершен:{" "}
                            {(() => {
                              const completedAt = (day as { dayCompletedAt?: unknown })
                                .dayCompletedAt;
                              if (completedAt instanceof Date) {
                                return completedAt.toLocaleDateString("ru-RU");
                              } else if (typeof completedAt === "string") {
                                const date = new Date(completedAt);
                                return isNaN(date.getTime())
                                  ? completedAt
                                  : date.toLocaleDateString("ru-RU");
                              }
                              return "";
                            })()}
                          </span>
                        ) : null}
                      </div>

                      {/* Показываем только активные шаги */}
                      {activeSteps.length > 0 && (
                        <div className={styles.stepsProgress}>
                          <div className={styles.stepsList}>
                            {activeSteps.map((step) => (
                              <div key={step.stepOrder} className={styles.stepItem}>
                                <span className={styles.stepTitle}>{step.stepTitle}</span>
                                <span
                                  className={`${styles.stepStatus} ${styles[`stepStatus${step.status}`]}`}
                                >
                                  {stepStatusLabels[step.status]}
                                </span>
                                {step.completedAt && (
                                  <span className={styles.stepCompletedAt}>
                                    Завершен:{" "}
                                    {(() => {
                                      const completedAt = step.completedAt;
                                      if (typeof completedAt === "string") {
                                        return completedAt;
                                      } else if (completedAt instanceof Date) {
                                        return completedAt.toLocaleString("ru-RU");
                                      }
                                      return "";
                                    })()}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : progress && !hasActiveProgress ? (
            <div className={styles.empty}>Пользователь еще не начал проходить курс</div>
          ) : null}
        </div>
      )}
    </div>
  );
}
